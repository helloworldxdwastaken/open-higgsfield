import { NextRequest, NextResponse } from "next/server";
import { deleteCinemaProject, getCinemaProject, updateCinemaProject } from "@/lib/cinema-store";
import type { CinemaAspectRatio, CinemaShot } from "@/types/cinema";
import { cinemaBody, cinemaError, cinemaHeaders } from "../_shared";
import { getRequestSessionUser } from "@/lib/users";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: NextRequest, context: Context) {
    try {
        const user = await getRequestSessionUser(request);
        if (!user) return NextResponse.json({ error: "ERR_AUTHENTICATION_REQUIRED" }, { status: 401, headers: cinemaHeaders });
        const project = await getCinemaProject((await context.params).id, user.id);
        if (!project) throw new Error("ERR_CINEMA_NOT_FOUND");
        return NextResponse.json({ project }, { headers: cinemaHeaders });
    } catch (error) { return cinemaError(error); }
}
export async function PUT(request: NextRequest, context: Context) {
    try {
        const user = await getRequestSessionUser(request);
        if (!user) return NextResponse.json({ error: "ERR_AUTHENTICATION_REQUIRED" }, { status: 401, headers: cinemaHeaders });
        const body = await cinemaBody(request);
        if (Object.keys(body).some(key => !["version", "title", "brief", "aspectRatio", "shots", "generationHistory"].includes(key))) throw new Error("ERR_CINEMA_VALIDATION");
        const { version, ...draft } = body;
        const project = await updateCinemaProject((await context.params).id, version as number, draft as { title: string; brief: string; aspectRatio: CinemaAspectRatio; shots: CinemaShot[] }, user.id);
        return NextResponse.json({ project }, { headers: cinemaHeaders });
    } catch (error) { return cinemaError(error); }
}
export async function DELETE(request: NextRequest, context: Context) {
    try {
        const user = await getRequestSessionUser(request);
        if (!user) return NextResponse.json({ error: "ERR_AUTHENTICATION_REQUIRED" }, { status: 401, headers: cinemaHeaders });
        const body = await cinemaBody(request);
        if (Object.keys(body).some(key => key !== "version")) throw new Error("ERR_CINEMA_VALIDATION");
        await deleteCinemaProject((await context.params).id, body.version as number, user.id);
        return NextResponse.json({ deleted: true }, { headers: cinemaHeaders });
    } catch (error) { return cinemaError(error); }
}
