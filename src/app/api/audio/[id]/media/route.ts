import { NextRequest, NextResponse } from "next/server";
import { audioMedia } from "@/lib/audio-service";
import { audioError, audioHeaders, audioUser } from "../../_shared";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    try {
        const user = await audioUser(request); const { id } = await context.params;
        const { bytes, extension } = await audioMedia(user.id, id, request.nextUrl.searchParams.get("kind") || "job");
        const types: Record<string, string> = { wav: "audio/wav", mp3: "audio/mpeg", m4a: "audio/mp4", ogg: "audio/ogg", flac: "audio/flac", aac: "audio/aac", webm: "audio/webm", opus: "audio/ogg" };
        const headers: Record<string, string> = { ...audioHeaders, "Content-Type": types[extension] || "application/octet-stream", "Accept-Ranges": "bytes", "Content-Disposition": `${request.nextUrl.searchParams.has("download") ? "attachment" : "inline"}; filename="highfield-audio.${extension}"` };
        const range = request.headers.get("range");
        if (range) {
            const match = /^bytes=(\d*)-(\d*)$/.exec(range);
            if (!match || (!match[1] && !match[2])) return new NextResponse(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${bytes.length}` } });
            const start = match[1] ? Number(match[1]) : Math.max(0, bytes.length - Number(match[2]));
            const end = match[1] && match[2] ? Math.min(Number(match[2]), bytes.length - 1) : bytes.length - 1;
            if (start >= bytes.length || start > end || start < 0) return new NextResponse(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${bytes.length}` } });
            return new NextResponse(new Uint8Array(bytes.subarray(start, end + 1)), { status: 206, headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${bytes.length}`, "Content-Length": String(end - start + 1) } });
        }
        return new NextResponse(new Uint8Array(bytes), { headers: { ...headers, "Content-Length": String(bytes.length) } });
    } catch (error) { return audioError(error); }
}
