/* eslint-disable @typescript-eslint/no-require-imports -- Offline generation-route error fixtures. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
const originalResolve = Module._resolveFilename;
const originalLoad = Module._load;
const originalFetch = global.fetch;
const originalOrigin = process.env.STUDIO_PUBLIC_ORIGIN;
const origin = "http://studio.invalid";
const details = "fixture-private-token /private/fixture-file https://provider.invalid/?signature=fixture-secret";
let failure = "upload";
const caps = { provider: "google-ai-studio", prompt_required: true, prompt_max: 2000, media_slots: [{ id: "reference", kind: "image", label: "Reference", required: false }], duration: false, aspect_ratio: false, resolution_variant: false, negative_prompt: false, cfg_scale: false, style: false, prompt_expansion: false, shot_type: false, elements: false };
Module._resolveFilename = function (id, parent, ...rest) {
    return originalResolve.call(this, id.startsWith("@/") ? path.join(root, "src", id.slice(2)) + ".ts" : id, parent, ...rest);
};
Module._extensions[".ts"] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);
const media = async () => {
    if (failure !== "submit") throw new Error(details);
    return { localUrl: "/api/uploaded/fixture.png", remoteUrl: "https://reference.invalid/fixture.png" };
};
Module._load = function (id, parent, ...rest) {
    if (id === "@/models/capabilities/video") return { VIDEO_CAPABILITIES: { fixture: caps } };
    if (id === "@/models/capabilities/image") return { IMAGE_CAPABILITIES: { fixture: caps } };
    if (id === "@/models/adapters/video") return { getVideoAdapter: () => undefined };
    if (id === "@/models/adapters/image") return { getImageAdapter: () => undefined };
    if (id === "@/lib/generation-service") return { submitGeneration: async () => { throw new Error(`ERR_PROVIDER_REJECTED: ${details}`); } };
    if (id === "@/lib/media-upload") return { processImageUpload: media, processFileUpload: media, resolveUrl: media };
    if (id === "@/providers/higgsfield-media") return { higgsfieldInput: async () => { throw new Error("Unexpected native upload"); } };
    if (id === "@/lib/connections") return { refreshConnections: () => {} };
    if (id === "@/lib/upload") return { saveInputLocally: async () => "/api/uploaded/fixture.png", uploadToTmpfiles: media };
    return originalLoad.call(this, id, parent, ...rest);
};
process.env.STUDIO_PUBLIC_ORIGIN = origin;
global.fetch = async () => { throw new Error("Unexpected network request"); };
const { NextRequest } = require("next/server");
const { publicErrorMessage } = require(path.join(root, "src/lib/public-error.ts"));
const videoRoute = require(path.join(root, "src/app/api/generate/route.ts"));
const imageRoute = require(path.join(root, "src/app/api/generate-image/route.ts"));
function request(kind, attachment) {
    const body = new FormData(); body.set("model_id", "fixture"); body.set("prompt", "A mountain scene");
    if (attachment === "file") body.set(kind === "video" ? "file_reference" : "slot_reference", new File(["fixture image"], "fixture.png", { type: "image/png" }));
    if (attachment === "url") body.set("url_reference", "https://reference.invalid/image.png");
    return new NextRequest(`${origin}/api/generate`, { method: "POST", headers: { Origin: origin }, body });
}
async function assertResponse(response, code, status) {
    assert.equal(response.status, status);
    const body = await response.json(); assert.deepEqual(body, { error: code });
    const encoded = JSON.stringify(body);
    for (const privateMarker of ["fixture-private-token", "/private/", "provider.invalid", "signature=", "fixture-secret"]) assert(!encoded.includes(privateMarker));
}
async function main() {
    assert.equal(publicErrorMessage(new Error(`ERR_UPLOAD_FAILED: ${details}`)), "ERR_UPLOAD_FAILED");
    assert.equal(publicErrorMessage(new Error(`ERR_PROVIDER_HTTP_429: ${details}\nsecond line`)), "ERR_PROVIDER_HTTP_429");
    assert.equal(publicErrorMessage("ERR_HIGGSFIELD_NOT_CONFIGURED"), "ERR_HIGGSFIELD_NOT_CONFIGURED");
    assert.equal(publicErrorMessage(new Error(details)), "ERR_GENERATION_FAILED");
    assert.equal(publicErrorMessage(details, "ERR_UPLOAD_RESOLVE_FAILED"), "ERR_UPLOAD_RESOLVE_FAILED");
    assert.equal(publicErrorMessage(details, details), "ERR_GENERATION_FAILED");
    failure = "upload";
    await assertResponse(await videoRoute.POST(request("video", "file")), "ERR_UPLOAD_FAILED", 400);
    await assertResponse(await imageRoute.POST(request("image", "file")), "ERR_GENERATION_FAILED", 500);
    failure = "resolve";
    await assertResponse(await videoRoute.POST(request("video", "url")), "ERR_UPLOAD_RESOLVE_FAILED", 400);
    failure = "submit";
    await assertResponse(await videoRoute.POST(request("video", "url")), "ERR_PROVIDER_REJECTED", 500);
    await assertResponse(await imageRoute.POST(request("image")), "ERR_PROVIDER_REJECTED", 500);
    const malformed = () => new NextRequest(`${origin}/api/generate`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: "{" });
    await assertResponse(await videoRoute.POST(malformed()), "ERR_GENERATION_FAILED", 500);
    await assertResponse(await imageRoute.POST(malformed()), "ERR_GENERATION_FAILED", 500);
    console.log("Public error contracts passed: stable codes, redacted upload/resolve/provider failures and malformed requests; no network or credential reads.");
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
    global.fetch = originalFetch; Module._load = originalLoad; Module._resolveFilename = originalResolve;
    if (originalOrigin === undefined) delete process.env.STUDIO_PUBLIC_ORIGIN; else process.env.STUDIO_PUBLIC_ORIGIN = originalOrigin;
});
