import sharp from "sharp";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { uploadHiggsfieldMedia } from "./higgsfield";
import { downloadPublicMedia } from "./http";
import { readLocalUpload, readDownload, saveInputLocally } from "@/lib/upload";
import { getTask, initStore } from "@/lib/task-store";
const run = promisify(execFile);
async function inspectSourceVideo(buffer: Buffer) {
    const dir = await mkdtemp(path.join(tmpdir(), "highfield-video-"));
    try {
        const file = path.join(dir, "input-video"); await writeFile(file, buffer, { mode: 0o600 });
        let output: string;
        try { output = (await run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,duration:format=duration", "-of", "json", file], { timeout: 15_000, maxBuffer: 65536 })).stdout; }
        catch { throw new Error("ERR_SOURCE_VIDEO_PROBE_FAILED"); }
        const info = JSON.parse(output);
        const stream = info.streams?.[0];
        const duration = Number(info.format?.duration || stream?.duration);
        if (!Number.isFinite(duration) || duration < 4 || Number(stream?.width || 0) * Number(stream?.height || 0) < 409600) throw new Error("ERR_GENJUTSU_SOURCE_REQUIRES_4_SECONDS_AND_409600_PIXELS");
    } finally { await rm(dir, { recursive: true, force: true }); }
}
async function inputBytes(url: string): Promise<Buffer> {
    const uploaded = url.match(/^\/api\/uploaded\/([a-zA-Z0-9_.-]+)$/);
    if (uploaded) return readLocalUpload(uploaded[1]);
    const download = url.match(/^\/api\/download\/([a-zA-Z0-9_-]+)(?:\?(.*))?$/);
    if (download) {
        await initStore(); const task = getTask(download[1]);
        if (!task) throw new Error("ERR_REFERENCE_NOT_FOUND");
        const index = Number(new URLSearchParams(download[2] || "").get("index") || 0);
        if (!Number.isInteger(index) || index < 0) throw new Error("ERR_REFERENCE_NOT_FOUND");
        const file = task.media_type === "video" && "video_path" in task ? task.video_path : task.result_paths?.[index];
        if (typeof file !== "string") throw new Error("ERR_REFERENCE_NOT_FOUND");
        return readDownload(file);
    }
    return Buffer.from((await downloadPublicMedia(url)).data);
}
export async function higgsfieldInput(file: File | null, url: string, kind: "image" | "video" | "audio"): Promise<string> {
    if (kind === "audio") throw new Error("ERR_UNSUPPORTED_REFERENCE_KIND");
    if (file && file.size > 256 * 1024 * 1024) throw new Error("ERR_UPLOAD_SIZE_LIMIT");
    let bytes = file?.size ? Buffer.from(await file.arrayBuffer()) : await inputBytes(url);
    if (!bytes.length || bytes.length > 256 * 1024 * 1024) throw new Error("ERR_UPLOAD_SIZE_LIMIT");
    if (kind === "image") {
        bytes = await sharp(bytes, { limitInputPixels: 40000000 }).jpeg({ quality: 92 }).toBuffer();
        await saveInputLocally(bytes, ".jpg");
        return uploadHiggsfieldMedia(bytes, "image/jpeg");
    }
    await inspectSourceVideo(bytes);
    await saveInputLocally(bytes, ".mp4");
    return uploadHiggsfieldMedia(bytes, "video/mp4");
}
