import { NextRequest, NextResponse } from "next/server";
import { openRouterCatalog, catalogCapability } from "@/lib/provider-catalog";
import { submitGeneration } from "@/lib/generation-service";
import { initStore } from "@/lib/task-store";
import { publicErrorMessage } from "@/lib/public-error";
import type { ModelCapabilities } from "@/models/capabilities/types";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: NextRequest) {
    const headers = { "Cache-Control": "no-store" };
    if (!request.headers.get("origin") || request.headers.get("origin") !== process.env.STUDIO_PUBLIC_ORIGIN) return NextResponse.json({ error: "Studio origin required." }, { status: 403, headers });
    if (!request.headers.get("content-type")?.startsWith("application/json")) return NextResponse.json({ error: "JSON required." }, { status: 415, headers });
    try {
        const raw = await request.text(); if (raw.length > 65536) throw new Error("ERR_REQUEST_TOO_LARGE");
        const body = JSON.parse(raw);
        if (!body || typeof body !== "object" || typeof body.prompt !== "string" || !body.prompt.trim() || body.prompt.length > 10000) throw new Error("ERR_INVALID_PROMPT");
        const kind = body.kind;
        if (kind !== "image" && kind !== "video") throw new Error("ERR_INVALID_MEDIA_KIND");
        let caps: ModelCapabilities;
        if (body.engine === "openrouter") {
            const model = (await openRouterCatalog(kind)).find(entry => entry.id === body.modelId);
            if (!model) throw new Error("ERR_UNKNOWN_OPENROUTER_MEDIA_MODEL");
            caps = catalogCapability(model);
        } else if (body.engine === "drawthings" && kind === "image") {
            caps = { id: "draw-things__current", label: "Draw Things current image model", family: "Draw Things", variant: "", group: "Local engines", provider: "draw-things", provider_model_id: "current", provider_mode: "image-model", prompt_required: true, duration: false, aspect_ratio: false, size: false, resolution_variant: false, negative_prompt: false, cfg_scale: false, style: false, shot_type: false, prompt_expansion: false, elements: false, media_slots: [], custom_fields: [] };
        } else { throw new Error("ERR_UNSUPPORTED_ENGINE"); }
        const params = { model_id: caps.id, prompt: body.prompt.trim(), duration: typeof body.duration === "string" && body.duration ? body.duration : undefined, resolution: typeof body.resolution === "string" && body.resolution ? body.resolution : undefined, aspect_ratio: typeof body.aspectRatio === "string" && body.aspectRatio ? body.aspectRatio : undefined };
        const refs = body.referenceUrls === undefined ? [] : body.referenceUrls;
        if (!Array.isArray(refs) || refs.length > 8 || refs.some(value => typeof value !== "string" || value.length > 2083)) throw new Error("ERR_INVALID_REFERENCES");
        for (const field of ["firstFrameUrl", "lastFrameUrl"]) if (body[field] !== undefined && (typeof body[field] !== "string" || body[field].length > 2083)) throw new Error("ERR_INVALID_FRAME_IMAGE");
        const images = Object.fromEntries(refs.map((url, i) => [`reference_${i}`, url]));
        if (body.firstFrameUrl) images.start_image = body.firstFrameUrl;
        if (body.lastFrameUrl) images.end_image = body.lastFrameUrl;
        await initStore();
        const taskId = await submitGeneration({ mediaType: kind, modelId: caps.id, capabilities: caps, params, media: { images }, reuseState: { providerStudio: true } });
        return NextResponse.json({ task_id: taskId }, { headers });
    } catch (error) { return NextResponse.json({ error: publicErrorMessage(error) }, { status: 400, headers }); }
}
