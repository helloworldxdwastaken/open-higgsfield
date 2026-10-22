import { NextRequest, NextResponse } from "next/server";
import { getRequestSessionUser } from "@/lib/users";

export const audioHeaders = { "Cache-Control": "private, no-store, max-age=0", Pragma: "no-cache", "X-Content-Type-Options": "nosniff" };
export async function audioUser(request: NextRequest, mutation = false) {
    const user = await getRequestSessionUser(request);
    if (!user) throw new Error("ERR_AUTHENTICATION_REQUIRED");
    if (mutation && (request.headers.get("origin") !== (process.env.STUDIO_PUBLIC_ORIGIN || request.nextUrl.origin) || request.headers.get("sec-fetch-site") === "cross-site")) throw new Error("ERR_AUDIO_ORIGIN");
    return user;
}
export function audioError(error: unknown) {
    const codes: Record<string, [number, string]> = {
        ERR_AUTHENTICATION_REQUIRED: [401, "Sign in to Highfield to use VoiceLab."],
        ERR_AUDIO_ORIGIN: [403, "This request could not be verified. Refresh the page and try again."],
        ERR_AUDIO_NOT_FOUND: [404, "This audio item was not found."],
        ERR_AUDIO_INPUT: [400, "Check your settings and audio file. Voice samples must contain 2–30 seconds of clear speech."],
        ERR_AUDIO_FILE: [400, "Choose an audio file up to 25 MB: WAV, MP3, M4A, OGG, FLAC, AAC, WebM or Opus."],
        ERR_AUDIO_FILE_LIMIT: [413, "This audio file is too large."],
        ERR_AUDIO_CONSENT: [400, "Confirm that you have permission to clone this voice."],
        ERR_AUDIO_MODEL_NOT_READY: [503, "The local model is not ready yet."],
        ERR_AUDIO_ENGINE_OFFLINE: [503, "The local audio engine is offline. Please try again shortly."],
        ERR_AUDIO_ENGINE: [502, "The local audio engine could not complete this request."],
        ERR_AUDIO_BUSY: [409, "Your VoiceLab workspace is busy. Wait for the current requests to finish."],
        ERR_AUDIO_LIBRARY_LIMIT: [409, "Your audio library is full. Remove an item before adding another."],
        ERR_STORAGE_QUOTA_EXCEEDED: [413, "Your workspace storage is full."],
    };
    const code = error instanceof Error ? error.message : "";
    const [status, message] = codes[code] ?? [500, "Your VoiceLab workspace could not be loaded. Please try again."];
    return NextResponse.json({ error: message }, { status, headers: audioHeaders });
}
export async function audioBody(request: NextRequest, multipart = false) {
    const limit = multipart ? 26 * 1024 * 1024 : 512 * 1024;
    if (Number(request.headers.get("content-length") || 0) > limit) throw new Error("ERR_AUDIO_FILE_LIMIT");
    const reader = request.body?.getReader(); if (!reader) throw new Error("ERR_AUDIO_INPUT");
    const parts: Uint8Array[] = []; let size = 0;
    try {
        while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > limit) throw new Error("ERR_AUDIO_FILE_LIMIT"); parts.push(value); }
    } finally { await reader.cancel().catch(() => {}); }
    const bytes = Buffer.concat(parts, size);
    if (multipart) {
        try { return await new Response(bytes, { headers: { "Content-Type": request.headers.get("content-type") || "" } }).formData(); }
        catch { throw new Error("ERR_AUDIO_INPUT"); }
    }
    if (request.headers.get("content-type")?.split(";")[0] !== "application/json") throw new Error("ERR_AUDIO_INPUT");
    try { const value = JSON.parse(bytes.toString("utf8")); if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(); return value as Record<string, unknown>; }
    catch { throw new Error("ERR_AUDIO_INPUT"); }
}
