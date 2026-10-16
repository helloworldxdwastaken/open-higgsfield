import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { IMAGE_CAPABILITIES_LIST } from "@/models/capabilities/image";
import { VIDEO_CAPABILITIES } from "@/models/capabilities/video";

export type AdminModelMode = "catalog" | "identifier" | "planning";

export type AdminModelFeature = {
    feature: string;
    label: string;
    mode: AdminModelMode;
    providerEngine?: "openrouter" | "ollama" | "lm-studio" | "draw-things";
    choices?: Array<{ id: string; label: string }>;
};

export type AdminModelSetting = {
    feature: string;
    model_id: string;
    provider_engine?: string;
    updated_at: string;
};

const imageChoices = IMAGE_CAPABILITIES_LIST.map(model => ({
    id: model.id,
    label: model.variant ? `${model.family} ${model.variant}` : model.label,
}));
const videoChoices = Object.values(VIDEO_CAPABILITIES).map(model => ({
    id: model.id,
    label: model.variant ? `${model.family} ${model.variant}` : model.label,
}));

export const ADMIN_MODEL_FEATURES: AdminModelFeature[] = [
    { feature: "image_generation", label: "Image generation", mode: "catalog", choices: imageChoices },
    { feature: "video_generation", label: "Video generation", mode: "catalog", choices: videoChoices },
    { feature: "influencer_generation", label: "Influencer", mode: "catalog", choices: videoChoices },
    { feature: "supercomputer_generation", label: "Supercomputer", mode: "catalog", choices: videoChoices },
    { feature: "katana_generation", label: "Katana reference video", mode: "catalog", choices: videoChoices },
    { feature: "genjutsu_motion_transfer", label: "Genjutsu motion transfer", mode: "catalog", choices: videoChoices.filter(model => model.id === "higgsfield__genjutsu-motion-transfer") },
    { feature: "genjutsu_object_swap", label: "Genjutsu object swap", mode: "catalog", choices: videoChoices.filter(model => model.id === "higgsfield__genjutsu-object-swap") },
    { feature: "cinema_generation", label: "Cinema generation", mode: "catalog", choices: videoChoices.filter(model => model.id === "higgsfield__cinema-studio-4.0") },
    { feature: "openrouter_image", label: "OpenRouter image", mode: "identifier", providerEngine: "openrouter" },
    { feature: "openrouter_video", label: "OpenRouter video", mode: "identifier", providerEngine: "openrouter" },
    { feature: "local_image", label: "Local Draw Things image", mode: "catalog", providerEngine: "draw-things", choices: [{ id: "draw-things__current", label: "Current Draw Things model" }] },
    { feature: "planning", label: "Planning model", mode: "planning" },
    { feature: "cinema_planning", label: "Cinema planning model", mode: "planning" },
];

const featureMap = new Map(ADMIN_MODEL_FEATURES.map(feature => [feature.feature, feature]));
const identifierPattern = /^[a-z0-9][a-z0-9./_-]{0,199}$/i;

function settingsPath(): string {
    const root = process.env.STUDIO_SETTINGS_DIR || path.join(process.cwd(), "private-settings");
    return path.join(root, "admin-model-settings.json");
}

function validateFeature(feature: string): AdminModelFeature {
    const definition = featureMap.get(feature);
    if (!definition) throw new Error("ERR_UNKNOWN_MODEL_FEATURE");
    return definition;
}

export function validateModelSetting(feature: string, input: { model_id?: unknown; provider_engine?: unknown }): AdminModelSetting {
    const definition = validateFeature(feature);
    const modelId = typeof input.model_id === "string" ? input.model_id.trim() : "";
    if (definition.mode === "planning") {
        if (!modelId || modelId.length > 200) throw new Error("ERR_INVALID_MODEL_ID");
        const providerEngine = typeof input.provider_engine === "string" ? input.provider_engine : "";
        if (providerEngine !== "ollama" && providerEngine !== "lm-studio") throw new Error("ERR_INVALID_PLANNING_ENGINE");
        return { feature, model_id: modelId, provider_engine: providerEngine, updated_at: new Date().toISOString() };
    }
    if (definition.mode === "identifier") {
        if (!identifierPattern.test(modelId)) throw new Error("ERR_INVALID_MODEL_ID");
        return { feature, model_id: modelId, provider_engine: definition.providerEngine, updated_at: new Date().toISOString() };
    }
    if (!modelId || !definition.choices?.some(choice => choice.id === modelId)) throw new Error("ERR_INVALID_MODEL_ID");
    return { feature, model_id: modelId, provider_engine: definition.providerEngine, updated_at: new Date().toISOString() };
}

async function readStore(): Promise<Record<string, AdminModelSetting>> {
    try {
        const parsed = JSON.parse(await fs.readFile(settingsPath(), "utf8")) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
        return Object.fromEntries(Object.entries(parsed as Record<string, unknown>)
            .filter(([feature, value]) => featureMap.has(feature) && value && typeof value === "object" && typeof (value as AdminModelSetting).model_id === "string")
            .map(([feature, value]) => [feature, value as AdminModelSetting]));
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
        throw new Error("ERR_MODEL_SETTINGS_READ");
    }
}

let writeQueue: Promise<void> = Promise.resolve();

function enqueueWrite(operation: () => Promise<void>): Promise<void> {
    writeQueue = writeQueue.then(operation).catch(error => { throw error; });
    return writeQueue;
}

export async function listAdminModelSettings(): Promise<AdminModelSetting[]> {
    const store = await readStore();
    return ADMIN_MODEL_FEATURES.map(feature => ({
        feature: feature.feature,
        model_id: store[feature.feature]?.model_id ?? "",
        provider_engine: store[feature.feature]?.provider_engine,
        updated_at: store[feature.feature]?.updated_at ?? "",
    }));
}

export async function saveAdminModelSetting(feature: string, input: { model_id?: unknown; provider_engine?: unknown }): Promise<AdminModelSetting> {
    const setting = validateModelSetting(feature, input);
    await enqueueWrite(async () => {
        const root = path.dirname(settingsPath());
        await fs.mkdir(root, { recursive: true, mode: 0o700 });
        const store = await readStore();
        store[feature] = setting;
        const temporary = `${settingsPath()}.${randomUUID()}.tmp`;
        try {
            await fs.writeFile(temporary, JSON.stringify(store), { mode: 0o600, flag: "wx" });
            await fs.rename(temporary, settingsPath());
        } finally {
            await fs.unlink(temporary).catch(() => {});
        }
    });
    return setting;
}

export async function getFeatureModel(feature: string): Promise<string | null> {
    const store = await readStore();
    return store[feature]?.model_id || null;
}

export async function getFeatureSetting(feature: string): Promise<AdminModelSetting | null> {
    const store = await readStore();
    return store[feature] ?? null;
}
