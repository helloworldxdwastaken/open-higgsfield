import { NextRequest, NextResponse } from "next/server";
export const cinemaHeaders = { "Cache-Control": "private, no-store", Pragma: "no-cache" };
const LIMIT = 250 * 1024;
export function cinemaError(error: unknown): NextResponse {
    const code = error instanceof Error ? error.message : "";
    const status: Record<string, number> = {
        ERR_CINEMA_NOT_FOUND: 404, ERR_CINEMA_VERSION_CONFLICT: 409, ERR_CINEMA_BUSY: 409,
        ERR_CINEMA_VALIDATION: 400, ERR_CINEMA_LIMIT: 400, ERR_CINEMA_ORIGIN: 403,
        ERR_CINEMA_JSON_REQUIRED: 415, ERR_CINEMA_BODY_TOO_LARGE: 413,
    };
    return NextResponse.json({ error: status[code] ? code : "ERR_CINEMA_STORAGE" }, { status: status[code] || 500, headers: cinemaHeaders });
}
export async function cinemaBody(request: NextRequest): Promise<Record<string, unknown>> {
    if (!request.headers.get("origin") || request.headers.get("origin") !== (process.env.STUDIO_PUBLIC_ORIGIN || request.nextUrl.origin)) throw new Error("ERR_CINEMA_ORIGIN");
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new Error("ERR_CINEMA_JSON_REQUIRED");
    if (Number(request.headers.get("content-length") || 0) > LIMIT) throw new Error("ERR_CINEMA_BODY_TOO_LARGE");
    const reader = request.body?.getReader();
    if (!reader) throw new Error("ERR_CINEMA_VALIDATION");
    const parts: Uint8Array[] = []; let total = 0;
    try {
        while (true) {
            const { done, value } = await reader.read(); if (done) break;
            total += value.length;
            if (total > LIMIT) throw new Error("ERR_CINEMA_BODY_TOO_LARGE");
            parts.push(value);
        }
    } finally { await reader.cancel().catch(() => {}); }
    try {
        const body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(parts, total)));
        if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
        return body;
    } catch { throw new Error("ERR_CINEMA_VALIDATION"); }
}
