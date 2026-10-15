import { NextRequest, NextResponse } from "next/server";
import { createShotPlan, type DirectorEngine } from "@/lib/director";
import { publicErrorMessage } from "@/lib/public-error";

export const runtime = "nodejs";
export const maxDuration = 180;
const headers = { "Cache-Control": "no-store" };
let busy = false;

export async function POST(request: NextRequest) {
    const expected = process.env.STUDIO_PUBLIC_ORIGIN || request.nextUrl.origin;
    if (request.headers.get("origin") !== expected) return NextResponse.json({ error: "Use your studio to create a plan." }, { status: 403, headers });
    if (!request.headers.get("content-type")?.startsWith("application/json")) return NextResponse.json({ error: "JSON required." }, { status: 415, headers });
    if (busy) return NextResponse.json({ error: "A local plan is already running. Try again shortly." }, { status: 429, headers });
    try {
        const text = await request.text();
        if (text.length > 20000) return NextResponse.json({ error: "Brief too large." }, { status: 413, headers });
        const body = JSON.parse(text);
        if (typeof body.engine !== "string" || typeof body.model !== "string" || typeof body.brief !== "string") return NextResponse.json({ error: "Engine, model and brief are required." }, { status: 400, headers });
        busy = true;
        return NextResponse.json(await createShotPlan(body.engine as DirectorEngine, body.model, body.brief), { headers });
    } catch (error) {
        return NextResponse.json({ error: publicErrorMessage(error, "ERR_DIRECTOR_FAILED") }, { status: 400, headers });
    } finally { busy = false; }
}
