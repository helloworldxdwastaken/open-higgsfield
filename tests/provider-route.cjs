/* eslint-disable @typescript-eslint/no-require-imports -- Offline provider route isolation contract. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
process.env.STUDIO_PUBLIC_ORIGIN = "https://studio.invalid";
const sessionCookie = "hf_session=fixture-session";
const fixtureUser = { id: "0123456789abcdef0123456789abcdef" };
const submissions = [];
const originalResolve = Module._resolveFilename;
const originalLoad = Module._load;
Module._resolveFilename = function (id, parent, ...rest) {
    return originalResolve.call(this, id.startsWith("@/") ? path.join(root, "src", id.slice(2)) + ".ts" : id, parent, ...rest);
};
Module._extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);
Module._load = function (id, parent, isMain) {
    if (id === "@/lib/users") return { getRequestSessionUser: async request => request.headers.get("cookie") === sessionCookie ? fixtureUser : null };
    if (id === "@/lib/provider-catalog") return {
        openRouterCatalog: async kind => [{ id: "fixture/model", name: "Fixture model", kind }],
        catalogCapability: model => ({ id: model.id, label: model.name, provider: "openrouter", provider_mode: model.kind }),
    };
    if (id === "@/lib/task-store") return { initStore: async () => {} };
    if (id === "@/lib/generation-service") return { submitGeneration: async input => { submissions.push(input); return "fixture-task"; } };
    if (id === "@/lib/public-error") return { publicErrorMessage: error => error.message };
    if (id === "@/lib/model-settings") return { getFeatureModel: async () => null };
    return originalLoad.call(this, id, parent, isMain);
};
global.fetch = async () => { throw new Error("Fixture attempted a network request"); };

(async () => {
    const route = require(path.join(root, "src/app/api/providers/generate/route.ts"));
    const { NextRequest } = require("next/server");
    const request = (cookie) => new NextRequest("https://studio.invalid/api/providers/generate", {
        method: "POST",
        headers: { origin: process.env.STUDIO_PUBLIC_ORIGIN, "content-type": "application/json", ...(cookie ? { cookie } : {}) },
        body: JSON.stringify({ engine: "openrouter", kind: "image", modelId: "fixture/model", prompt: "A quiet test." }),
    });
    const anonymous = await route.POST(request());
    assert.equal(anonymous.status, 401);
    assert.equal(submissions.length, 0);
    const authenticated = await route.POST(request(sessionCookie));
    assert.equal(authenticated.status, 200);
    assert.deepEqual(await authenticated.json(), { task_id: "fixture-task" });
    assert.equal(submissions.length, 1);
    assert.equal(submissions[0].userId, fixtureUser.id);
    assert.equal(submissions[0].mediaType, "image");
    console.log(JSON.stringify({ providerRouteSessionIsolation: true, anonymousProviderSubmissionBlocked: true, noProviderCallsOrPaidJobs: true }));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
    Module._resolveFilename = originalResolve;
    Module._load = originalLoad;
});
