import { NextRequest, NextResponse } from "next/server";
import { IMAGE_CAPABILITIES } from "@/models/capabilities/image";
import { VIDEO_CAPABILITIES } from "@/models/capabilities/video";
import { connectionStatus } from "@/lib/connections";
import { getImageTasks, getVideoTasks, getTask, initStore } from "@/lib/task-store";
import { toPublicTask } from "@/lib/public-tasks";
import { getCinemaProject, listCinemaProjects } from "@/lib/cinema-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
const annotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const tools = [
    { name: "highfield_models", description: "List curated image/video model capabilities. Availability requires a configured provider; this does not submit a job.", inputSchema: { type: "object", properties: { media_type: { type: "string", enum: ["image", "video"] } }, additionalProperties: false }, annotations },
    { name: "highfield_connections", description: "List configured connection flags. Credential values are never returned.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations },
    { name: "highfield_jobs", description: "Read the latest 50 image and video jobs from this owner workspace.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations },
    { name: "highfield_job", description: "Read one job status and authenticated local download references.", inputSchema: { type: "object", properties: { task_id: { type: "string", maxLength: 128 } }, required: ["task_id"], additionalProperties: false }, annotations },
    { name: "highfield_cinema_projects", description: "List saved Cinema storyboard projects in this owner workspace. Does not create, plan or generate media.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations },
    { name: "highfield_cinema_project", description: "Read one saved Cinema storyboard, its shot prompts and generation associations. Does not submit a generation.", inputSchema: { type: "object", properties: { project_id: { type: "string", maxLength: 36 } }, required: ["project_id"], additionalProperties: false }, annotations },
];

function summarize(task: ReturnType<typeof getTask>) {
    if (!task) return null;
    const safe = toPublicTask(task);
    return { task_id: safe.task_id, status: safe.status, media_type: safe.media_type, model_id: safe.model_id, created_at: safe.created_at, prompt: safe.prompt,
        downloads: safe.has_download ? safe.media_type === "image" ? safe.result_urls : safe.video_urls : [], error: safe.error_message };
}

export async function POST(request: NextRequest) {
    const origin = request.headers.get("origin");
    if (origin && origin !== (process.env.STUDIO_PUBLIC_ORIGIN || request.nextUrl.origin)) return NextResponse.json({ error: "Untrusted origin." }, { status: 403, headers });
    if (!request.headers.get("content-type")?.startsWith("application/json")) return NextResponse.json({ error: "JSON required." }, { status: 415, headers });
    let message;
    try {
        const text = await request.text();
        if (text.length > 16384) return NextResponse.json({ error: "Request too large." }, { status: 413, headers });
        message = JSON.parse(text);
    } catch { return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { headers }); }
    if (!message || Array.isArray(message) || message.jsonrpc !== "2.0" || typeof message.method !== "string") return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid request" } }, { headers });
    const id = typeof message.id === "string" || typeof message.id === "number" ? message.id : null;
    if (message.id === undefined) return new NextResponse(null, { status: 202, headers });
    const reply = (result: unknown) => NextResponse.json({ jsonrpc: "2.0", id, result }, { headers });
    if (message.method === "initialize") return reply({ protocolVersion: "2025-06-18", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "highfield", version: "0.2.0" }, instructions: "Read-only Highfield tools. Media generation and local planning are available in the authenticated web studio." });
    if (message.method === "ping") return reply({});
    if (message.method === "tools/list") return reply({ tools });
    if (message.method !== "tools/call") return NextResponse.json({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } }, { headers });
    try {
        const args = message.params?.arguments || {};
        let result: unknown;
        switch (message.params?.name) {
            case "highfield_models":
                if (args.media_type && !["image", "video"].includes(args.media_type)) throw new Error("Invalid media_type");
                result = { images: args.media_type === "video" ? [] : Object.values(IMAGE_CAPABILITIES), videos: args.media_type === "image" ? [] : Object.values(VIDEO_CAPABILITIES) }; break;
            case "highfield_connections": result = connectionStatus(); break;
            case "highfield_jobs":
                await initStore();
                result = [...getImageTasks(), ...getVideoTasks()].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 50).map(task => summarize(getTask(task.task_id))); break;
            case "highfield_job":
                if (typeof args.task_id !== "string" || args.task_id.length > 128) throw new Error("Invalid task_id");
                await initStore(); result = summarize(getTask(args.task_id)); break;
            case "highfield_cinema_projects": result = await listCinemaProjects(); break;
            case "highfield_cinema_project":
                if (typeof args.project_id !== "string") throw new Error("Invalid project_id");
                result = await getCinemaProject(args.project_id) || null; break;
            default: throw new Error("Unknown tool");
        }
        return reply({ content: [{ type: "text", text: JSON.stringify(result) }] });
    } catch { return reply({ isError: true, content: [{ type: "text", text: "The requested tool could not be completed. Check the tool name and arguments." }] }); }
}

export function GET() { return new NextResponse(null, { status: 405, headers: { ...headers, Allow: "POST" } }); }
