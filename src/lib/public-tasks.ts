import type { AnyTask, TaskEvent, TaskStatus } from "@/types";
import { publicErrorMessage } from "@/lib/public-error";

export const PRIVATE_MEDIA_HEADERS = { "Cache-Control": "private, no-store" } as const;

interface PublicTaskBase {
    task_id: string;
    media_type: "image" | "video";
    model_id: string;
    created_at: string;
    prompt?: string;
    status: TaskStatus;
    freepik_status: TaskStatus;
    has_download: boolean;
    _done: boolean;
    error_message?: string;
}
export interface PublicImageTask extends PublicTaskBase {
    media_type: "image";
    result_urls: string[];
}
export interface PublicVideoTask extends PublicTaskBase {
    media_type: "video";
    video_urls: string[];
    /** Compatibility for older clients: an authenticated URL, never a filesystem path. */
    video_path?: string;
}
export type PublicTask = PublicImageTask | PublicVideoTask;

const statuses = new Set<TaskStatus>(["CREATED", "IN_PROGRESS", "COMPLETED", "FAILED", "ERROR", "CANCELLED"]);
const terminalStatuses = new Set<TaskStatus>(["COMPLETED", "FAILED", "ERROR", "CANCELLED"]);

function publicStatus(value: string | undefined): TaskStatus {
    if (!value) return "CREATED";
    const normalized = value.toUpperCase() as TaskStatus;
    return statuses.has(normalized) ? normalized : "ERROR";
}

/** Keep error identifiers; provider prose and detail suffixes may contain private data. */
export function publicTaskError(value: unknown): string | undefined {
    if (typeof value !== "string" || !value.trim()) return undefined;
    return publicErrorMessage(value);
}

export function taskImageDownloadUrl(taskId: string, index: number): string {
    return `/api/download/${encodeURIComponent(taskId)}?index=${index}`;
}

/** Only materialized files or stored data images can be served by our download route. */
function availableImageUrls(task: AnyTask): string[] {
    const paths = task.result_paths || [];
    const urls = task.result_urls || [];
    return Array.from({ length: Math.max(paths.length, urls.length) }).flatMap((_, index) => {
        const local = typeof paths[index] === "string" && Boolean(paths[index]);
        const stored = typeof urls[index] === "string" && /^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(urls[index]);
        return local || stored ? [taskImageDownloadUrl(task.task_id, index)] : [];
    });
}

/** Explicit allowlist: never spread a private task into a browser or MCP response. */
export function toPublicTask(task: AnyTask): PublicTask {
    const status = publicStatus(task.status || task.freepik_status);
    const base = {
        task_id: task.task_id,
        model_id: task.model_id,
        created_at: task.created_at,
        prompt: task.prompt,
        status,
        freepik_status: status,
        _done: terminalStatuses.has(status),
        error_message: publicTaskError(task.error_message),
    };
    if (task.media_type === "image") {
        const urls = availableImageUrls(task);
        return { ...base, media_type: "image", has_download: urls.length > 0, result_urls: urls };
    }
    const url = task.video_path ? `/api/download/${encodeURIComponent(task.task_id)}?inline=1` : undefined;
    return { ...base, media_type: "video", has_download: Boolean(url), video_urls: url ? [url] : [], video_path: url };
}

/** SSE shares the same media/error policy as list responses; no provider URL readback. */
export function toPublicTaskEvent(task: AnyTask, event: TaskEvent): TaskEvent {
    const result: TaskEvent = { type: event.type };
    if (event.status) result.status = publicStatus(event.status);
    if (typeof event.elapsed === "number" && Number.isFinite(event.elapsed) && event.elapsed >= 0) result.elapsed = event.elapsed;
    if (event.type === "completed") {
        const publicTask = toPublicTask(task);
        result.media_type = publicTask.media_type;
        result.has_download = publicTask.has_download;
        if (publicTask.media_type === "image") {
            result.result_urls = publicTask.result_urls;
            result.result_count = publicTask.result_urls.length;
        } else result.video_urls = publicTask.video_urls;
    }
    if (event.message) result.message = publicTaskError(event.message);
    return result;
}
