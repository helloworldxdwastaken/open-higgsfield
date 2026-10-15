import type { GenerationProvider, ProviderGenerationRequest, ProviderPollRequest, ProviderPollResult, ProviderSubmission } from "./types";
import { downloadPublicMedia, providerJson, validJobId } from "./http";
import { getMediaUrls } from "./utils";
import { assertSafeRemoteUrl } from "@/lib/safe-url";
import { refreshConnections } from "@/lib/connections";

const BASE = "https://api.higgsfield.ai";
const MODELS = new Set(["higgsfield/genjutsu/motion-transfer/v1.0", "higgsfield/genjutsu/object-swap/v1.0", "higgsfield/cinema-studio/4.0"]);
function headers() {
    refreshConnections();
    const credentials = process.env.HF_CREDENTIALS;
    if (!credentials) throw new Error("ERR_HIGGSFIELD_NOT_CONFIGURED");
    return { Authorization: `Key ${credentials}`, "Content-Type": "application/json" };
}
export async function uploadHiggsfieldMedia(data: Uint8Array, mimeType: string): Promise<string> {
    if (!data.length || data.length > 256 * 1024 * 1024) throw new Error("ERR_UPLOAD_SIZE_LIMIT");
    const result = await providerJson(`${BASE}/files/generate-upload-url`, { method: "POST", headers: headers(), body: JSON.stringify({ content_type: mimeType }) }, "HIGGSFIELD_UPLOAD");
    if (typeof result.upload_url !== "string" || typeof result.public_url !== "string") throw new Error("ERR_INVALID_UPLOAD_RESPONSE");
    const safeUpload = await assertSafeRemoteUrl(result.upload_url);
    const safePublic = await assertSafeRemoteUrl(result.public_url);
    if (safeUpload.protocol !== "https:" || safePublic.protocol !== "https:") throw new Error("ERR_INVALID_UPLOAD_RESPONSE");
    const uploadHeaders: Record<string, string> = {};
    if (result.upload_headers && typeof result.upload_headers === "object") {
        for (const [name, value] of Object.entries(result.upload_headers)) {
            if (typeof value !== "string" || /^(authorization|cookie|host)$/i.test(name)) throw new Error("ERR_INVALID_UPLOAD_RESPONSE");
            uploadHeaders[name] = value;
        }
    }
    const response = await fetch(safeUpload, { method: "PUT", headers: uploadHeaders, body: Buffer.from(data), redirect: "error", signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new Error(`ERR_HIGGSFIELD_UPLOAD_HTTP_${response.status}`);
    await response.body?.cancel();
    return safePublic.href;
}
export class HiggsfieldProvider implements GenerationProvider {
    readonly id = "higgsfield" as const;
    async submit(request: ProviderGenerationRequest): Promise<ProviderSubmission> {
        if (request.mediaType !== "video" || !MODELS.has(request.providerModelId)) throw new Error("ERR_UNSUPPORTED_HIGGSFIELD_MODEL");
        const { params } = request;
        const cinema = request.providerModelId === "higgsfield/cinema-studio/4.0";
        if (params.prompt.length > 10000 || (cinema && !params.prompt.trim())) throw new Error("ERR_INVALID_PROMPT");
        const resolution = params.resolution || "720p";
        if (!(cinema ? ["480p", "720p"] : ["480p", "720p", "1080p"]).includes(resolution)) throw new Error("ERR_INVALID_RESOLUTION");
        const body: Record<string, unknown> = { prompt: params.prompt, resolution };
        if (cinema) {
            const duration = Number(params.duration || 5);
            if (!Number.isInteger(duration) || duration < 4 || duration > 30) throw new Error("ERR_INVALID_DURATION");
            const ratio = params.aspect_ratio || "16:9";
            if (ratio !== "16:9") throw new Error("ERR_INVALID_ASPECT_RATIO");
            Object.assign(body, { duration, aspect_ratio: ratio, generate_audio: params.field_values?.generate_audio !== false });
        } else {
            const images = getMediaUrls(request.media);
            if (!request.media.video || images.length < 1 || images.length > 8) throw new Error("ERR_GENJUTSU_REQUIRES_VIDEO_AND_1_TO_8_IMAGES");
            await Promise.all([request.media.video, ...images].map(assertSafeRemoteUrl));
            Object.assign(body, { video_url: request.media.video, image_urls: images });
        }
        const response = await providerJson(`${BASE}/${request.providerModelId}`, { method: "POST", headers: headers(), body: JSON.stringify(body) }, "HIGGSFIELD");
        const requestId = validJobId(response.request_id);
        return { status: "CREATED", providerTaskId: requestId, operation: { requestId } };
    }
    async poll(request: ProviderPollRequest): Promise<ProviderPollResult> {
        const operation = request.operation as { requestId?: string; transientErrors?: number };
        const id = validJobId(operation?.requestId);
        let response: Record<string, unknown>;
        try { response = await providerJson(`${BASE}/requests/${id}/status`, { headers: headers() }, "HIGGSFIELD"); }
        catch (error) {
            if (error instanceof Error && /(?:UNREACHABLE|HTTP_(?:429|5[0-9]{2}))$/.test(error.message) && (operation.transientErrors || 0) < 5) return { status: "IN_PROGRESS", operation: { requestId: id, transientErrors: (operation.transientErrors || 0) + 1 } };
            throw error;
        }
        const status = String(response.status || "").toLowerCase();
        if (["failed", "nsfw", "error"].includes(status)) return { status: "FAILED", error: `ERR_HIGGSFIELD_${status.toUpperCase()}`, operation: { requestId: id } };
        if (["cancelled", "canceled"].includes(status)) return { status: "CANCELLED", error: "ERR_HIGGSFIELD_CANCELLED", operation: { requestId: id } };
        if (status === "completed") {
            const video = response.video as { url?: string } | undefined;
            if (!video?.url) throw new Error("ERR_HIGGSFIELD_MISSING_OUTPUT");
            const media = await downloadPublicMedia(video.url);
            if (!media.mimeType.startsWith("video/")) throw new Error("ERR_INVALID_VIDEO_OUTPUT");
            return { status: "COMPLETED", assets: [media], operation: { requestId: id } };
        }
        if (!["queued", "in_progress", "running", "processing", "pending", "created"].includes(status)) throw new Error("ERR_INVALID_PROVIDER_STATUS");
        return { status: "IN_PROGRESS", operation: { requestId: id } };
    }
}
