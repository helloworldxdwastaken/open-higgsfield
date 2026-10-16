import { NextRequest, NextResponse } from "next/server";
import { cinemaSubmissionStatus, generateCinemaShot, type CinemaGenerateInput } from "@/lib/cinema-service";
import { getCinemaProject } from "@/lib/cinema-store";
import { publicErrorMessage } from "@/lib/public-error";
import { cinemaBody } from "../projects/_shared";

export const runtime = "nodejs";
export const maxDuration = 300;
const headers = { "Cache-Control": "private, no-store" };
export async function POST(request: NextRequest) {
    let projectId: string | undefined;
    try {
        const body = await cinemaBody(request);
        projectId = typeof body?.projectId === "string" ? body.projectId : undefined;
        return NextResponse.json(await generateCinemaShot(body as unknown as CinemaGenerateInput), { headers });
    } catch (error) {
        const code = publicErrorMessage(error, "ERR_CINEMA_VALIDATION");
        const status = errorStatus(code);
        const project = projectId ? await getCinemaProject(projectId).catch(() => undefined) : undefined;
        return NextResponse.json({ error: code, ...(project ? { project } : {}) }, { status, headers });
    }
}

function errorStatus(code: string) {
    const explicit: Record<string, number> = { ERR_CINEMA_ORIGIN: 403, ERR_CINEMA_JSON_REQUIRED: 415, ERR_CINEMA_BODY_TOO_LARGE: 413, ERR_CINEMA_STORAGE: 500 };
    return explicit[code] || (["ERR_CINEMA_NOT_FOUND", "ERR_CINEMA_SHOT_NOT_FOUND", "ERR_CINEMA_REQUEST_NOT_FOUND"].includes(code) ? 404 : ["ERR_CINEMA_VERSION_CONFLICT", "ERR_CINEMA_BUSY", "ERR_CINEMA_SUBMISSION_UNCERTAIN", "ERR_CINEMA_REQUEST_REUSE", "ERR_CINEMA_JOB_UNAVAILABLE"].includes(code) ? 409 : 400);
}

export async function GET(request: NextRequest) {
    const projectId = request.nextUrl.searchParams.get("projectId") || "";
    const requestId = request.nextUrl.searchParams.get("requestId") || "";
    try { return NextResponse.json(await cinemaSubmissionStatus(projectId, requestId), { headers }); }
    catch (error) {
        const code = publicErrorMessage(error, "ERR_CINEMA_VALIDATION");
        const project = await getCinemaProject(projectId).catch(() => undefined);
        return NextResponse.json({ error: code, ...(project ? { project } : {}) }, { status: errorStatus(code), headers });
    }
}
