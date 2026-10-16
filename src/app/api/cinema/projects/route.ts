import { NextRequest, NextResponse } from "next/server";
import { createCinemaProject, listCinemaProjects } from "@/lib/cinema-store";
import type { CinemaAspectRatio } from "@/types/cinema";
import { cinemaBody, cinemaError, cinemaHeaders } from "./_shared";
import { getRequestSessionUser } from "@/lib/users";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
    const user = await getRequestSessionUser(request);
    if (!user) return NextResponse.json({ error: "ERR_AUTHENTICATION_REQUIRED" }, { status: 401, headers: cinemaHeaders });
    try { return NextResponse.json({ projects: await listCinemaProjects(user.id) }, { headers: cinemaHeaders }); }
    catch (error) { return cinemaError(error); }
}
export async function POST(request: NextRequest) {
    try {
        const user = await getRequestSessionUser(request);
        if (!user) return NextResponse.json({ error: "ERR_AUTHENTICATION_REQUIRED" }, { status: 401, headers: cinemaHeaders });
        const input = await cinemaBody(request);
        const project = await createCinemaProject(input as { title?: string; brief?: string; aspectRatio?: CinemaAspectRatio }, user.id);
        return NextResponse.json({ project }, { status: 201, headers: cinemaHeaders });
    } catch (error) { return cinemaError(error); }
}
