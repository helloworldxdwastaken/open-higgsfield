import type { GenerationProvider, ProviderGenerationRequest, ProviderPollRequest, ProviderPollResult, ProviderSubmission } from "./types";
import { boundedBytes, downloadPublicMedia, providerJson, validJobId } from "./http";
import { openRouterCatalog } from "@/lib/provider-catalog";
import { refreshConnections } from "@/lib/connections";
import { getMediaUrls } from "./utils";
import { assertSafeRemoteUrl } from "@/lib/safe-url";
const BASE = "https://openrouter.ai/api/v1";
function headers() {
    refreshConnections();
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) throw new Error("ERR_OPENROUTER_NOT_CONFIGURED");
    return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}
function assertChoice(value: string | undefined, allowed: string[], label: string) {
    if (value && !allowed.includes(value)) throw new Error(`ERR_UNSUPPORTED_${label}`);
}
export class OpenRouterProvider implements GenerationProvider {
    readonly id = "openrouter" as const;
    async submit(request: ProviderGenerationRequest): Promise<ProviderSubmission> {
        const auth = headers();
        const model = (await openRouterCatalog(request.mediaType)).find(m => m.id === request.providerModelId);
        if (!model) throw new Error("ERR_UNKNOWN_OPENROUTER_MEDIA_MODEL");
        if (model.sourceVideoWorkflow) throw new Error("ERR_SOURCE_VIDEO_WORKFLOW_NOT_IMPLEMENTED");
        if (model.vectorOnly) throw new Error("ERR_VECTOR_EXPORT_NOT_IMPLEMENTED");
        const { params } = request;
        if (!params.prompt.trim() || params.prompt.length > 10000) throw new Error("ERR_INVALID_PROMPT");
        assertChoice(params.duration, model.durations, "DURATION");
        assertChoice(params.resolution, model.resolutions, "RESOLUTION");
        assertChoice(params.aspect_ratio, model.ratios, "ASPECT_RATIO");
        const images = request.media.images || {};
        const first = images.start_image;
        const last = images.end_image;
        const refs = getMediaUrls({ images: Object.fromEntries(Object.entries(images).filter(([key]) => !["start_image", "end_image"].includes(key))) });
        if (refs.length < model.minReferences || refs.length > 8 || (refs.length && !model.acceptsImages)) throw new Error("ERR_UNSUPPORTED_REFERENCE_IMAGES");
        if ((first && !model.frameTypes.includes("first_frame")) || (last && !model.frameTypes.includes("last_frame"))) throw new Error("ERR_UNSUPPORTED_FRAME_IMAGE");
        await Promise.all([...refs, first, last].filter((url): url is string => typeof url === "string" && Boolean(url)).map(assertSafeRemoteUrl));
        const body: Record<string, unknown> = { model: model.id, prompt: params.prompt };
        if (params.duration) body.duration = Number(params.duration);
        if (params.resolution) body.resolution = params.resolution;
        if (params.aspect_ratio) body.aspect_ratio = params.aspect_ratio;
        if (refs.length) body.input_references = refs.map(url => ({ type: "image_url", image_url: { url } }));
        const frames = [{ url: first, frame_type: "first_frame" }, { url: last, frame_type: "last_frame" }].filter(frame => frame.url);
        if (frames.length) body.frame_images = frames.map(frame => ({ type: "image_url", image_url: { url: frame.url }, frame_type: frame.frame_type }));
        if (request.mediaType === "image") {
            // Pin one endpoint whose definitive capabilities accept the requested values.
            const slug = model.id.split("/").map(encodeURIComponent).join("/");
            const details = await providerJson(`${BASE}/images/models/${slug}/endpoints`, {}, "OPENROUTER_CATALOG");
            const endpoints = Array.isArray(details.endpoints) ? details.endpoints : [];
            const endpoint = endpoints.find(entry => {
                if (typeof entry.provider_tag !== "string" || !entry.provider_tag) return false;
                const supported = entry.supported_parameters || {};
                const ref = supported.input_references;
                if (refs.length && (ref?.type !== "range" || refs.length < Number(ref.min || 0) || refs.length > Number(ref.max || 0))) return false;
                if (!refs.length && ref?.type === "range" && Number(ref.min || 0) > 0) return false;
                return ["resolution", "aspect_ratio"].every(key => {
                    if (!body[key]) return true;
                    const descriptor = supported[key];
                    return descriptor?.type === "enum" && Array.isArray(descriptor.values) && descriptor.values.includes(body[key]);
                });
            });
            if (!endpoint) throw new Error("ERR_NO_COMPATIBLE_OPENROUTER_ENDPOINT");
            body.provider = { only: [endpoint.provider_tag], allow_fallbacks: false };
            const response = await providerJson(`${BASE}/images`, { method: "POST", headers: auth, body: JSON.stringify(body) }, "OPENROUTER");
            const images = Array.isArray(response.data) ? response.data : [];
            const assets = images.slice(0, 10).flatMap(entry => {
                if (typeof entry.b64_json !== "string" || entry.b64_json.length > 40 * 1024 * 1024 || !/^[A-Za-z0-9+/=\r\n]+$/.test(entry.b64_json)) return [];
                const mimeType = typeof entry.media_type === "string" ? entry.media_type : "image/png";
                // Do not store executable SVG in the authenticated application origin.
                if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(mimeType)) return [];
                return [{ data: Buffer.from(entry.b64_json, "base64"), mimeType }];
            });
            if (!assets.length) throw new Error("ERR_NO_IMAGE_GENERATED");
            return { status: "COMPLETED", assets };
        }
        const response = await providerJson(`${BASE}/videos`, { method: "POST", headers: auth, body: JSON.stringify(body) }, "OPENROUTER");
        const jobId = validJobId(response.id);
        return { status: "CREATED", providerTaskId: jobId, operation: { jobId } };
    }
    async poll(request: ProviderPollRequest): Promise<ProviderPollResult> {
        const operation = request.operation as { jobId?: string; transientErrors?: number };
        const jobId = validJobId(operation?.jobId);
        let response: Record<string, unknown>;
        try { response = await providerJson(`${BASE}/videos/${jobId}`, { headers: headers() }, "OPENROUTER"); }
        catch (error) {
            if (error instanceof Error && /(?:UNREACHABLE|HTTP_(?:429|5[0-9]{2}))$/.test(error.message) && (operation.transientErrors || 0) < 5) return { status: "IN_PROGRESS", operation: { jobId, transientErrors: (operation.transientErrors || 0) + 1 } };
            throw error;
        }
        const status = String(response.status || "").toLowerCase();
        if (["failed", "expired"].includes(status)) return { status: "FAILED", error: "ERR_OPENROUTER_GENERATION_FAILED", operation: { jobId } };
        if (["cancelled", "canceled"].includes(status)) return { status: "CANCELLED", error: "ERR_OPENROUTER_CANCELLED", operation: { jobId } };
        if (status === "completed") {
            // Construct our own fixed-origin content route. Never trust returned URLs with a key.
            const content = await fetch(`${BASE}/videos/${jobId}/content?index=0`, { headers: headers(), redirect: "manual", signal: AbortSignal.timeout(120_000) });
            let asset;
            if ([301, 302, 303, 307, 308].includes(content.status)) {
                const location = content.headers.get("location");
                if (!location) throw new Error("ERR_OPENROUTER_MISSING_CONTENT");
                await content.body?.cancel();
                asset = await downloadPublicMedia(new URL(location, BASE).href);
            } else {
                if (!content.ok) throw new Error(`ERR_OPENROUTER_CONTENT_HTTP_${content.status}`);
                asset = { data: await boundedBytes(content), mimeType: content.headers.get("content-type")?.split(";")[0] || "video/mp4" };
            }
            if (!asset.mimeType.startsWith("video/")) throw new Error("ERR_INVALID_VIDEO_OUTPUT");
            return { status: "COMPLETED", assets: [asset], operation: { jobId } };
        }
        if (!["pending", "in_progress", "queued", "processing"].includes(status)) throw new Error("ERR_INVALID_PROVIDER_STATUS");
        return { status: "IN_PROGRESS", operation: { jobId } };
    }
}
