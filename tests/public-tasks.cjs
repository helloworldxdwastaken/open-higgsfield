/* eslint-disable @typescript-eslint/no-require-imports -- Offline server-route contract fixtures. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
const storage = fs.mkdtempSync(path.join(os.tmpdir(), "highfield-public-tasks-"));
const privateValue = "fixture-private-provider-token";
const privatePath = "/private/fixture-output.mp4";
const privateUrl = "https://provider.invalid/output?token=fixture-signed-query";
const originalResolve = Module._resolveFilename;
const originalLoad = Module._load;
const originalFetch = global.fetch;
let current;
const sessionCookie = "hf_session=fixture-session";
const fixtureUser = { id: "0123456789abcdef0123456789abcdef" };
Module._resolveFilename = function (id, parent, ...rest) {
    return originalResolve.call(this, id.startsWith("@/") ? path.join(root, "src", id.slice(2)) + ".ts" : id, parent, ...rest);
};
Module._extensions[".ts"] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);
Module._load = function (id, parent, ...rest) {
    if (id === "@/lib/task-store") return {
        initStore: async () => {}, getTask: id => current?.task_id === id ? current : undefined,
        getVideoTasks: () => [current], getImageTasks: () => [current],
    };
    if (id === "@/lib/storage-paths") return { STORAGE_ROOT: storage, USER_STORAGE_ID_PATTERN: /^[a-f0-9]{16,64}$/i, userUploadsDir: userId => path.join(storage, "users", userId, "uploads") };
    if (id === "@/lib/users") return { getRequestSessionUser: async request => request.headers.get("cookie") === sessionCookie ? fixtureUser : null };
    return originalLoad.call(this, id, parent, ...rest);
};
global.fetch = async () => { throw new Error("Fixture attempted a network request"); };
const { toPublicTask, toPublicTaskEvent, publicTaskError, PRIVATE_MEDIA_HEADERS } = require(path.join(root, "src/lib/public-tasks.ts"));
const { NextRequest } = require("next/server");
const base = {
    task_id: "fixture-job", model_id: "fixture-model", created_at: "2026-01-01T00:00:00.000Z",
    prompt: "A quiet mountain scene", status: "COMPLETED", freepik_status: "COMPLETED", _done: true,
    provider_id: "openrouter", provider_model_id: "provider/model", provider_task_id: "private-provider-job-id",
    provider_operation: { authorization: privateValue, pollUrl: privateUrl },
    poll_url: privateUrl, params: { token: privateValue }, reuse_state: { internal_path: privatePath },
    error_message: `ERR_PROVIDER_HTTP: ${privateValue} ${privatePath} ${privateUrl}`,
};
function assertPublic(value) {
    const encoded = JSON.stringify(value);
    for (const forbidden of [privateValue, privatePath, privateUrl, "/private/", "data:image", "fixture-signed-query", "provider_operation", "provider_task_id", "provider_model_id", "result_paths", "reuse_state", "poll_url"]) assert(!encoded.includes(forbidden), `Unexpected private field/value: ${forbidden}`);
}
function assertPrivateHeaders(response) {
    assert.equal(response.headers.get("cache-control"), "private, no-store");
}
async function main() {
    assert.equal(PRIVATE_MEDIA_HEADERS["Cache-Control"], "private, no-store");
    const video = { ...base, media_type: "video", video_path: privatePath, video_urls: [privateUrl] };
    const snapshot = JSON.stringify(video);
    const publicVideo = toPublicTask(video);
    assertPublic(publicVideo);
    assert.equal(publicVideo.has_download, true);
    assert.equal(publicVideo.video_path, "/api/download/fixture-job?inline=1");
    assert.deepEqual(publicVideo.video_urls, ["/api/download/fixture-job?inline=1"]);
    assert.equal(publicVideo.error_message, "ERR_PROVIDER_HTTP");
    assert.equal(JSON.stringify(video), snapshot, "Serializing must not mutate the worker task");
    assert.deepEqual(toPublicTask({ ...video, video_path: undefined }).video_urls, []);
    assert.equal(toPublicTask({ ...video, video_path: undefined }).has_download, false, "Remote-only legacy output must not pretend to be playable");
    const image = { ...base, media_type: "image", result_paths: ["/private/fixture-image.png"], result_urls: [privateUrl, "data:image/png;base64,Zml4dHVyZQ=="] };
    const publicImage = toPublicTask(image);
    assertPublic(publicImage);
    assert.deepEqual(publicImage.result_urls, ["/api/download/fixture-job?index=0", "/api/download/fixture-job?index=1"]);
    assert.equal(publicImage.has_download, true);
    assert.deepEqual(toPublicTask({ ...image, result_paths: [], result_urls: [privateUrl] }).result_urls, []);
    assert.deepEqual(toPublicTask({ ...image, result_paths: [], result_urls: ["data:image/svg+xml;base64,Zml4dHVyZQ=="] }).result_urls, []);
    assert.equal(toPublicTask({ ...image, status: "IN_PROGRESS", _done: true })._done, false);
    assert.equal(publicTaskError(`ERR_UPLOAD_FAILED: ${privateValue}`), "ERR_UPLOAD_FAILED");
    assert.equal(publicTaskError(privateValue), "ERR_GENERATION_FAILED");
    assert.equal(publicTaskError("ERR_PROVIDER_HTTP_429"), "ERR_PROVIDER_HTTP_429");
    assert.equal(publicTaskError(undefined), undefined);
    const publicEvent = toPublicTaskEvent(video, { type: "completed", video_urls: [privateUrl], result_urls: [privateUrl], message: privateValue });
    assertPublic(publicEvent);
    assert.deepEqual(publicEvent.video_urls, publicVideo.video_urls);
    assert.equal(publicEvent.message, "ERR_GENERATION_FAILED");
    assert.equal(publicEvent.has_download, true);
    assert.deepEqual(toPublicTaskEvent(image, { type: "completed", result_urls: [privateUrl] }).result_urls, publicImage.result_urls);
    assert.deepEqual(toPublicTaskEvent(video, { type: "status", status: "IN_PROGRESS", elapsed: 4 }), { type: "status", status: "IN_PROGRESS", elapsed: 4 });

    current = video;
    const anonymousVideos = await require(path.join(root, "src/app/api/tasks/route.ts")).GET(new NextRequest("http://studio.invalid/api/tasks"));
    assert.equal(anonymousVideos.status, 401); assertPrivateHeaders(anonymousVideos);
    const videos = await require(path.join(root, "src/app/api/tasks/route.ts")).GET(new NextRequest("http://studio.invalid/api/tasks", { headers: { cookie: sessionCookie } }));
    assertPrivateHeaders(videos); assertPublic(await videos.json());
    current = image;
    const anonymousImages = await require(path.join(root, "src/app/api/image-tasks/route.ts")).GET(new NextRequest("http://studio.invalid/api/image-tasks"));
    assert.equal(anonymousImages.status, 401); assertPrivateHeaders(anonymousImages);
    const images = await require(path.join(root, "src/app/api/image-tasks/route.ts")).GET(new NextRequest("http://studio.invalid/api/image-tasks", { headers: { cookie: sessionCookie } }));
    assertPrivateHeaders(images); assertPublic(await images.json());

    const mcp = require(path.join(root, "src/app/api/mcp/route.ts"));
    for (const name of ["highfield_jobs", "highfield_job"]) {
        const anonymous = await mcp.POST(new NextRequest("http://studio.invalid/api/mcp", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: { task_id: "fixture-job" } } }),
        }));
        assert.equal(anonymous.status, 401); assert.equal(anonymous.headers.get("cache-control"), "no-store");
        const response = await mcp.POST(new NextRequest("http://studio.invalid/api/mcp", {
            method: "POST", headers: { cookie: sessionCookie, "Content-Type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: { task_id: "fixture-job" } } }),
        }));
        assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
        const body = await response.json(); assertPublic(body);
        assert(body.result.content[0].text.includes("/api/download/fixture-job?index=0"));
    }

    current = { ...video, events: [{ type: "completed", video_urls: [privateUrl], message: privateValue }] };
    const events = require(path.join(root, "src/app/api/events/[taskId]/route.ts"));
    const stream = await events.GET(new NextRequest("http://studio.invalid/api/events/fixture-job"), { params: Promise.resolve({ taskId: "fixture-job" }) });
    assertPrivateHeaders(stream); const streamText = await stream.text(); assertPublic(streamText);
    assert(streamText.includes("/api/download/fixture-job?inline=1"));
    const absent = await events.GET(new NextRequest("http://studio.invalid/api/events/missing"), { params: Promise.resolve({ taskId: "missing" }) });
    assert.equal(absent.status, 404); assertPrivateHeaders(absent);

    const uploaded = require(path.join(root, "src/app/api/uploaded/[...path]/route.ts"));
    fs.mkdirSync(path.join(storage, "users", fixtureUser.id, "uploads"), { recursive: true }); fs.writeFileSync(path.join(storage, "users", fixtureUser.id, "uploads", "fixture.png"), "fixture-image-bytes");
    const anonymousUpload = await uploaded.GET(new NextRequest("http://studio.invalid/api/uploaded/fixture.png"), { params: Promise.resolve({ path: ["fixture.png"] }) });
    assert.equal(anonymousUpload.status, 401); assertPrivateHeaders(anonymousUpload);
    const foreignUpload = await uploaded.GET(new NextRequest("http://studio.invalid/api/uploaded/0123456789abcdef0123456789abcdef/fixture.png", { headers: { cookie: sessionCookie } }), { params: Promise.resolve({ path: ["fedcba9876543210fedcba9876543210", "fixture.png"] }) });
    assert.equal(foreignUpload.status, 404); assertPrivateHeaders(foreignUpload);
    const upload = await uploaded.GET(new NextRequest("http://studio.invalid/api/uploaded/fixture.png", { headers: { cookie: sessionCookie } }), { params: Promise.resolve({ path: [fixtureUser.id, "fixture.png"] }) });
    assert.equal(upload.status, 200); assertPrivateHeaders(upload);
    assert.equal(upload.headers.get("x-content-type-options"), "nosniff");
    assert(upload.headers.get("content-security-policy").includes("sandbox"));
    assert.equal(await upload.text(), "fixture-image-bytes");
    const missingUpload = await uploaded.GET(new NextRequest("http://studio.invalid/api/uploaded/missing.png", { headers: { cookie: sessionCookie } }), { params: Promise.resolve({ path: [fixtureUser.id, "missing.png"] }) });
    assert.equal(missingUpload.status, 404); assertPrivateHeaders(missingUpload);

    current = image;
    const gallery = require(path.join(root, "src/app/api/save-to-gallery/route.ts"));
    const request = body => new NextRequest("http://studio.invalid/api/save-to-gallery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const saved = await gallery.POST(request({ task_id: "fixture-job", image_index: 1 }));
    assert.equal(saved.status, 200); assertPrivateHeaders(saved); const handle = await saved.json(); assertPublic(handle);
    assert.equal(handle.asset_id, "fixture-job:1"); assert.equal(handle.url, "/api/download/fixture-job?index=1"); assert(!Object.hasOwn(handle, "path"));
    for (const image_index of [-1, 0.5, "0", 100]) {
        const invalid = await gallery.POST(request({ task_id: "fixture-job", image_index }));
        assert.equal(invalid.status, 400); assertPrivateHeaders(invalid);
    }
    current = { ...image, result_paths: [], result_urls: [privateUrl] };
    const remoteOnly = await gallery.POST(request({ task_id: "fixture-job" }));
    assert.equal(remoteOnly.status, 400); assertPublic(await remoteOnly.json());
    console.log("Public task privacy contracts passed: authenticated MCP, DTOs, SSE, private cache headers and gallery handles; no network requests.");
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
    global.fetch = originalFetch; Module._load = originalLoad; Module._resolveFilename = originalResolve;
    fs.rmSync(storage, { recursive: true, force: true });
});
