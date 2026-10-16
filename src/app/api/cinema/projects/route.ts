import { NextRequest, NextResponse } from "next/server";
import { createCinemaProject, listCinemaProjects } from "@/lib/cinema-store";
import type { CinemaAspectRatio } from "@/types/cinema";
import { cinemaBody, cinemaError, cinemaHeaders } from "./_shared";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
    try { return NextResponse.json({ projects: await listCinemaProjects() }, { headers: cinemaHeaders }); }
    catch (error) { return cinemaError(error); }
}
export async function POST(request: NextRequest) {
    try {
        const input = await cinemaBody(request);
        const project = await createCinemaProject(input as { title?: string; brief?: string; aspectRatio?: CinemaAspectRatio });
        return NextResponse.json({ project }, { status: 201, headers: cinemaHeaders });
    } catch (error) { return cinemaError(error); }
}
