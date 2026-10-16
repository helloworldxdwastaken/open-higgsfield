import { createHash, randomUUID } from "node:crypto";
import { IMAGE_CAPABILITIES, type ImageModelCapability } from "@/models/capabilities/image";
import { VIDEO_CAPABILITIES } from "@/models/capabilities/video";
import type { ModelCapabilities } from "@/models/capabilities/types";
import type { CanonicalParams } from "@/models/canonical";
import type { CinemaGeneration, CinemaGenerationRecord, CinemaProject, CinemaShot } from "@/types/cinema";
import { getCinemaProject, mutateCinemaProject } from "@/lib/cinema-store";
import { connectionStatus } from "@/lib/connections";
import { createShotPlan, type DirectorEngine } from "@/lib/director";
import { submitGeneration } from "@/lib/generation-service";
import { getStore, initStore } from "@/lib/task-store";
import { catalogCapability, openRouterCatalog } from "@/lib/provider-catalog";

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const active = new Set(["submitting", "uncertain"]);
export interface CinemaGenerateInput {
    projectId: string;
    shotId: string;
    version: number;
    requestId: string;
    mediaType: "image" | "video";
    engine: "catalog" | "openrouter" | "drawthings";
    modelId: string;
    duration?: string;
    resolution?: string;
}
function projectRequired(project: CinemaProject | undefined): CinemaProject {
    if (!project) throw new Error("ERR_CINEMA_NOT_FOUND");
    return project;
}
function shotRequired(project: CinemaProject, id: string): CinemaShot {
    const shot = project.shots.find(entry => entry.id === id);
    if (!shot) throw new Error("ERR_CINEMA_SHOT_NOT_FOUND");
    return shot;
}
function validateGenerate(input: CinemaGenerateInput) {
    if (!input || typeof input.projectId !== "string" || !uuid.test(input.projectId) || typeof input.shotId !== "string" || !uuid.test(input.shotId) || typeof input.requestId !== "string" || !uuid.test(input.requestId) || !Number.isSafeInteger(input.version) || input.version < 1 ||
        !["image", "video"].includes(input.mediaType) || !["catalog", "openrouter", "drawthings"].includes(input.engine) || typeof input.modelId !== "string" || !/^[a-zA-Z0-9._:/-]{1,200}$/.test(input.modelId) ||
        [input.duration, input.resolution].some(value => value !== undefined && (typeof value !== "string" || !value || value.length > 40))) throw new Error("ERR_CINEMA_VALIDATION");
}
export function cinemaPrompt(shot: CinemaShot): string {
    return [shot.prompt.trim(), shot.camera && `Camera direction: ${shot.camera}.`, shot.lens && `Lens and framing: ${shot.lens}.`, shot.lighting && `Lighting: ${shot.lighting}.`, shot.notes && `Continuity and sound direction: ${shot.notes}.`].filter(Boolean).join("\n");
}
function fingerprint(project: CinemaProject, shot: CinemaShot, input: CinemaGenerateInput) {
    return createHash("sha256").update(JSON.stringify({ shotId: shot.id, mediaType: input.mediaType, engine: input.engine, modelId: input.modelId,
        duration: input.duration ?? null, resolution: input.resolution ?? null, aspectRatio: project.aspectRatio, prompt: cinemaPrompt(shot) })).digest("hex");
}
async function capabilities(input: CinemaGenerateInput): Promise<ModelCapabilities> {
    if (input.engine === "catalog") {
        const caps = (input.mediaType === "image" ? IMAGE_CAPABILITIES : VIDEO_CAPABILITIES)[input.modelId];
        if (!caps) throw new Error("ERR_CINEMA_MODEL_NOT_FOUND");
        return caps;
    }
    if (input.engine === "openrouter") {
        const model = (await openRouterCatalog(input.mediaType)).find(entry => entry.id === input.modelId);
        if (!model || model.vectorOnly || model.sourceVideoWorkflow || model.minReferences > 0) throw new Error("ERR_CINEMA_TEXT_MODEL_REQUIRED");
        return catalogCapability(model);
    }
    if (input.mediaType !== "image" || !["current", "draw-things__current"].includes(input.modelId)) throw new Error("ERR_CINEMA_TEXT_MODEL_REQUIRED");
    return { id: "draw-things__current", label: "Draw Things current settings", family: "Draw Things", variant: "", group: "Local engines", provider: "draw-things", provider_model_id: "current", provider_mode: "image-model", prompt_required: true,
        duration: false, aspect_ratio: false, size: false, resolution_variant: false, negative_prompt: false, cfg_scale: false, style: false, shot_type: false, prompt_expansion: false, elements: false, media_slots: [], custom_fields: [] };
}
const ratioAliases: Record<string, string[]> = {
    "16:9": ["16:9", "widescreen_16_9", "landscape_16_9"], "9:16": ["9:16", "social_story_9_16", "portrait_9_16"],
    "1:1": ["1:1", "square_1_1", "square_hd", "square"], "4:3": ["4:3", "classic_4_3", "landscape_4_3"],
    "3:4": ["3:4", "traditional_3_4", "portrait_3_4"], "21:9": ["21:9", "cinematic_21_9"],
};
export function cinemaParams(project: CinemaProject, shot: CinemaShot, input: CinemaGenerateInput, caps: ModelCapabilities): CanonicalParams {
    if (caps.prompt_supported === false || caps.media_slots.some(slot => slot.required)) throw new Error("ERR_CINEMA_TEXT_MODEL_REQUIRED");
    const prompt = cinemaPrompt(shot);
    if (!shot.prompt.trim()) throw new Error("ERR_CINEMA_PROMPT_REQUIRED");
    if (prompt.length > (caps.prompt_max || 10000)) throw new Error("ERR_CINEMA_PROMPT_TOO_LONG");
    const params: CanonicalParams = { model_id: caps.id, prompt, field_values: Object.fromEntries(caps.custom_fields.filter(field => field.default !== undefined).map(field => [field.id, field.default])) };
    if (input.duration && !caps.duration) throw new Error("ERR_CINEMA_DURATION_UNSUPPORTED");
    if (caps.duration) {
        const duration = input.duration || caps.duration.default || caps.duration.options?.[0];
        if (duration && caps.duration.options?.length && !caps.duration.options.includes(duration)) throw new Error("ERR_CINEMA_DURATION_UNSUPPORTED");
        params.duration = duration;
    }
    const imageSize = (caps as ImageModelCapability).size_ui;
    const customResolution = caps.custom_fields.find(field => field.id === "resolution");
    const resolutions = caps.resolution_variant ? caps.resolution_variant.options : imageSize?.resolutions.map(entry => entry.id) || customResolution?.options;
    const resolutionDefault = caps.resolution_variant ? caps.resolution_variant.default : imageSize?.default_resolution || customResolution?.default;
    if (input.resolution && !resolutions?.includes(input.resolution)) throw new Error("ERR_CINEMA_RESOLUTION_UNSUPPORTED");
    params.resolution = input.resolution || (typeof resolutionDefault === "string" ? resolutionDefault : undefined);
    if (params.resolution && customResolution) params.field_values!.resolution = params.resolution;
    if (imageSize) {
        if (!imageSize.aspect_ratios.some(ratio => ratio.id === project.aspectRatio)) throw new Error("ERR_CINEMA_ASPECT_RATIO_UNSUPPORTED");
        params.aspect_ratio = project.aspectRatio;
    } else if (caps.aspect_ratio) {
        const option = caps.aspect_ratio.options?.find(([label, value]) => ratioAliases[project.aspectRatio].includes(value) || label.includes(project.aspectRatio));
        if (caps.aspect_ratio.options?.length && !option) throw new Error("ERR_CINEMA_ASPECT_RATIO_UNSUPPORTED");
        params.aspect_ratio = option?.[1] || project.aspectRatio;
    } else {
        const field = caps.custom_fields.find(entry => ["aspect_ratio", "image_size"].includes(entry.id));
        if (field?.options?.length) {
            const value = field.options.find(option => ratioAliases[project.aspectRatio].includes(option));
            if (!value) throw new Error("ERR_CINEMA_ASPECT_RATIO_UNSUPPORTED");
            params.field_values![field.id] = value;
        }
    }
    if (caps.size) params.size = caps.size.default?.[1];
    return params;
}
function ensureConnection(caps: ModelCapabilities) {
    const requirements: Record<string, string> = { freepik: "FREEPIK_API_KEY", higgsfield: "HF_CREDENTIALS", openrouter: "OPENROUTER_API_KEY", "draw-things": "DRAW_THINGS_URL", "google-ai-studio": "GEMINI_API_KEY", "google-vertex": "GOOGLE_CLOUD_PROJECT", "vercel-ai-gateway": "AI_GATEWAY_API_KEY" };
    const required = requirements[caps.provider || "freepik"];
    if (!required || !connectionStatus().some(field => field.name === required && field.configured)) throw new Error("ERR_CINEMA_PROVIDER_NOT_CONNECTED");
}
function shotJob(record: CinemaGenerationRecord): CinemaGeneration {
    return { requestId: record.requestId, fingerprint: record.fingerprint, state: record.state, createdAt: record.createdAt, updatedAt: record.updatedAt,
        ...(record.taskId ? { taskId: record.taskId } : {}), ...(record.error ? { error: record.error } : {}) };
}
async function markRecord(projectId: string, requestId: string, state: "accepted" | "uncertain", taskId?: string) {
    return mutateCinemaProject(projectId, undefined, project => {
        const record = project.generationHistory.find(entry => entry.requestId === requestId);
        if (!record) throw new Error("ERR_CINEMA_REQUEST_NOT_FOUND");
        // A concurrent reconciliation must never be downgraded to uncertain.
        if (record.state === "accepted") return project;
        Object.assign(record, { state, updatedAt: new Date().toISOString(), ...(taskId ? { taskId } : { error: "ERR_CINEMA_SUBMISSION_UNCERTAIN" }) });
        if (state === "accepted") delete record.error;
        const shot = shotRequired(project, record.shotId);
        shot[record.mediaType] = shotJob(record);
        return project;
    });
}
async function replay(project: CinemaProject, record: CinemaGenerationRecord) {
    if (record.state === "accepted" && record.taskId) return { project, taskId: record.taskId, replayed: true };
    await initStore();
    const task = [...getStore().values()].find(entry => {
        const cinema = entry.reuse_state?.cinema as { projectId?: string; shotId?: string; requestId?: string } | undefined;
        return entry.media_type === record.mediaType && cinema?.projectId === project.id && cinema.shotId === record.shotId && cinema.requestId === record.requestId;
    });
    if (task) return { project: await markRecord(project.id, record.requestId, "accepted", task.task_id), taskId: task.task_id, replayed: true };
    throw new Error(record.state === "uncertain" ? "ERR_CINEMA_SUBMISSION_UNCERTAIN" : "ERR_CINEMA_BUSY");
}
export async function generateCinemaShot(input: CinemaGenerateInput) {
    validateGenerate(input);
    let project = projectRequired(await getCinemaProject(input.projectId));
    const shot = shotRequired(project, input.shotId);
    const hash = fingerprint(project, shot, input);
    const prior = project.generationHistory.find(record => record.requestId === input.requestId);
    if (prior) {
        if (prior.fingerprint !== hash || prior.shotId !== input.shotId || prior.mediaType !== input.mediaType) throw new Error("ERR_CINEMA_REQUEST_REUSE");
        return replay(project, prior);
    }
    if (project.version !== input.version) throw new Error("ERR_CINEMA_VERSION_CONFLICT");
    if (project.generationHistory.some(record => record.shotId === shot.id && active.has(record.state))) throw new Error("ERR_CINEMA_BUSY");
    const latest = shot[input.mediaType];
    if (latest?.state === "accepted" && latest.taskId) {
        await initStore();
        const task = getStore().get(latest.taskId);
        if (!task) throw new Error("ERR_CINEMA_JOB_UNAVAILABLE");
        if (!["COMPLETED", "FAILED", "ERROR", "CANCELLED"].includes(task.status || task.freepik_status || "")) throw new Error("ERR_CINEMA_BUSY");
    }
    if (project.generationHistory.length >= 256) throw new Error("ERR_CINEMA_REQUEST_LIMIT");
    const caps = await capabilities(input);
    const params = cinemaParams(project, shot, input, caps);
    ensureConnection(caps);
    project = await mutateCinemaProject(project.id, input.version, current => {
        if (current.generationHistory.some(record => record.requestId === input.requestId || record.shotId === input.shotId && active.has(record.state))) throw new Error("ERR_CINEMA_BUSY");
        const now = new Date().toISOString();
        const record: CinemaGenerationRecord = { requestId: input.requestId, fingerprint: hash, shotId: input.shotId, mediaType: input.mediaType, state: "submitting", createdAt: now, updatedAt: now };
        current.generationHistory.push(record);
        shotRequired(current, input.shotId)[input.mediaType] = shotJob(record);
        return current;
    });
    try {
        await initStore();
        const taskId = await submitGeneration({ mediaType: input.mediaType, modelId: caps.id, capabilities: caps, params, media: {}, reuseState: { cinema: { projectId: project.id, shotId: input.shotId, requestId: input.requestId } } });
        return { project: await markRecord(project.id, input.requestId, "accepted", taskId), taskId, replayed: false };
    } catch {
        // Persist uncertainty before responding; an error is never permission to submit again.
        await markRecord(project.id, input.requestId, "uncertain").catch(() => {});
        throw new Error("ERR_CINEMA_SUBMISSION_UNCERTAIN");
    }
}

/** Reconcile a known submission with the private task store; never submit a new job. */
export async function cinemaSubmissionStatus(projectId: string, requestId: string) {
    if (typeof projectId !== "string" || !uuid.test(projectId) || typeof requestId !== "string" || !uuid.test(requestId)) throw new Error("ERR_CINEMA_VALIDATION");
    const project = projectRequired(await getCinemaProject(projectId));
    const record = project.generationHistory.find(entry => entry.requestId === requestId);
    if (!record) throw new Error("ERR_CINEMA_REQUEST_NOT_FOUND");
    return { ...await replay(project, record), state: "accepted" as const };
}

const planning = globalThis as typeof globalThis & { __cinemaPlanning?: boolean };
export async function planCinemaProject(input: { projectId: string; version: number; engine: DirectorEngine; model: string; shotCount: number }) {
    if (!input || typeof input.projectId !== "string" || !uuid.test(input.projectId) || !Number.isSafeInteger(input.version) || input.version < 1 || !["ollama", "lm-studio"].includes(input.engine) || typeof input.model !== "string" || !input.model || input.model.length > 200 || !Number.isSafeInteger(input.shotCount) || input.shotCount < 1 || input.shotCount > 12) throw new Error("ERR_CINEMA_VALIDATION");
    const project = projectRequired(await getCinemaProject(input.projectId));
    if (project.version !== input.version) throw new Error("ERR_CINEMA_VERSION_CONFLICT");
    if (!project.brief.trim()) throw new Error("ERR_CINEMA_BRIEF_REQUIRED");
    if (project.generationHistory.some(record => active.has(record.state))) throw new Error("ERR_CINEMA_BUSY");
    if (planning.__cinemaPlanning) throw new Error("ERR_CINEMA_BUSY");
    planning.__cinemaPlanning = true;
    try {
        const result = await createShotPlan(input.engine, input.model, project.brief, {
            maxTokens: 4096,
            system: `You are a film director. Return ONLY one valid JSON object with exactly ${input.shotCount} shots, no markdown. Shape: {"shots":[{"title":"short title","prompt":"specific visual scene and action, under 60 words","seconds":5,"camera":"camera movement as prompt guidance","lens":"lens and framing as prompt guidance","lighting":"light direction and mood","notes":"continuity and sound notes"}]}. Each seconds value must be an integer from 1 to 30. Use ${project.aspectRatio} framing. Every shot must describe the same subjects and setting consistently. Treat camera/lens/lighting as artistic prompt guidance, never as verified engine settings. This creates a storyboard only, never images, audio or video. Do not invent model support, completed generations or prices.`,
        });
        let parsed: unknown;
        try { parsed = JSON.parse(result.plan.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")); }
        catch { throw new Error("ERR_CINEMA_PLAN_FORMAT"); }
        const data = parsed as { shots?: unknown };
        if (!data || typeof data !== "object" || !Array.isArray(data.shots) || data.shots.length !== input.shotCount) throw new Error("ERR_CINEMA_PLAN_FORMAT");
        const shots: CinemaShot[] = data.shots.map(value => {
            if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("ERR_CINEMA_PLAN_FORMAT");
            const item = value as Record<string, unknown>;
            const limits: Record<string, number> = { title: 120, prompt: 4000, camera: 160, lens: 160, lighting: 160, notes: 2000 };
            for (const [key, maximum] of Object.entries(limits)) if (typeof item[key] !== "string" || (item[key] as string).length > maximum || ["title", "prompt"].includes(key) && !(item[key] as string).trim()) throw new Error("ERR_CINEMA_PLAN_FORMAT");
            if (!Number.isSafeInteger(item.seconds) || Number(item.seconds) < 1 || Number(item.seconds) > 30) throw new Error("ERR_CINEMA_PLAN_FORMAT");
            return { id: randomUUID(), title: item.title as string, prompt: item.prompt as string, seconds: Number(item.seconds), camera: item.camera as string, lens: item.lens as string, lighting: item.lighting as string, notes: item.notes as string };
        });
        return { project: await mutateCinemaProject(project.id, input.version, current => ({ ...current, shots })), generatedMedia: false };
    } finally { planning.__cinemaPlanning = false; }
}
