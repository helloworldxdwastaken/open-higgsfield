import sharp from "sharp";
import { localEngineUrl } from "@/lib/provider-endpoints";
import { providerJson } from "./http";
import type { GenerationProvider, ProviderGenerationRequest, ProviderSubmission, ProviderPollResult } from "./types";
const globalEngine = globalThis as typeof globalThis & { __highfieldDrawThingsBusy?: boolean };
export class DrawThingsProvider implements GenerationProvider {
    readonly id = "draw-things" as const;
    async submit(request: ProviderGenerationRequest): Promise<ProviderSubmission> {
        if (request.mediaType !== "image" || request.providerModelId !== "current") throw new Error("ERR_DRAW_THINGS_IMAGE_ONLY");
        if (!request.params.prompt.trim() || request.params.prompt.length > 10000) throw new Error("ERR_INVALID_PROMPT");
        if (Object.keys(request.media.images || {}).length || request.media.video || request.media.audio) throw new Error("ERR_DRAW_THINGS_TEXT_TO_IMAGE_ONLY");
        if (globalEngine.__highfieldDrawThingsBusy) throw new Error("ERR_LOCAL_ENGINE_BUSY");
        globalEngine.__highfieldDrawThingsBusy = true;
        try {
            // Keep the app's already-selected model and settings. No download, model switch or cloud fallback.
            const response = await providerJson(localEngineUrl("DRAW_THINGS_URL", "/sdapi/v1/txt2img"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: request.params.prompt, batch_count: 1, batch_size: 1 }) }, "DRAW_THINGS");
            const images = Array.isArray(response.images) ? response.images : [];
            const assets = [];
            for (const image of images.slice(0, 4)) {
                if (typeof image !== "string" || image.length > 40 * 1024 * 1024 || !/^[A-Za-z0-9+/=\r\n]+$/.test(image)) throw new Error("ERR_INVALID_LOCAL_IMAGE_OUTPUT");
                const data = Buffer.from(image, "base64");
                const metadata = await sharp(data).metadata();
                const mimeType = metadata.format === "jpeg" ? "image/jpeg" : metadata.format === "webp" ? "image/webp" : metadata.format === "png" ? "image/png" : undefined;
                if (!mimeType) throw new Error("ERR_INVALID_LOCAL_IMAGE_OUTPUT");
                assets.push({ data, mimeType });
            }
            if (!assets.length) throw new Error("ERR_NO_IMAGE_GENERATED");
            return { status: "COMPLETED", assets };
        } finally { globalEngine.__highfieldDrawThingsBusy = false; }
    }
    async poll(): Promise<ProviderPollResult> { throw new Error("ERR_DRAW_THINGS_HAS_NO_ASYNC_JOB_API"); }
}
