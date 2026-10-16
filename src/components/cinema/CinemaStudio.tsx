"use client";
/* eslint-disable @next/next/no-img-element -- Authenticated private media must bypass public image optimization caches. */

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { ArrowDown, ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUp, ArrowUpRight, Check, ChevronDown, Clapperboard, Clock3, Film, ImageIcon, Layers3, Loader2, Plus, RefreshCw, Save, SlidersHorizontal, Sparkles, Trash2, Video, X } from "lucide-react";
import type { CinemaAspectRatio, CinemaGeneration, CinemaPreset, CinemaProject, CinemaProjectSummary, CinemaShot } from "@/types/cinema";
import type { ModelCapabilities } from "@/models/capabilities/types";
import type { ImageModelCapability } from "@/models/capabilities/image";
import type { MediaCatalogModel } from "@/lib/provider-catalog";
import type { PublicTask } from "@/lib/public-tasks";
import { CINEMA_PRESETS, CINEMA_CAMERA_SUGGESTIONS, CINEMA_LENS_SUGGESTIONS, CINEMA_LIGHTING_SUGGESTIONS } from "@/lib/cinema-presets";
import { CinemaDialog } from "./CinemaDialog";
import styles from "@/app/[locale]/cinema/cinema.module.css";

type MediaType = "image" | "video";
type Engine = "catalog" | "openrouter" | "drawthings";
type ModelOption = { id: string; name: string; provider: string; durations: string[]; resolutions: string[]; ratios: string[]; maxPrompt: number };
type PendingAttempt = { projectId: string; shotId: string; mediaType: MediaType; requestId: string };
type ConfirmAction = { title: string; description: string; label: string; danger?: boolean; action: () => void };
type ApiFailureBody = { error?: string; project?: CinemaProject };

class ApiFailure extends Error {
    constructor(public status: number, public body: ApiFailureBody) { super(body.error || "Request failed"); }
}

async function api<T>(url: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(url, { ...init, cache: "no-store", headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers } });
    let body;
    try { body = await response.json(); } catch { if (!response.ok) throw new ApiFailure(response.status, {}); throw new Error("Invalid response"); }
    if (!response.ok) throw new ApiFailure(response.status, body || {});
    return body as T;
}

function editableSnapshot(project: CinemaProject) {
    return JSON.stringify({ title: project.title, brief: project.brief, aspectRatio: project.aspectRatio, shots: project.shots.map(({ id, title, prompt, seconds, camera, lens, lighting, notes }) => ({ id, title, prompt, seconds, camera, lens, lighting, notes })) });
}
function summarize(project: CinemaProject): CinemaProjectSummary {
    return { id: project.id, title: project.title, aspectRatio: project.aspectRatio, updatedAt: project.updatedAt, shotCount: project.shots.length, seconds: project.shots.reduce((sum, shot) => sum + shot.seconds, 0) };
}
function newShot(number: number): CinemaShot {
    return { id: crypto.randomUUID(), title: `Shot ${String(number).padStart(2, "0")}`, prompt: "", seconds: 5, camera: "", lens: "", lighting: "", notes: "" };
}
function validMediaUrl(value?: string): string | undefined {
    return value && /^\/api\/download\/[a-zA-Z0-9%_-]+(?:\?(?:inline=1|index=\d+))?$/.test(value) ? value : undefined;
}
function taskMedia(task?: PublicTask): string | undefined {
    if (!task || task.status !== "COMPLETED") return undefined;
    return validMediaUrl(task.media_type === "image" ? task.result_urls?.[0] : task.video_urls?.[0] || task.video_path);
}
function terminal(task?: PublicTask): boolean { return Boolean(task && ["COMPLETED", "FAILED", "ERROR", "CANCELLED"].includes(task.status)); }
function generationBusy(generation: CinemaGeneration | undefined, tasks: Record<string, PublicTask>) {
    return Boolean(generation && (generation.state !== "accepted" || !generation.taskId || !terminal(tasks[generation.taskId])));
}
function messageFor(error: unknown) {
    const code = error instanceof ApiFailure ? error.body.error : "";
    const messages: Record<string, string> = {
        ERR_CINEMA_VERSION_CONFLICT: "This project changed in another tab. Your draft is still here. Reload the saved version before continuing.",
        ERR_CINEMA_SUBMISSION_UNCERTAIN: "The provider submission has not been resolved. Refresh its status before starting another generation.",
        ERR_CINEMA_BUSY: "An earlier submission is still being checked. Refresh the project status and wait for it to resolve.",
        ERR_CINEMA_PROVIDER_NOT_CONNECTED: "Connect the selected provider in Connections before generating.",
        ERR_CINEMA_LIMIT: "The studio has reached its 50-project limit. Delete an unused project before creating another.",
        ERR_CINEMA_NOT_FOUND: "This project is no longer available. Refresh the saved project list.",
        ERR_CINEMA_ASPECT_RATIO_UNSUPPORTED: "Choose a project aspect ratio supported by the selected model.",
        ERR_CINEMA_DURATION_UNSUPPORTED: "Choose a generated clip duration supported by the selected model.",
        ERR_CINEMA_RESOLUTION_UNSUPPORTED: "Choose a resolution supported by the selected model.",
        ERR_CINEMA_JOB_UNAVAILABLE: "The previous submission's job is no longer in the library. Its acceptance must be resolved before another generation; a missing job is not permission to submit again.",
        ERR_CINEMA_PROMPT_TOO_LONG: "The prompt and camera guidance exceed this model's prompt limit. Shorten the shot description or guidance.",
        ERR_CINEMA_PLAN_FORMAT: "The planning model did not return a valid shot list. Your saved storyboard has been preserved.",
    };
    if (code && messages[code]) return messages[code];
    return error instanceof ApiFailure ? "This action could not be completed. Check the fields and connection, then refresh the project status." : "The studio could not confirm the response. Check your connection and refresh the project status.";
}
function catalogOptions(models: ModelCapabilities[]): ModelOption[] {
    const aliases: Record<string, string[]> = { "16:9": ["16:9", "widescreen_16_9", "landscape_16_9"], "9:16": ["9:16", "social_story_9_16", "portrait_9_16"], "1:1": ["1:1", "square_1_1", "square_hd", "square"], "4:3": ["4:3", "classic_4_3", "landscape_4_3"], "3:4": ["3:4", "traditional_3_4", "portrait_3_4"], "21:9": ["21:9", "cinematic_21_9"] };
    return models.filter(model => model.prompt_supported !== false && !model.media_slots.some(slot => slot.required)).map(model => {
        const size = (model as ImageModelCapability).size_ui;
        const rawRatios = size?.aspect_ratios.map(ratio => ratio.id) || (model.aspect_ratio ? (model.aspect_ratio.options || []).flatMap(option => option) : model.custom_fields.find(field => ["aspect_ratio", "image_size"].includes(field.id))?.options || []);
        const ratios = rawRatios.length ? Object.keys(aliases).filter(ratio => rawRatios.some(value => aliases[ratio].includes(value) || value.includes(ratio))) : [];
        return { id: model.id, name: model.label, provider: model.provider || "freepik", durations: model.duration ? model.duration.options || [] : [], resolutions: model.resolution_variant ? model.resolution_variant.options || [] : size?.resolutions.map(item => item.id) || model.custom_fields.find(field => field.id === "resolution")?.options || [], ratios: rawRatios.length && !ratios.length ? ["No compatible project frame"] : ratios, maxPrompt: model.prompt_max || 10000 };
    });
}
const providerFields: Record<string, string> = { freepik: "FREEPIK_API_KEY", "google-ai-studio": "GEMINI_API_KEY", "google-vertex": "GOOGLE_CLOUD_PROJECT", "vercel-ai-gateway": "AI_GATEWAY_API_KEY", higgsfield: "HF_CREDENTIALS", openrouter: "OPENROUTER_API_KEY", drawthings: "DRAW_THINGS_URL" };
const aspectRatios: CinemaAspectRatio[] = ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"];

export function CinemaStudio() {
    const locale = useLocale();
    const [projects, setProjects] = useState<CinemaProjectSummary[]>([]);
    const [project, setProject] = useState<CinemaProject | null>(null);
    const [savedSnapshot, setSavedSnapshot] = useState("");
    const [selectedId, setSelectedId] = useState("");
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState("");
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [conflict, setConflict] = useState(false);
    const [confirm, setConfirm] = useState<ConfirmAction | null>(null);
    const [modal, setModal] = useState<"create" | "presets" | "plan" | null>(null);
    const [newTitle, setNewTitle] = useState("");
    const [newAspect, setNewAspect] = useState<CinemaAspectRatio>("16:9");
    const [tasks, setTasks] = useState<Record<string, PublicTask>>({});
    const [taskError, setTaskError] = useState("");
    const [configured, setConfigured] = useState<Record<string, boolean>>({});
    const [connectionError, setConnectionError] = useState(false);
    const [mediaType, setMediaType] = useState<MediaType>("image");
    const [engine, setEngine] = useState<Engine>("catalog");
    const [catalogs, setCatalogs] = useState<Record<MediaType, ModelOption[]>>({ image: [], video: [] });
    const [routerCatalogs, setRouterCatalogs] = useState<Record<MediaType, ModelOption[]>>({ image: [], video: [] });
    const [catalogBusy, setCatalogBusy] = useState(false);
    const [catalogError, setCatalogError] = useState("");
    const [modelId, setModelId] = useState("");
    const [duration, setDuration] = useState("");
    const [resolution, setResolution] = useState("");
    const [planningEngine, setPlanningEngine] = useState<"ollama" | "lm-studio">("ollama");
    const [planningModel, setPlanningModel] = useState("");
    const [shotCount, setShotCount] = useState(3);
    const [replacePlan, setReplacePlan] = useState(false);
    const [unresolved, setUnresolved] = useState<Record<string, PendingAttempt>>({});
    const leaveAllowed = useRef(false);

    const selectedShot = project?.shots.find(shot => shot.id === selectedId) || project?.shots[0];
    const selectedIndex = selectedShot && project ? project.shots.findIndex(shot => shot.id === selectedShot.id) : -1;
    const dirty = Boolean(project && editableSnapshot(project) !== savedSnapshot);
    const options = engine === "catalog" ? catalogs[mediaType] : engine === "openrouter" ? routerCatalogs[mediaType] : [{ id: "current", name: "Current Draw Things image model", provider: "drawthings", durations: [], resolutions: [], ratios: [], maxPrompt: 10000 }];
    const model = options.find(option => option.id === modelId);
    const selectedGeneration = selectedShot?.[mediaType];
    const currentTask = selectedGeneration?.taskId ? tasks[selectedGeneration.taskId] : undefined;
    const preview = taskMedia(currentTask);
    const localUnresolved = selectedShot && project ? Object.values(unresolved).some(attempt => attempt.projectId === project.id && attempt.shotId === selectedShot.id) : false;
    const shotBusy = Boolean(selectedShot && (generationBusy(selectedShot.image, tasks) || generationBusy(selectedShot.video, tasks) || localUnresolved));
    const hasActiveJobs = Boolean(project && (project.shots.some(shot => generationBusy(shot.image, tasks) || generationBusy(shot.video, tasks)) || Object.values(unresolved).some(attempt => attempt.projectId === project.id)));
    const selectedProvider = engine === "drawthings" ? "drawthings" : engine === "openrouter" ? "openrouter" : model?.provider;
    const providerReady = Boolean(selectedProvider && configured[providerFields[selectedProvider]]);
    const validProject = Boolean(project?.title.trim() && project.title.length <= 120 && project.brief.length <= 12000 && project.shots.length <= 24 && project.shots.every(shot => shot.title.trim() && shot.title.length <= 120 && shot.prompt.length <= 4000 && Number.isInteger(shot.seconds) && shot.seconds >= 1 && shot.seconds <= 30 && [shot.camera, shot.lens, shot.lighting].every(value => value.length <= 160) && shot.notes.length <= 2000));
    const fullPrompt = selectedShot ? [selectedShot.prompt.trim(), selectedShot.camera && `Camera direction: ${selectedShot.camera}.`, selectedShot.lens && `Lens and framing: ${selectedShot.lens}.`, selectedShot.lighting && `Lighting: ${selectedShot.lighting}.`, selectedShot.notes && `Continuity and sound direction: ${selectedShot.notes}.`].filter(Boolean).join("\n") : "";
    const generationReason = !selectedShot ? "Add a shot to begin." : busy ? "Wait for the current action to finish." : dirty ? "Save your project before generating." : conflict ? "Reload the saved version to resolve the conflict." : shotBusy ? "A submission is active or unresolved. Check its status before generating again." : !selectedShot.prompt.trim() ? "Write a prompt for this shot." : !model ? "Choose a text-generation model." : !providerReady ? "Connect this model's provider in Connections." : model.ratios.length && project && !model.ratios.includes(project.aspectRatio) ? `This model supports ${model.ratios.join(", ")}. Change the project aspect ratio and save.` : fullPrompt.length > model.maxPrompt ? `Shorten the prompt and direction to ${model.maxPrompt} characters combined for this model.` : "";

    const adopt = useCallback((value: CinemaProject) => {
        setProject(value); setSavedSnapshot(editableSnapshot(value)); setConflict(false);
        setSelectedId(current => value.shots.some(shot => shot.id === current) ? current : value.shots[0]?.id || "");
        setProjects(current => [summarize(value), ...current.filter(item => item.id !== value.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
        const url = new URL(window.location.href); url.searchParams.set("project", value.id); window.history.replaceState(null, "", url);
        setUnresolved(current => Object.fromEntries(Object.entries(current).filter(([, attempt]) => {
            if (attempt.projectId !== value.id) return true;
            const generation = value.shots.find(shot => shot.id === attempt.shotId)?.[attempt.mediaType];
            return generation?.requestId !== attempt.requestId || generation.state !== "accepted" || !generation.taskId;
        })));
    }, []);

    useEffect(() => {
        let active = true;
        (async () => {
            try {
                const data = await api<{ projects: CinemaProjectSummary[] }>("/api/cinema/projects");
                if (!active) return; setProjects(data.projects);
                const id = new URL(window.location.href).searchParams.get("project");
                if (id) { const result = await api<{ project: CinemaProject }>(`/api/cinema/projects/${encodeURIComponent(id)}`); if (active) adopt(result.project); }
            } catch (failure) { if (active) setError(messageFor(failure)); }
            finally { if (active) setLoading(false); }
        })();
        (async () => {
            const results = await Promise.allSettled([api<{ models: ModelCapabilities[] }>("/api/image-models"), api<{ models: Record<string, ModelCapabilities> }>("/api/models"), api<{ fields: { name: string; configured: boolean }[] }>("/api/connections")]);
            if (!active) return;
            if (results[0].status === "fulfilled" && results[1].status === "fulfilled") setCatalogs({ image: catalogOptions(results[0].value.models), video: catalogOptions(Object.values(results[1].value.models)) });
            else setCatalogError("The curated model catalog could not be loaded. Refresh the model list.");
            if (results[2].status === "fulfilled") setConfigured(Object.fromEntries(results[2].value.fields.map(field => [field.name, field.configured])));
            else setConnectionError(true);
        })();
        return () => { active = false; };
    }, [adopt]);

    useEffect(() => {
        if (!dirty && !busy && !Object.keys(unresolved).length) return;
        const warn = (event: BeforeUnloadEvent) => { if (leaveAllowed.current) return; event.preventDefault(); event.returnValue = ""; };
        window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
    }, [dirty, busy, unresolved]);

    const refreshTasks = useCallback(async () => {
        try {
            const result = await Promise.all([api<PublicTask[]>("/api/tasks"), api<PublicTask[]>("/api/image-tasks")]);
            setTasks(Object.fromEntries(result.flat().map(task => [task.task_id, task]))); setTaskError("");
        } catch { setTaskError("Job status could not be refreshed. Existing submissions remain protected from repeat generation."); }
    }, []);
    useEffect(() => {
        if (!project?.id) return;
        void refreshTasks();
        if (!hasActiveJobs) return;
        const timer = window.setInterval(() => { void refreshTasks(); }, 4000);
        return () => window.clearInterval(timer);
    }, [project?.id, hasActiveJobs, refreshTasks]);

    function protect(action: () => void) {
        if (busy) { setError("Wait for the current action to finish before leaving this project."); return; }
        if (dirty) setConfirm({ title: "Leave this draft?", description: "Your unsaved changes will be discarded. Save the project first to keep them.", label: "Discard changes", danger: true, action });
        else action();
    }
    function navigate(event: React.MouseEvent<HTMLAnchorElement>) {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const href = event.currentTarget.href;
        if (dirty || busy) { event.preventDefault(); protect(() => { leaveAllowed.current = true; window.location.assign(href); }); }
    }
    async function refreshProjects() {
        setBusy("list"); setError("");
        try { setProjects((await api<{ projects: CinemaProjectSummary[] }>("/api/cinema/projects")).projects); }
        catch (failure) { setError(messageFor(failure)); }
        finally { setBusy(""); }
    }
    async function openProject(id: string) {
        setBusy("open"); setError(""); setNotice("");
        try { adopt((await api<{ project: CinemaProject }>(`/api/cinema/projects/${encodeURIComponent(id)}`)).project); }
        catch (failure) { setError(messageFor(failure)); }
        finally { setBusy(""); }
    }
    async function createProject(preset?: CinemaPreset) {
        setBusy("create"); setError(""); setNotice("");
        try {
            const result = await api<{ project: CinemaProject }>("/api/cinema/projects", { method: "POST", body: JSON.stringify({ title: preset?.title || newTitle.trim() || "Untitled film", brief: preset?.brief || "", aspectRatio: newAspect }) });
            adopt(result.project); setModal(null); setNewTitle("");
            if (preset) { setProject({ ...result.project, shots: preset.shots.map(shot => ({ ...shot, id: crypto.randomUUID() })) }); setNotice("Starter preset applied to your draft. Save the project to keep its shots."); }
        } catch (failure) { setError(messageFor(failure)); }
        finally { setBusy(""); }
    }
    async function saveProject() {
        if (!project || !validProject) return;
        setBusy("save"); setError(""); setNotice("");
        try { const result = await api<{ project: CinemaProject }>(`/api/cinema/projects/${encodeURIComponent(project.id)}`, { method: "PUT", body: JSON.stringify({ version: project.version, title: project.title, brief: project.brief, aspectRatio: project.aspectRatio, shots: project.shots }) }); adopt(result.project); setNotice("Project saved."); }
        catch (failure) { setError(messageFor(failure)); if (failure instanceof ApiFailure && failure.status === 409) setConflict(true); }
        finally { setBusy(""); }
    }
    async function deleteProject() {
        if (!project) return;
        setBusy("delete"); setError("");
        try {
            await api(`/api/cinema/projects/${encodeURIComponent(project.id)}`, { method: "DELETE", body: JSON.stringify({ version: project.version }) });
            setProjects(current => current.filter(item => item.id !== project.id)); setProject(null); setSavedSnapshot(""); setSelectedId(""); setConflict(false); setNotice("Project deleted. Its generated media remains in the main library.");
            const url = new URL(window.location.href); url.searchParams.delete("project"); window.history.replaceState(null, "", url);
        } catch (failure) { setError(messageFor(failure)); if (failure instanceof ApiFailure && failure.status === 409) setConflict(true); }
        finally { setBusy(""); }
    }
    function updateShot(changes: Partial<CinemaShot>) { if (!selectedShot || busy) return; setProject(current => current ? { ...current, shots: current.shots.map(shot => shot.id === selectedShot.id ? { ...shot, ...changes } : shot) } : current); }
    function addShot() { if (!project || project.shots.length >= 24 || busy) return; const shot = newShot(project.shots.length + 1); setProject({ ...project, shots: [...project.shots, shot] }); setSelectedId(shot.id); }
    function moveShot(direction: -1 | 1) { if (!project || selectedIndex < 0) return; const destination = selectedIndex + direction; if (destination < 0 || destination >= project.shots.length) return; const shots = [...project.shots]; [shots[selectedIndex], shots[destination]] = [shots[destination], shots[selectedIndex]]; setProject({ ...project, shots }); }
    function applyPreset(preset: CinemaPreset) {
        if (!project) { setConfirm({ title: "Start with this preset?", description: "This creates a project and copies the original preset into an editable draft. It does not generate media or use provider credits.", label: "Use preset", action: () => void createProject(preset) }); return; }
        const apply = () => { setProject(current => current ? { ...current, brief: preset.brief, shots: preset.shots.map(shot => ({ ...shot, id: crypto.randomUUID() })) } : current); setSelectedId(""); setModal(null); setNotice("Starter preset applied to your draft. Save to keep these changes."); };
        setModal(null); setConfirm({ title: project.shots.length ? "Replace the current storyboard?" : "Apply this starter preset?", description: "This applies the preset's brief and shots to your draft. Generated media stays in the main library. Save the draft when you want to keep the new storyboard.", label: "Apply preset", action: apply });
    }
    async function loadModels() {
        setCatalogBusy(true); setCatalogError("");
        try {
            if (engine === "catalog") {
                const [images, videos, connections] = await Promise.all([api<{ models: ModelCapabilities[] }>("/api/image-models"), api<{ models: Record<string, ModelCapabilities> }>("/api/models"), api<{ fields: { name: string; configured: boolean }[] }>("/api/connections")]);
                setCatalogs({ image: catalogOptions(images.models), video: catalogOptions(Object.values(videos.models)) }); setConfigured(Object.fromEntries(connections.fields.map(field => [field.name, field.configured]))); setConnectionError(false);
            } else if (engine === "openrouter") {
                const result = await api<{ models: MediaCatalogModel[] }>(`/api/providers/catalog?engine=openrouter&kind=${mediaType}`);
                setRouterCatalogs(current => ({ ...current, [mediaType]: result.models.filter(entry => !entry.vectorOnly && !entry.sourceVideoWorkflow && !entry.minReferences).map(entry => ({ id: entry.id, name: entry.name, provider: "openrouter", durations: entry.durations, resolutions: entry.resolutions, ratios: entry.ratios, maxPrompt: 10000 })) }));
            } else {
                await api("/api/providers/catalog?engine=drawthings"); setNotice("Draw Things is ready. Its currently selected image model will render this shot.");
            }
        } catch (failure) { setCatalogError(messageFor(failure)); }
        finally { setCatalogBusy(false); }
    }
    async function refreshSubmission() {
        if (!project) return;
        setBusy("status"); setError("");
        try {
            const attempts = new Map<string, string>();
            for (const kind of ["image", "video"] as const) if (selectedShot?.[kind]?.requestId) attempts.set(selectedShot[kind]!.requestId, selectedShot[kind]!.requestId);
            for (const attempt of Object.values(unresolved)) if (attempt.projectId === project.id && attempt.shotId === selectedShot?.id) attempts.set(attempt.requestId, attempt.requestId);
            let reconciled: CinemaProject | undefined;
            for (const requestId of attempts.keys()) {
                try { reconciled = (await api<{ project: CinemaProject }>(`/api/cinema/generate?projectId=${encodeURIComponent(project.id)}&requestId=${encodeURIComponent(requestId)}`)).project; }
                catch (failure) { if (failure instanceof ApiFailure && failure.body.project) reconciled = failure.body.project; }
            }
            const result = { project: reconciled || (await api<{ project: CinemaProject }>(`/api/cinema/projects/${encodeURIComponent(project.id)}`)).project };
            if (!dirty) adopt(result.project);
            else if (editableSnapshot(result.project) === savedSnapshot) {
                const byId = new Map(result.project.shots.map(shot => [shot.id, shot]));
                setProject(current => current ? { ...current, version: result.project.version, updatedAt: result.project.updatedAt, generationHistory: result.project.generationHistory, shots: current.shots.map(shot => ({ ...shot, image: byId.get(shot.id)?.image, video: byId.get(shot.id)?.video })) } : current);
            } else { setConflict(true); setError("The saved project has changed. Your draft is preserved. Reload the saved version to continue."); }
            await refreshTasks();
            setNotice("Saved project and job status refreshed. Unresolved submissions remain blocked until their acceptance is confirmed.");
        } catch (failure) { setError(messageFor(failure)); }
        finally { setBusy(""); }
    }
    async function generate() {
        if (!project || !selectedShot || generationReason || !model) return;
        const attempt: PendingAttempt = { projectId: project.id, shotId: selectedShot.id, mediaType, requestId: crypto.randomUUID() };
        const attemptKey = `${project.id}:${selectedShot.id}:${mediaType}`;
        setBusy("generate"); setError(""); setNotice("");
        try {
            const result = await api<{ project: CinemaProject; taskId: string; replayed: boolean }>("/api/cinema/generate", { method: "POST", body: JSON.stringify({ ...attempt, version: project.version, engine, modelId, duration: duration || undefined, resolution: resolution || undefined }) });
            adopt(result.project); setNotice(result.replayed ? "Existing submission found. Its saved job is shown here." : "Shot submitted. Its progress and saved output will appear in the monitor."); await refreshTasks();
        } catch (failure) {
            const apiFailure = failure instanceof ApiFailure ? failure : undefined;
            if (apiFailure?.body.error === "ERR_CINEMA_VERSION_CONFLICT") setConflict(true);
            else if (apiFailure?.body.project) adopt(apiFailure.body.project);
            const uncertain = !apiFailure || apiFailure.status >= 500 || apiFailure.body.error === "ERR_CINEMA_SUBMISSION_UNCERTAIN";
            if (uncertain) {
                const known = apiFailure?.body.project?.shots.find(shot => shot.id === selectedShot.id)?.[mediaType];
                if (!known || known.requestId === attempt.requestId) setUnresolved(current => ({ ...current, [attemptKey]: attempt }));
                setError("Submission could not be confirmed. No retry has been sent. Refresh submission status before starting another generation.");
            } else setError(messageFor(failure));
        } finally { setBusy(""); }
    }
    async function plan() {
        if (!project || dirty || !planningModel.trim() || (project.shots.length > 0 && !replacePlan)) return;
        setBusy("plan"); setError(""); setNotice("");
        try { const result = await api<{ project: CinemaProject; generatedMedia: false }>("/api/cinema/plan", { method: "POST", body: JSON.stringify({ projectId: project.id, version: project.version, engine: planningEngine, model: planningModel.trim(), shotCount }) }); adopt(result.project); setModal(null); setNotice("Shot plan saved. Review its prompts before generating media."); }
        catch (failure) { setError(messageFor(failure)); if (failure instanceof ApiFailure && failure.status === 409) setConflict(true); }
        finally { setBusy(""); }
    }

    const statusText = selectedGeneration?.state === "uncertain" || localUnresolved ? "Submission unresolved" : selectedGeneration?.state === "submitting" ? "Submitting" : currentTask?.status === "COMPLETED" ? "Take ready" : currentTask?.status === "FAILED" || currentTask?.status === "ERROR" || currentTask?.status === "CANCELLED" ? "Generation failed" : selectedGeneration?.taskId ? currentTask ? "Generating" : "Checking job" : "No take yet";

    return <div className={styles.page}>
        <a href="#cinema-editor" className={styles.skip}>Skip to Cinema workspace</a>
        <header className={styles.header}>
            <a href={`/${locale}`} onClick={navigate} className={styles.brand}><span className={styles.brandMark} aria-hidden="true">{"///"}</span>Highfield<span>.</span></a>
            <span className={styles.headerDivider}/><span className={styles.moduleName}><Clapperboard size={17}/>Cinema Studio</span>
            <nav aria-label="Cinema navigation"><a href={`/${locale}`} onClick={navigate}><ArrowLeft size={13}/>Studio</a><a href={`/${locale}/skills`} onClick={navigate}><Sparkles size={14}/>Skills</a><a href={`/${locale}/providers`} onClick={navigate}><Layers3 size={14}/>Providers</a><a href={`/${locale}/connections`} onClick={navigate}><SlidersHorizontal size={14}/><span>Connections</span></a></nav>
        </header>
        <div className={styles.layout}>
            <aside className={styles.sidebar} aria-label="Saved Cinema projects"><div className={styles.sidebarHeading}><div><span className={styles.eyebrow}>YOUR PRODUCTIONS</span><h2>Projects<span>{projects.length}/50</span></h2></div><button className={styles.iconButton} type="button" aria-label="Refresh saved projects" disabled={Boolean(busy)} onClick={() => void refreshProjects()}><RefreshCw size={14}/></button></div><button className={styles.newProject} disabled={Boolean(busy) || projects.length >= 50} onClick={() => protect(() => { setNewTitle(""); setModal("create"); })}><Plus size={16}/>New project</button><div className={styles.projectList}>{loading ? <p className={styles.sidebarNote}>Loading projects…</p> : projects.length ? projects.map(item => <button key={item.id} className={`${styles.projectItem} ${project?.id === item.id ? styles.projectActive : ""}`} onClick={() => { if (item.id !== project?.id) protect(() => void openProject(item.id)); }} disabled={Boolean(busy)}><span className={styles.projectGlyph}><Film size={17}/></span><span><strong>{item.title}</strong><small>{item.shotCount} shots<span>·</span>{item.seconds}s<span>·</span>{item.aspectRatio}</small></span></button>) : <p className={styles.sidebarNote}>Your saved films will appear here. Start with an idea or an original preset.</p>}</div><div className={styles.sidebarFooter}><span className={styles.statusDot}/><span>Owner workspace<br/><small>Projects stay on your studio server.</small></span></div></aside>
            <main className={styles.workspace} id="cinema-editor" tabIndex={-1}>
                {(error || notice || conflict) && <div className={`${styles.message} ${error || conflict ? styles.messageError : ""}`} role={error || conflict ? "alert" : "status"}><span>{error || notice || "The saved project changed. Reload it before continuing."}</span>{conflict && project && <button disabled={Boolean(busy)} onClick={() => setConfirm({ title: "Reload the saved project?", description: "This discards your local changes and opens the latest saved version. Your draft has not overwritten the other version.", label: "Reload saved version", action: () => void openProject(project.id) })}>Reload saved version<RefreshCw size={13}/></button>}<button className={styles.messageClose} aria-label="Dismiss message" onClick={() => { setError(""); setNotice(""); }}><X size={14}/></button></div>}
                {!project ? <div className={styles.welcome}><div className={styles.aperture} aria-hidden="true"><i/><i/><i/><i/><i/><i/><span>01</span></div><span className={styles.eyebrow}>FROM THE FIRST FRAME</span><h1>Build your next scene.</h1><p>Plan the shots. Shape the light. Make an image or a moving take with the models you choose.</p><button className={styles.primaryButton} disabled={Boolean(busy) || loading || projects.length >= 50} onClick={() => { setNewTitle(""); setModal("create"); }}><Plus size={16}/>Create a project</button><section className={styles.welcomePresets} aria-labelledby="cinema-starters"><div className={styles.sectionHeading}><h2 id="cinema-starters">A starting point for your story</h2><span>Original Highfield presets</span></div><div className={styles.presetGrid}>{CINEMA_PRESETS.map((preset, index) => <button key={preset.id} disabled={Boolean(busy) || projects.length >= 50} onClick={() => applyPreset(preset)}><span className={styles.presetIndex}>0{index + 1}</span><strong>{preset.title}</strong><p>{preset.description}</p><span>{preset.shots.length} shots<ArrowUpRight size={14}/></span></button>)}</div></section></div> : <>
                    <div className={styles.projectToolbar}><div className={styles.projectIdentity}><span className={styles.eyebrow}>CINEMA / PROJECT</span><label className={styles.srOnly} htmlFor="cinema-title">Project title</label><input id="cinema-title" className={styles.titleInput} maxLength={120} value={project.title} onChange={event => setProject({ ...project, title: event.target.value })} disabled={Boolean(busy)}/></div><div className={styles.projectActions}><span className={`${styles.saveState} ${dirty ? styles.unsaved : ""}`}>{busy === "save" ? <Loader2 size={12} className={styles.spin}/> : dirty ? <span className={styles.unsavedDot}/> : <Check size={12}/>}<span>{busy === "save" ? "Saving…" : dirty ? "Unsaved changes" : `Saved · v${project.version}`}</span></span><button className={styles.primaryButton} disabled={Boolean(busy) || !dirty || !validProject || conflict} onClick={() => void saveProject()}><Save size={14}/>{busy === "save" ? "Saving…" : "Save project"}</button><button className={styles.iconButton} aria-label="Delete project" disabled={Boolean(busy) || hasActiveJobs} onClick={() => setConfirm({ title: "Delete this project?", description: "This permanently removes the project and storyboard. Its generated media remains in the main library. Unsaved changes to this project will be discarded.", label: "Delete project", danger: true, action: () => void deleteProject() })}><Trash2 size={15}/></button></div></div>
                    <details className={styles.briefPanel}><summary><span>Project brief</span><span>{project.brief ? `${project.brief.length} characters` : "Set the direction for your film"}<ChevronDown size={14}/></span></summary><label><span className={styles.srOnly}>Project brief</span><textarea rows={3} maxLength={12000} placeholder="The story, atmosphere, subject and continuity you want across your shots…" value={project.brief} onChange={event => setProject({ ...project, brief: event.target.value })} disabled={Boolean(busy)}/></label></details>
                    <div className={styles.projectControls}><label>Frame<select aria-label="Project aspect ratio" value={project.aspectRatio} onChange={event => setProject({ ...project, aspectRatio: event.target.value as CinemaAspectRatio })} disabled={Boolean(busy)}>{aspectRatios.map(ratio => <option key={ratio}>{ratio}</option>)}</select></label><span><Clock3 size={12}/>{project.shots.reduce((sum, shot) => sum + shot.seconds, 0)}s planned<span className={styles.controlDivider}/>{project.shots.length}/24 shots</span><div><button className={styles.subtleButton} disabled={Boolean(busy) || hasActiveJobs} onClick={() => setModal("presets")}><Layers3 size={13}/>Starter presets</button><button className={styles.subtleButton} disabled={Boolean(busy) || dirty || conflict || !project.brief.trim() || hasActiveJobs} onClick={() => { setReplacePlan(false); setModal("plan"); }}><Sparkles size={13}/>Plan with AI</button></div></div>
                    <div className={styles.editorGrid}><div className={styles.stageColumn}><section className={styles.monitor} aria-label="Selected shot preview"><div className={styles.monitorHeading}><span>{selectedShot ? `SHOT ${String(selectedIndex + 1).padStart(2, "0")} / ${String(project.shots.length).padStart(2, "0")}` : "YOUR FIRST SHOT"}</span><span className={styles.monitorStatus}><i className={shotBusy ? styles.statusActive : ""}/>{statusText}</span></div><div className={styles.screen} style={{ "--frame-ratio": project.aspectRatio.replace(":", "/") } as React.CSSProperties}>{preview ? mediaType === "video" ? <video key={preview} src={preview} controls playsInline preload="metadata" aria-label={`${selectedShot?.title} generated video`}/> : <img src={preview} alt={`${selectedShot?.title} generated image`}/> : <div className={styles.emptyFrame}><span className={styles.frameCorner}/><span className={styles.frameNumber}>{String(Math.max(1, selectedIndex + 1)).padStart(2, "0")}</span>{shotBusy ? <Loader2 size={22} className={styles.spin}/> : <Clapperboard size={28}/>}<strong>{shotBusy ? statusText : selectedShot ? "Your shot starts here." : "A story begins with one shot."}</strong><p>{shotBusy ? "Your saved submission is being checked. No repeat generation will be sent." : selectedShot ? "Write the scene, choose a model and make your first take." : "Add a shot manually, or start with a preset."}</p></div>}</div><div className={styles.monitorFooter}><div className={styles.mediaTabs} aria-label="Shot media type"><button aria-pressed={mediaType === "image"} onClick={() => { setMediaType("image"); setModelId(""); setDuration(""); setResolution(""); }}><ImageIcon size={13}/>Image</button><button aria-pressed={mediaType === "video"} onClick={() => { setMediaType("video"); if (engine === "drawthings") setEngine("catalog"); setModelId(""); setDuration(""); setResolution(""); }}><Video size={13}/>Video</button></div>{preview ? <a className={styles.downloadLink} href={preview.replace("?inline=1", "")} download><ArrowDownToLine size={14}/>Download take</a> : <span className={styles.monitorHint}>{project.aspectRatio} frame</span>}</div></section>
                    {selectedShot && <section className={styles.renderPanel} aria-labelledby="cinema-render-title"><div className={styles.sectionHeading}><h2 id="cinema-render-title">Make this shot</h2><span>{engine === "drawthings" ? "LOCAL IMAGE ENGINE" : "PROVIDER API CREDITS"}</span></div><div className={styles.renderSelectors}><label>Connection<select value={engine} disabled={Boolean(busy)} onChange={event => { const value = event.target.value as Engine; setEngine(value); setModelId(value === "drawthings" ? "current" : ""); if (value === "drawthings") setMediaType("image"); setDuration(""); setResolution(""); }}><option value="catalog">Direct providers</option><option value="openrouter">OpenRouter</option><option value="drawthings">Draw Things · local image</option></select></label><label>Generation model<select value={modelId} disabled={Boolean(busy) || catalogBusy} onChange={event => { const next = options.find(option => option.id === event.target.value); setModelId(event.target.value); setDuration(next?.durations.includes(String(selectedShot.seconds)) ? String(selectedShot.seconds) : next?.durations[0] || ""); setResolution(next?.resolutions[0] || ""); }}><option value="">{options.length ? "Choose a model" : "Discover the model catalog"}</option>{options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label><button className={styles.iconButton} aria-label="Refresh generation models" disabled={Boolean(busy) || catalogBusy} onClick={() => void loadModels()}>{catalogBusy ? <Loader2 size={15} className={styles.spin}/> : <RefreshCw size={15}/>}</button></div>{model && (model.durations.length > 0 || model.resolutions.length > 0) && <div className={styles.modelOptions}>{mediaType === "video" && model.durations.length > 0 && <label>Generated clip duration<select value={duration} disabled={Boolean(busy)} onChange={event => setDuration(event.target.value)}>{model.durations.map(value => <option key={value} value={value}>{value}s</option>)}</select></label>}{model.resolutions.length > 0 && <label>Resolution<select value={resolution} disabled={Boolean(busy)} onChange={event => setResolution(event.target.value)}>{model.resolutions.map(value => <option key={value}>{value}</option>)}</select></label>}</div>}{catalogError && <p className={styles.inlineError} role="alert">{catalogError}</p>}{connectionError && <p className={styles.inlineError}>Connection status could not be loaded. Refresh the generation models to check again.</p>}{taskError && <p className={styles.inlineError} role="status">{taskError}</p>}{currentTask && ["FAILED", "ERROR", "CANCELLED"].includes(currentTask.status) && <p className={styles.inlineError}>This take did not complete. Review the shot and provider connection before deliberately starting another take.</p>}<div className={styles.renderFooter}><p>{generationReason || (engine === "drawthings" ? "Runs on your connected Draw Things image engine. Camera guidance is included in the prompt." : "Generation uses your selected provider's credits. Camera guidance is included in the prompt.")}</p><button className={styles.primaryButton} disabled={Boolean(generationReason) || catalogBusy} onClick={() => void generate()}>{busy === "generate" ? <Loader2 size={15} className={styles.spin}/> : mediaType === "video" ? <Video size={15}/> : <ImageIcon size={15}/>}Generate {mediaType}</button></div>{shotBusy && <button className={styles.statusRefresh} disabled={Boolean(busy)} onClick={() => void refreshSubmission()}><RefreshCw size={13}/>Refresh submission status</button>}</section>}
                    <section className={styles.storyboard} aria-labelledby="cinema-storyboard-title"><div className={styles.sectionHeading}><h2 id="cinema-storyboard-title">Storyboard<span>{project.shots.length} shots</span></h2><button className={styles.subtleButton} disabled={Boolean(busy) || project.shots.length >= 24} onClick={addShot}><Plus size={14}/>Add shot</button></div><div className={styles.shotStrip}>{project.shots.map((shot, index) => { const image = shot.image?.taskId ? taskMedia(tasks[shot.image.taskId]) : undefined; return <button key={shot.id} className={`${styles.shotCard} ${shot.id === selectedShot?.id ? styles.shotSelected : ""}`} aria-pressed={shot.id === selectedShot?.id} disabled={Boolean(busy)} onClick={() => setSelectedId(shot.id)}><span className={styles.shotThumbnail}>{image ? <img src={image} alt="" loading="lazy"/> : <Film size={20}/>}<span>{String(index + 1).padStart(2, "0")}</span><small>{shot.seconds}s</small></span><strong>{shot.title}</strong><span>{shot.prompt || "Describe this shot"}</span></button>; })}<button className={styles.addShotCard} disabled={Boolean(busy) || project.shots.length >= 24} onClick={addShot}><Plus size={22}/><span>Add shot</span></button></div></section>
                    <p className={styles.productionNote}>Storyboard and individual shot renders. Timeline assembly and final film export are not connected yet.</p></div>
                    <aside className={styles.inspector} aria-label="Shot details">{selectedShot ? <><div className={styles.inspectorHeading}><span className={styles.eyebrow}>SHOT DIRECTION</span><span>{String(selectedIndex + 1).padStart(2, "0")}<span>/ {String(project.shots.length).padStart(2, "0")}</span></span></div><fieldset disabled={Boolean(busy)} className={styles.shotFields}><label>Shot title<input value={selectedShot.title} maxLength={120} onChange={event => updateShot({ title: event.target.value })}/></label><label>Scene prompt<textarea value={selectedShot.prompt} rows={6} maxLength={4000} placeholder="Describe the subject, setting, action and feeling of this shot…" onChange={event => updateShot({ prompt: event.target.value })}/><span className={styles.fieldHint}>{selectedShot.prompt.length}/4000 · visual direction</span></label><div className={styles.directionHeading}><SlidersHorizontal size={13}/><span>Camera & light</span></div><p className={styles.guidanceNote}>Prompt suggestions, interpreted by your selected model.</p><label>Camera movement<input list="cinema-camera-options" value={selectedShot.camera} maxLength={160} placeholder="Slow push-in" onChange={event => updateShot({ camera: event.target.value })}/></label><label>Lens & framing<input list="cinema-lens-options" value={selectedShot.lens} maxLength={160} placeholder="50 mm, medium close-up" onChange={event => updateShot({ lens: event.target.value })}/></label><label>Lighting<input list="cinema-light-options" value={selectedShot.lighting} maxLength={160} placeholder="Soft window light, warm shadows" onChange={event => updateShot({ lighting: event.target.value })}/></label><label>Planned edit length <span className={styles.secondsInput}><input type="number" min={1} max={30} step={1} value={selectedShot.seconds} onChange={event => updateShot({ seconds: Number(event.target.value) })}/><span>seconds</span></span></label><label>Continuity & sound notes<textarea rows={3} value={selectedShot.notes} maxLength={2000} placeholder="Keep the same subject. Ambient sound, transitions and continuity…" onChange={event => updateShot({ notes: event.target.value })}/></label></fieldset><div className={styles.shotActions}><div><button className={styles.iconButton} aria-label="Move shot earlier" disabled={Boolean(busy) || selectedIndex === 0} onClick={() => moveShot(-1)}><ArrowUp size={15}/></button><button className={styles.iconButton} aria-label="Move shot later" disabled={Boolean(busy) || selectedIndex === project.shots.length - 1} onClick={() => moveShot(1)}><ArrowDown size={15}/></button></div><button className={styles.dangerButton} disabled={Boolean(busy) || shotBusy} onClick={() => setConfirm({ title: "Remove this shot?", description: "The shot will be removed from your draft. Generated media remains in the main library. Save the project to keep this change.", label: "Remove shot", danger: true, action: () => { setProject(current => current ? { ...current, shots: current.shots.filter(shot => shot.id !== selectedShot.id) } : current); setSelectedId(project.shots[selectedIndex + 1]?.id || project.shots[selectedIndex - 1]?.id || ""); } })}><Trash2 size={13}/>Remove shot</button></div></> : <div className={styles.inspectorEmpty}><Clapperboard size={25}/><h2>Set your first shot.</h2><p>Add a shot to write its scene, camera direction and lighting.</p><button className={styles.subtleButton} onClick={addShot} disabled={Boolean(busy)}><Plus size={14}/>Add shot</button></div>}</aside></div>
                    {!validProject && <p className={styles.validationError} role="alert">Use a project and shot title, at most 24 shots, and whole-number durations from 1 to 30 seconds. Keep every field within its character limit.</p>}
                </>}
            </main>
        </div>
        <datalist id="cinema-camera-options">{CINEMA_CAMERA_SUGGESTIONS.map(value => <option key={value} value={value}/>)}</datalist><datalist id="cinema-lens-options">{CINEMA_LENS_SUGGESTIONS.map(value => <option key={value} value={value}/>)}</datalist><datalist id="cinema-light-options">{CINEMA_LIGHTING_SUGGESTIONS.map(value => <option key={value} value={value}/>)}</datalist>
        {modal === "create" && <CinemaDialog title="A new production." eyebrow="CINEMA / NEW PROJECT" onClose={() => setModal(null)} locked={Boolean(busy)}><form className={styles.dialogForm} onSubmit={event => { event.preventDefault(); void createProject(); }}><label>Project name<input value={newTitle} onChange={event => setNewTitle(event.target.value)} maxLength={120} placeholder="Untitled film" disabled={Boolean(busy)}/></label><label>Frame<select value={newAspect} onChange={event => setNewAspect(event.target.value as CinemaAspectRatio)} disabled={Boolean(busy)}>{aspectRatios.map(ratio => <option key={ratio}>{ratio}</option>)}</select></label><p>Start with a manual storyboard. You can add an original preset or ask a local planning model for a shot plan later.</p>{error && <p className={styles.inlineError} role="alert">{error}</p>}<button className={styles.primaryButton} disabled={Boolean(busy)}>{busy === "create" ? <Loader2 size={15} className={styles.spin}/> : <Plus size={15}/>}Create project</button></form></CinemaDialog>}
        {modal === "presets" && <CinemaDialog title="Give your story a start." eyebrow="ORIGINAL HIGHFIELD PRESETS" onClose={() => setModal(null)}><p className={styles.dialogDescription}>Editable scene, camera and lighting prompts. Applying a preset does not generate media or use provider credits.</p><div className={styles.dialogPresets}>{CINEMA_PRESETS.map(preset => <button key={preset.id} onClick={() => applyPreset(preset)}><strong>{preset.title}</strong><p>{preset.description}</p><span>{preset.shots.length} shots<ArrowRight size={14}/></span></button>)}</div></CinemaDialog>}
        {modal === "plan" && project && <CinemaDialog title="Plan the next sequence." eyebrow="DIRECTOR / LOCAL INTELLIGENCE" onClose={() => setModal(null)} locked={Boolean(busy)}><form className={styles.dialogForm} onSubmit={event => { event.preventDefault(); void plan(); }}><p>Use the saved project brief to create editable shots with your own planning model. This saves a new shot plan and does not generate media.</p><label>Planning engine<select value={planningEngine} onChange={event => setPlanningEngine(event.target.value as "ollama" | "lm-studio")} disabled={Boolean(busy)}><option value="ollama">Ollama</option><option value="lm-studio">LM Studio</option></select></label><label>Model identifier<input value={planningModel} onChange={event => setPlanningModel(event.target.value)} placeholder="An installed planning model" maxLength={200} required disabled={Boolean(busy)}/></label><label>Number of shots<input type="number" min={1} max={12} step={1} value={shotCount} onChange={event => setShotCount(Number(event.target.value))} required disabled={Boolean(busy)}/></label>{project.shots.length > 0 && <label className={styles.replaceConsent}><input type="checkbox" checked={replacePlan} onChange={event => setReplacePlan(event.target.checked)} disabled={Boolean(busy)}/><span>Replace the current {project.shots.length} shots with the new plan. Generated media remains in the main library.</span></label>}{!configured[planningEngine === "ollama" ? "OLLAMA_URL" : "LM_STUDIO_URL"] && <p className={styles.inlineError}>Connect this planning engine in Connections first. Manual storyboarding is available without it.</p>}{error && <p className={styles.inlineError} role="alert">{error}</p>}<button className={styles.primaryButton} disabled={Boolean(busy) || !planningModel.trim() || !configured[planningEngine === "ollama" ? "OLLAMA_URL" : "LM_STUDIO_URL"] || (project.shots.length > 0 && !replacePlan) || !Number.isInteger(shotCount) || shotCount < 1 || shotCount > 12}>{busy === "plan" ? <Loader2 size={15} className={styles.spin}/> : <Sparkles size={15}/>}Create shot plan</button></form></CinemaDialog>}
        {confirm && <CinemaDialog title={confirm.title} eyebrow="CINEMA / CONFIRM CHANGE" onClose={() => setConfirm(null)}><p className={styles.dialogDescription}>{confirm.description}</p><div className={styles.confirmActions}><button className={styles.subtleButton} onClick={() => setConfirm(null)}>Keep working</button><button className={confirm.danger ? styles.confirmDanger : styles.primaryButton} onClick={() => { const action = confirm.action; setConfirm(null); action(); }}>{confirm.label}</button></div></CinemaDialog>}
    </div>;
}
