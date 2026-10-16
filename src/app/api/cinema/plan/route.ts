import { NextRequest, NextResponse } from "next/server";
import { planCinemaProject } from "@/lib/cinema-service";
import { getCinemaProject } from "@/lib/cinema-store";
import { publicErrorMessage } from "@/lib/public-error";
import { getRequestSessionUser } from "@/lib/users";
import { cinemaBody } from "../projects/_shared";
import type { DirectorEngine } from "@/lib/director";

export const runtime = "nodejs";
export const maxDuration = 180;
const headers = { "Cache-Control": "private, no-store" };
export async function POST(request: NextRequest) {
    let projectId: string | undefined;
    try {
        const user = await getRequestSessionUser(request);
        if (!user) return NextResponse.json({ error: "ERR_AUTHENTICATION_REQUIRED" }, { status: 401, headers });
        const body = await cinemaBody(request);
        projectId = typeof body?.projectId === "string" ? body.projectId : undefined;
        return NextResponse.json(await planCinemaProject({ ...(body as unknown as { projectId: string; version: number; engine: DirectorEngine; model: string; shotCount: number }), userId: user.id }), { headers });
    } catch (error) {
        const code = publicErrorMessage(error, "ERR_CINEMA_VALIDATION");
        const explicit: Record<string, number> = { ERR_CINEMA_ORIGIN: 403, ERR_CINEMA_JSON_REQUIRED: 415, ERR_CINEMA_BODY_TOO_LARGE: 413, ERR_CINEMA_STORAGE: 500 };
        const status = explicit[code] || (code === "ERR_CINEMA_NOT_FOUND" ? 404 : ["ERR_CINEMA_VERSION_CONFLICT", "ERR_CINEMA_BUSY"].includes(code) ? 409 : 400);
        const user = await getRequestSessionUser(request);
        const project = user && projectId ? await getCinemaProject(projectId, user.id).catch(() => undefined) : undefined;
        return NextResponse.json({ error: code, ...(project ? { project } : {}) }, { status, headers });
    }
}
