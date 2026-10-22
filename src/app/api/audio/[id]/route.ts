import { NextRequest, NextResponse } from "next/server";
import { deleteAudio, editTranscript, getAudioJob } from "@/lib/audio-service";
import { audioBody, audioError, audioHeaders, audioUser } from "../_shared";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    try { const user = await audioUser(request); const { id } = await context.params; return NextResponse.json({ job: await getAudioJob(user.id, id) }, { headers: audioHeaders }); }
    catch (error) { return audioError(error); }
}
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    try { const user = await audioUser(request, true); const { id } = await context.params; await deleteAudio(user.id, id, request.nextUrl.searchParams.get("kind") || "job"); return NextResponse.json({ deleted: true }, { headers: audioHeaders }); }
    catch (error) { return audioError(error); }
}
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    try { const user = await audioUser(request, true); const { id } = await context.params; const body = await audioBody(request) as Record<string, unknown>; return NextResponse.json({ job: await editTranscript(user.id, id, body.text) }, { headers: audioHeaders }); }
    catch (error) { return audioError(error); }
}
