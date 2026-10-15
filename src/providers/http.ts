import { assertSafeRemoteUrl } from "@/lib/safe-url";

export const MAX_MEDIA_BYTES = 256 * 1024 * 1024;
export async function boundedBytes(response: Response, limit = MAX_MEDIA_BYTES): Promise<Uint8Array> {
    if (Number(response.headers.get("content-length") || 0) > limit) throw new Error("ERR_PROVIDER_RESPONSE_TOO_LARGE");
    const reader = response.body?.getReader();
    if (!reader) throw new Error("ERR_EMPTY_PROVIDER_RESPONSE");
    const parts: Uint8Array[] = []; let total = 0;
    try {
        while (true) {
            const { done, value } = await reader.read(); if (done) break;
            total += value.length;
            if (total > limit) throw new Error("ERR_PROVIDER_RESPONSE_TOO_LARGE");
            parts.push(value);
        }
    } finally { await reader.cancel().catch(() => {}); }
    return Buffer.concat(parts, total);
}
export async function providerJson(url: string, init: RequestInit = {}, label = "PROVIDER") {
    let response: Response;
    try { response = await fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(init.method === "POST" ? 300_000 : 30_000) }); }
    catch { throw new Error(init.method === "POST" ? `ERR_${label}_SUBMISSION_UNCERTAIN` : `ERR_${label}_UNREACHABLE`); }
    if (!response.ok) throw new Error(`ERR_${label}_HTTP_${response.status}`);
    try { return JSON.parse(Buffer.from(await boundedBytes(response, 40 * 1024 * 1024)).toString("utf8")) as Record<string, unknown>; }
    catch (error) { if (error instanceof Error && error.message.startsWith("ERR_")) throw error; throw new Error(`ERR_${label}_INVALID_RESPONSE`); }
}
/** Follow public output redirects without forwarding provider credentials. */
export async function downloadPublicMedia(value: string): Promise<{ data: Uint8Array; mimeType: string }> {
    let url = value;
    for (let n = 0; n < 4; n++) {
        const safe = await assertSafeRemoteUrl(url);
        const response = await fetch(safe, { redirect: "manual", signal: AbortSignal.timeout(120_000) });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
            const location = response.headers.get("location"); if (!location) break;
            url = new URL(location, safe).href; await response.body?.cancel(); continue;
        }
        if (!response.ok) throw new Error(`ERR_MEDIA_DOWNLOAD_HTTP_${response.status}`);
        return { data: await boundedBytes(response), mimeType: response.headers.get("content-type")?.split(";")[0] || "application/octet-stream" };
    }
    throw new Error("ERR_MEDIA_REDIRECT_LIMIT");
}
export function validJobId(value: unknown): string {
    if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,200}$/.test(value)) throw new Error("ERR_INVALID_PROVIDER_JOB_ID");
    return value;
}
