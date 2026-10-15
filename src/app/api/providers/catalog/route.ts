import { NextRequest, NextResponse } from "next/server";
import { openRouterCatalog, discoverLocalEngine } from "@/lib/provider-catalog";
import { publicErrorMessage } from "@/lib/public-error";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
    const engine = request.nextUrl.searchParams.get("engine") || "openrouter";
    const headers = { "Cache-Control": "no-store" };
    try {
        if (engine === "openrouter") {
            const kind = request.nextUrl.searchParams.get("kind");
            if (kind !== "image" && kind !== "video") throw new Error("ERR_INVALID_MEDIA_KIND");
            return NextResponse.json({ engine, kind, models: await openRouterCatalog(kind) }, { headers });
        }
        if (engine === "lmstudio" || engine === "ollama" || engine === "drawthings") return NextResponse.json(await discoverLocalEngine(engine), { headers });
        throw new Error("ERR_UNKNOWN_ENGINE");
    } catch (error) { return NextResponse.json({ error: publicErrorMessage(error) }, { status: 400, headers }); }
}
