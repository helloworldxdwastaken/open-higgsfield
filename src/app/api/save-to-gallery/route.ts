import { NextRequest, NextResponse } from "next/server";
import { getTask, initStore } from "@/lib/task-store";
import { PRIVATE_MEDIA_HEADERS, taskImageDownloadUrl, toPublicTask } from "@/lib/public-tasks";

export async function POST(req: NextRequest) {
    await initStore();
    let body: { task_id?: string; image_index?: number };
    try { body = await req.json(); }
    catch { return NextResponse.json({ error: "ERR_INVALID_REQUEST" }, { status: 400, headers: PRIVATE_MEDIA_HEADERS }); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "ERR_INVALID_REQUEST" }, { status: 400, headers: PRIVATE_MEDIA_HEADERS });
    const { task_id, image_index } = body;

    if (typeof task_id !== "string" || !task_id) {
        return NextResponse.json({ error: "ERR_MISSING_TASK_ID" }, { status: 400, headers: PRIVATE_MEDIA_HEADERS });
    }

    const task = getTask(task_id);
    if (!task || task.media_type !== "image") {
        return NextResponse.json({ error: "ERR_TASK_NOT_FOUND" }, { status: 404, headers: PRIVATE_MEDIA_HEADERS });
    }

    const idx = image_index ?? 0;
    if (!Number.isSafeInteger(idx) || idx < 0) {
        return NextResponse.json({ error: "ERR_INVALID_INDEX" }, { status: 400, headers: PRIVATE_MEDIA_HEADERS });
    }
    const publicTask = toPublicTask(task);
    const url = taskImageDownloadUrl(task_id, idx);
    if (publicTask.media_type !== "image" || !publicTask.result_urls.includes(url)) return NextResponse.json({ error: "ERR_OUTPUT_NOT_AVAILABLE" }, { status: 400, headers: PRIVATE_MEDIA_HEADERS });
    // Generated images are already saved locally or in the configured database.
    // Return their existing authenticated handle instead of fetching a provider URL.
    return NextResponse.json({ asset_id: `${task_id}:${idx}`, task_id, image_index: idx, url }, { headers: PRIVATE_MEDIA_HEADERS });
}
