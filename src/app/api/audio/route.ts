import { NextRequest, NextResponse } from "next/server";
import { createAudioVoice, generateAudio, getAudioDashboard, previewAudio, transcribeAudio } from "@/lib/audio-service";
import { audioBody, audioError, audioHeaders, audioUser } from "./_shared";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(request: NextRequest) {
    try { const user = await audioUser(request); return NextResponse.json(await getAudioDashboard(user.id), { headers: audioHeaders }); }
    catch (error) { return audioError(error); }
}
export async function POST(request: NextRequest) {
    try {
        const user = await audioUser(request, true);
        if (request.headers.get("content-type")?.startsWith("multipart/form-data")) {
            const form = await audioBody(request, true) as FormData;
            if (form.get("action") === "clone") return NextResponse.json({ voice: await createAudioVoice(user.id, form) }, { status: 201, headers: audioHeaders });
            if (form.get("action") === "transcribe") return NextResponse.json({ job: await transcribeAudio(user.id, form) }, { status: 201, headers: audioHeaders });
            throw new Error("ERR_AUDIO_INPUT");
        }
        const body = await audioBody(request) as Record<string, unknown>;
        if (body.action === "preview") return NextResponse.json(await previewAudio(user.id, body), { headers: audioHeaders });
        if (body.action !== "generate") throw new Error("ERR_AUDIO_INPUT");
        return NextResponse.json({ job: await generateAudio(user.id, body) }, { status: 202, headers: audioHeaders });
    } catch (error) { return audioError(error); }
}
