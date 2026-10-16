import { NextRequest, NextResponse } from "next/server";
import { BUILTIN_RECIPES, SKILL_SOURCES } from "@/lib/skill-catalog";
import { mutateSkillLibrary, readSkillLibrary, type SkillLibrary } from "@/lib/skill-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
function response(library: SkillLibrary) {
    return NextResponse.json({ revision: library.revision, recipes: [...BUILTIN_RECIPES, ...library.recipes], favorites: library.favorites, sources: SKILL_SOURCES }, { headers });
}
function failure(error: unknown) {
    const code = error instanceof Error ? error.message : "";
    const status = code === "ERR_SKILLS_CONFLICT" ? 409 : code === "ERR_SKILLS_NOT_FOUND" ? 404 : code === "ERR_SKILLS_VALIDATION" ? 400 : code === "ERR_SKILLS_LIMIT" ? 409 : 503;
    return NextResponse.json({ error: status === 503 ? "ERR_SKILLS_STORAGE" : code }, { status, headers });
}
export async function GET() {
    try { return response(await readSkillLibrary()); } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
    // This route retains the deployment's existing shared-owner authentication boundary.
    const origin = process.env.STUDIO_PUBLIC_ORIGIN || request.nextUrl.origin;
    if (request.headers.get("origin") !== origin) return NextResponse.json({ error: "ERR_ORIGIN" }, { status: 403, headers });
    if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return NextResponse.json({ error: "ERR_CONTENT_TYPE" }, { status: 415, headers });
    try {
        const reader = request.body?.getReader();
        if (!reader) return NextResponse.json({ error: "ERR_SKILLS_VALIDATION" }, { status: 400, headers });
        const chunks: Uint8Array[] = []; let bytes = 0;
        try {
            while (true) {
                const { done, value } = await reader.read(); if (done) break;
                bytes += value.length;
                if (bytes > 16 * 1024) { await reader.cancel(); return NextResponse.json({ error: "ERR_BODY_LIMIT" }, { status: 413, headers }); }
                chunks.push(value);
            }
        } finally { reader.releaseLock(); }
        let input: unknown;
        try { input = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
        catch { return NextResponse.json({ error: "ERR_SKILLS_VALIDATION" }, { status: 400, headers }); }
        return response(await mutateSkillLibrary(input));
    } catch (error) { return failure(error); }
}
