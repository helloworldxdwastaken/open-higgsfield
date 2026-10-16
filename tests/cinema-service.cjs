/* eslint-disable @typescript-eslint/no-require-imports -- Offline service/route fixtures. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const { randomUUID } = require("node:crypto");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
const storage = fs.mkdtempSync(path.join(os.tmpdir(), "highfield-cinema-service-"));
const savedEnv = process.env.STUDIO_SETTINGS_DIR;
const savedOrigin = process.env.STUDIO_PUBLIC_ORIGIN;
process.env.STUDIO_SETTINGS_DIR = storage;
process.env.STUDIO_PUBLIC_ORIGIN = "http://studio.invalid";
const originalLoad = Module._load, originalResolve = Module._resolveFilename, originalFetch = global.fetch;
let submissions = 0, connected = true, submitError = false, submitGate, submitStarted;
let modelReply = "", planningCalls = 0;
const tasks = new Map();
const USER = "user-a";
const sessionCookie = "hf_session=fixture-session";
Module._resolveFilename = function (id, parent, ...rest) {
    return originalResolve.call(this, id.startsWith("@/") ? path.join(root, "src", id.slice(2)) + ".ts" : id, parent, ...rest);
};
Module._extensions[".ts"] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, file);
Module._load = function (id, parent, ...rest) {
    if (id === "@/lib/connections") return { connectionStatus: () => [{ name: "FREEPIK_API_KEY", configured: connected }] };
    if (id === "@/lib/task-store") return { initStore: async () => {}, getStore: () => tasks };
    if (id === "@/lib/provider-catalog") return { openRouterCatalog: async () => [], catalogCapability: () => { throw new Error("Unused catalog fixture"); } };
    if (id === "@/lib/director") return { createShotPlan: async () => { planningCalls++; return { plan: modelReply }; } };
    if (id === "@/lib/users") return { getRequestSessionUser: async request => request.headers.get("cookie") === sessionCookie ? { id: USER } : null };
    if (id === "@/lib/generation-service") return { submitGeneration: async input => {
        submissions++; if (submitStarted) submitStarted(); if (submitGate) await submitGate;
        if (submitError) throw new Error("fixture-sensitive-provider-detail /private/fixture/path");
        const id = `fixture_${submissions}`;
        tasks.set(id, { task_id: id, media_type: input.mediaType, status: "COMPLETED", reuse_state: input.reuseState });
        return id;
    } };
    return originalLoad.call(this, id, parent, ...rest);
};
global.fetch = async () => { throw new Error("Unexpected network request in offline Cinema fixtures"); };
const store = require(path.join(root, "src/lib/cinema-store.ts"));
const service = require(path.join(root, "src/lib/cinema-service.ts"));
const { IMAGE_CAPABILITIES } = require(path.join(root, "src/models/capabilities/image.ts"));
const { NextRequest } = require("next/server");
function shot() { return { id: randomUUID(), title: "Quiet reveal", prompt: "A ceramic cup beside a window", seconds: 5, camera: "Slow dolly", lens: "50mm close shot", lighting: "Morning side light", notes: "Keep the cup blue" }; }
async function project() {
    const p = await store.createCinemaProject({ title: "Fixture film", brief: "A quiet coffee film" }, USER);
    return store.updateCinemaProject(p.id, p.version, { ...p, shots: [shot()] }, USER);
}
function input(p, extra = {}) { return { userId: USER, projectId: p.id, shotId: p.shots[0].id, version: p.version, requestId: randomUUID(), mediaType: "image", engine: "catalog", modelId: Object.keys(IMAGE_CAPABILITIES)[0], ...extra }; }
async function code(promise, expected) { await assert.rejects(promise, error => error.message === expected); }
function request(route, body, origin = "http://studio.invalid") { return new NextRequest("http://studio.invalid" + route, { method: "POST", headers: { cookie: sessionCookie, "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(body) }); }
async function main() {
    let p = await project(); const first = input(p);
    const accepted = await service.generateCinemaShot(first); p = accepted.project;
    assert.equal(submissions, 1); assert.equal(p.generationHistory[0].state, "accepted"); assert.equal(p.shots[0].image.taskId, accepted.taskId);
    assert(!Object.hasOwn(p.shots[0].image, "shotId"), "Shot job must not include ledger-only properties");
    const replay = await service.generateCinemaShot(first); assert.equal(replay.taskId, accepted.taskId); assert.equal(replay.replayed, true); assert.equal(submissions, 1);
    await code(service.generateCinemaShot({ ...first, modelId: "changed-model" }), "ERR_CINEMA_REQUEST_REUSE");
    const second = input(p); const next = await service.generateCinemaShot(second); p = next.project;
    assert.equal(submissions, 2); assert.equal(p.generationHistory.length, 2);
    assert.equal((await service.generateCinemaShot(first)).taskId, accepted.taskId, "Old request must replay after a later render"); assert.equal(submissions, 2);
    await code(service.generateCinemaShot(input(p, { version: 1 })), "ERR_CINEMA_VERSION_CONFLICT");
    tasks.get(next.taskId).status = "IN_PROGRESS";
    await code(service.generateCinemaShot(input(p)), "ERR_CINEMA_BUSY"); assert.equal(submissions, 2);
    tasks.get(next.taskId).status = "COMPLETED";
    connected = false;
    await code(service.generateCinemaShot(input(p)), "ERR_CINEMA_PROVIDER_NOT_CONNECTED");
    assert.equal((await store.getCinemaProject(p.id, USER)).version, p.version, "Missing credentials must not reserve or submit"); connected = true;

    const concurrent = input(p); let release;
    submitGate = new Promise(resolve => { release = resolve; });
    const started = new Promise(resolve => { submitStarted = resolve; });
    const running = service.generateCinemaShot(concurrent); await started;
    await code(service.generateCinemaShot(concurrent), "ERR_CINEMA_BUSY"); assert.equal(submissions, 3);
    release(); p = (await running).project; submitGate = undefined; submitStarted = undefined;

    const uncertain = input(p); submitError = true;
    await code(service.generateCinemaShot(uncertain), "ERR_CINEMA_SUBMISSION_UNCERTAIN"); submitError = false;
    p = await store.getCinemaProject(p.id, USER); assert.equal(p.shots[0].image.state, "uncertain");
    assert.equal(p.shots[0].image.error, "ERR_CINEMA_SUBMISSION_UNCERTAIN");
    assert(!JSON.stringify(p).includes("fixture-sensitive-provider-detail"));
    const count = submissions;
    await code(service.generateCinemaShot(uncertain), "ERR_CINEMA_SUBMISSION_UNCERTAIN");
    await code(service.generateCinemaShot(input(p)), "ERR_CINEMA_BUSY"); assert.equal(submissions, count);
    tasks.set("recovered_task", { task_id: "recovered_task", media_type: "image", status: "COMPLETED", reuse_state: { cinema: { projectId: p.id, shotId: uncertain.shotId, requestId: uncertain.requestId } } });
    const recovered = await service.cinemaSubmissionStatus(p.id, uncertain.requestId, USER); p = recovered.project;
    assert.equal(recovered.taskId, "recovered_task"); assert.equal(submissions, count); assert.equal(p.shots[0].image.state, "accepted"); assert(!p.shots[0].image.error);
    await code(service.cinemaSubmissionStatus(p.id, randomUUID(), USER), "ERR_CINEMA_REQUEST_NOT_FOUND");

    const caps = IMAGE_CAPABILITIES[first.modelId];
    assert.match(service.cinemaParams(p, p.shots[0], input(p), caps).prompt, /Camera direction: Slow dolly/);
    assert.equal(service.cinemaParams(p, p.shots[0], input(p), caps).aspect_ratio, "16:9");
    for (const [changed, err] of [[{ prompt_max: 5 }, "ERR_CINEMA_PROMPT_TOO_LONG"], [{ media_slots: [{ required: true }] }, "ERR_CINEMA_TEXT_MODEL_REQUIRED"], [{ aspect_ratio: { options: [["Square", "1:1"]] }, size_ui: undefined }, "ERR_CINEMA_ASPECT_RATIO_UNSUPPORTED"]]) {
        assert.throws(() => service.cinemaParams(p, p.shots[0], input(p), { ...caps, ...changed }), error => error.message === err);
    }
    assert.throws(() => service.cinemaParams(p, p.shots[0], input(p, { duration: "999" }), caps), /ERR_CINEMA_DURATION_UNSUPPORTED/);
    assert.throws(() => service.cinemaParams(p, p.shots[0], input(p, { resolution: "invented" }), caps), /ERR_CINEMA_RESOLUTION_UNSUPPORTED/);

    const draft = await project(), planInput = { userId: USER, projectId: draft.id, version: draft.version, engine: "ollama", model: "fixture-model", shotCount: 2 };
    modelReply = "Not JSON";
    await code(service.planCinemaProject(planInput), "ERR_CINEMA_PLAN_FORMAT"); assert.equal((await store.getCinemaProject(draft.id, USER)).version, draft.version);
    modelReply = JSON.stringify({ shots: Array.from({ length: 2 }, () => ({ ...shot(), id: undefined })) });
    const planned = await service.planCinemaProject(planInput); assert.equal(planned.project.shots.length, 2); assert.equal(planned.generatedMedia, false); assert.equal(planningCalls, 2); assert.equal(submissions, count);
    assert.notEqual(planned.project.shots[0].id, planned.project.shots[1].id);

    const route = require(path.join(root, "src/app/api/cinema/generate/route.ts"));
    const wrong = await route.POST(request("/api/cinema/generate", input(p), "https://untrusted.invalid")); assert.equal(wrong.status, 403); assert.equal(wrong.headers.get("cache-control"), "private, no-store");
    const status = await route.GET(new NextRequest(`http://studio.invalid/api/cinema/generate?projectId=${p.id}&requestId=${uncertain.requestId}`, { headers: { cookie: sessionCookie } }));
    assert.equal(status.status, 200); assert.equal((await status.json()).taskId, "recovered_task"); assert.equal(submissions, count);
    const failed = await route.POST(request("/api/cinema/generate", { ...input(p), version: 1 })); assert.equal(failed.status, 409);
    const failedBody = await failed.json(); assert.equal(failedBody.project.id, p.id); assert.equal(failedBody.error, "ERR_CINEMA_VERSION_CONFLICT");
    const planRoute = require(path.join(root, "src/app/api/cinema/plan/route.ts"));
    const invalid = await planRoute.POST(request("/api/cinema/plan", { ...planInput, shotCount: 0 })); assert.equal(invalid.status, 400);
    console.log(JSON.stringify({ cinemaPromptAndCapabilityValidation: true, durableAcceptedRequestReplay: true, noDuplicateConcurrentSubmissions: true, uncertainSubmissionsBlocked: true, readOnlyReconciliation: true, structuredPlanning: true, privateErrorsAndHeaders: true, noNetworkOrPaidCalls: true }));
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
    Module._load = originalLoad; Module._resolveFilename = originalResolve; global.fetch = originalFetch;
    if (savedEnv === undefined) delete process.env.STUDIO_SETTINGS_DIR; else process.env.STUDIO_SETTINGS_DIR = savedEnv;
    if (savedOrigin === undefined) delete process.env.STUDIO_PUBLIC_ORIGIN; else process.env.STUDIO_PUBLIC_ORIGIN = savedOrigin;
    fs.rmSync(storage, { recursive: true, force: true });
});
