import { refreshConnections } from "./connections";
import { localEngineHeaders, localEngineUrl } from "./provider-endpoints";
import { providerJson } from "@/providers/http";
import type { ModelCapabilities } from "@/models/capabilities/types";
export type MediaKind = "image" | "video";
export interface MediaCatalogModel {
    id: string; name: string; description: string; kind: MediaKind;
    durations: string[]; resolutions: string[]; ratios: string[];
    acceptsImages: boolean; minReferences: number; frameTypes: string[]; sourceVideoWorkflow: boolean; vectorOnly: boolean; parameters: Record<string, unknown>; pricing?: unknown;
}
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter(v => typeof v === "string" || typeof v === "number").slice(0, 100).map(String) : []; }
function choices(parameters: Record<string, unknown>, key: string): string[] {
    const descriptor = parameters[key] as { type?: string; values?: unknown } | undefined;
    return descriptor?.type === "enum" ? strings(descriptor.values) : [];
}
const cache = new Map<string, { expires: number; models: MediaCatalogModel[] }>();
export async function openRouterCatalog(kind: MediaKind): Promise<MediaCatalogModel[]> {
    const saved = cache.get(kind); if (saved && saved.expires > Date.now()) return saved.models;
    const [response, general] = await Promise.all([
        providerJson(`https://openrouter.ai/api/v1/${kind === "image" ? "images" : "videos"}/models`, {}, "OPENROUTER_CATALOG"),
        kind === "video" ? providerJson("https://openrouter.ai/api/v1/models?output_modalities=video", {}, "OPENROUTER_CATALOG") : Promise.resolve({ data: [] }),
    ]);
    const architectureById = new Map((Array.isArray(general.data) ? general.data : []).map(entry => [entry.id, entry.architecture || {}]));
    if (!Array.isArray(response.data)) throw new Error("ERR_INVALID_MEDIA_CATALOG");
    const models: MediaCatalogModel[] = response.data.slice(0, 1000).flatMap((entry) => {
        if (!entry || typeof entry !== "object" || typeof entry.id !== "string" || !/^[a-zA-Z0-9._:/-]{1,200}$/.test(entry.id)) return [];
        const architecture = entry.architecture || architectureById.get(entry.id) || {};
        if (Array.isArray(architecture.output_modalities) && !architecture.output_modalities.includes(kind)) return [];
        const parameters = typeof entry.supported_parameters === "object" && !Array.isArray(entry.supported_parameters) ? entry.supported_parameters || {} : {};
        return [{ id: entry.id, name: typeof entry.name === "string" ? entry.name : entry.id, description: typeof entry.description === "string" ? entry.description.slice(0, 1500) : "", kind,
            durations: strings(entry.supported_durations), resolutions: kind === "video" ? strings(entry.supported_resolutions) : choices(parameters, "resolution"),
            ratios: kind === "video" ? strings(entry.supported_aspect_ratios) : choices(parameters, "aspect_ratio"),
            acceptsImages: kind === "image" && Array.isArray(architecture.input_modalities) && architecture.input_modalities.includes("image"),
            vectorOnly: choices(parameters, "output_format").length > 0 && choices(parameters, "output_format").every(value => value === "svg"),
            minReferences: parameters.input_references?.type === "range" ? Math.max(0, Number(parameters.input_references.min) || 0) : 0,
            frameTypes: strings(entry.supported_frame_images).filter(value => ["first_frame", "last_frame"].includes(value)),
            sourceVideoWorkflow: kind === "video" && Array.isArray(architecture.input_modalities) && architecture.input_modalities.includes("video") && !strings(entry.supported_durations).length && !strings(entry.supported_resolutions).length,
            parameters, pricing: entry.pricing_skus || entry.pricing,
        }];
    });
    cache.set(kind, { expires: Date.now() + 60_000, models }); return models;
}
export function catalogCapability(model: MediaCatalogModel): ModelCapabilities {
    return { id: `openrouter__${model.id}`, label: model.name, family: model.name, variant: "", group: "OpenRouter", provider: "openrouter", provider_model_id: model.id,
        provider_mode: model.kind === "video" ? "video" : "image-model", prompt_required: true, prompt_max: 10000,
        duration: model.durations.length ? { options: model.durations, default: model.durations[0] } : false,
        resolution_variant: model.resolutions.length ? { options: model.resolutions, default: model.resolutions[0] } : false,
        aspect_ratio: model.ratios.length ? { options: model.ratios.map(r => [r, r] as [string, string]), default: [model.ratios[0], model.ratios[0]] } : false,
        size: false, negative_prompt: false, cfg_scale: false, style: false, shot_type: false, prompt_expansion: false, elements: false,
        media_slots: model.acceptsImages ? [{ id: "reference_images", label: "Reference images", kind: "image", multiple: true }] : model.frameTypes.map(frame => ({ id: frame === "first_frame" ? "start_image" : "end_image", label: frame === "first_frame" ? "First frame" : "Last frame", kind: "image" as const })), custom_fields: [],
    };
}
export async function discoverLocalEngine(engine: "lmstudio" | "ollama" | "drawthings") {
    refreshConnections();
    if (engine === "lmstudio") {
        const response = await providerJson(localEngineUrl("LM_STUDIO_URL", "/api/v1/models"), { headers: localEngineHeaders("LM_STUDIO_URL") }, "LM_STUDIO");
        const entries = Array.isArray(response.models) ? response.models : [];
        return { engine, capability: "planning / vision when supported", models: entries.map(entry => ({ id: entry.key || entry.id, name: entry.display_name || entry.key || entry.id, loaded: Array.isArray(entry.loaded_instances) && entry.loaded_instances.length > 0, type: entry.type || "unknown", supportsPlanning: entry.type === "llm", capabilities: entry.capabilities || {} })) };
    }
    if (engine === "ollama") {
        const [available, running] = await Promise.all([
            providerJson(localEngineUrl("OLLAMA_URL", "/api/tags"), {}, "OLLAMA"),
            providerJson(localEngineUrl("OLLAMA_URL", "/api/ps"), {}, "OLLAMA"),
        ]);
        const active = new Set((Array.isArray(running.models) ? running.models : []).map(entry => entry.name || entry.model));
        return { engine, capability: "planning / vision when supported; image generation requires a verified macOS engine", models: (Array.isArray(available.models) ? available.models : []).map(entry => ({ id: entry.name || entry.model, name: entry.name || entry.model, loaded: active.has(entry.name || entry.model), type: Array.isArray(entry.capabilities) && entry.capabilities.includes("embedding") && !entry.capabilities.includes("completion") ? "embedding" : Array.isArray(entry.capabilities) && entry.capabilities.includes("completion") ? "llm" : "unknown", supportsPlanning: Array.isArray(entry.capabilities) ? entry.capabilities.includes("completion") : null, capabilities: entry.capabilities || [], details: entry.details })) };
    }
    const options = await providerJson(localEngineUrl("DRAW_THINGS_URL", "/sdapi/v1/options"), {}, "DRAW_THINGS");
    return { engine, capability: "local HTTP image generation; HTTP video is not advertised", models: typeof options.model === "string" ? [{ id: options.model, name: options.model, loaded: true }] : [], ready: true };
}
