/* eslint-disable @typescript-eslint/no-require-imports -- Offline model settings contract. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const settingsDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "highfield-model-settings-"));
process.env.STUDIO_SETTINGS_DIR = settingsDirectory;
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (id, parent, ...rest) {
    return originalResolve.call(this, id.startsWith("@/") ? path.join(root, "src", id.slice(2)) + ".ts" : id, parent, ...rest);
};
Module._extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);
global.fetch = async () => { throw new Error("Fixture attempted a network request"); };

(async () => {
    const settings = require(path.join(root, "src/lib/model-settings.ts"));
    const features = settings.ADMIN_MODEL_FEATURES;
    assert.equal(features.length > 8, true);
    assert(features.some(feature => feature.feature === "image_generation"));
    assert(features.some(feature => feature.feature === "video_generation"));
    assert(features.some(feature => feature.feature === "genjutsu_motion_transfer"));
    assert(features.some(feature => feature.feature === "planning"));

    const setting = await settings.saveAdminModelSetting("image_generation", { model_id: features[0].choices[0].id });
    assert.equal(await settings.getFeatureModel("image_generation"), setting.model_id);
    await assert.rejects(settings.saveAdminModelSetting("image_generation", { model_id: "not-a-catalog-model" }), /ERR_INVALID_MODEL_ID/);
    await assert.rejects(settings.saveAdminModelSetting("planning", { model_id: "llama", provider_engine: "browser" }), /ERR_INVALID_PLANNING_ENGINE/);
    const planning = await settings.saveAdminModelSetting("planning", { model_id: "llama", provider_engine: "lm-studio" });
    assert.equal(planning.provider_engine, "lm-studio");
    const savedPath = path.join(settingsDirectory, "admin-model-settings.json");
    assert.equal(fs.statSync(savedPath).mode & 0o777, 0o600);
    assert.equal(Object.keys(JSON.parse(fs.readFileSync(savedPath, "utf8"))).length, 2);
    assert.equal(JSON.stringify(await settings.listAdminModelSettings()).includes("fixture-provider-token"), false);
    console.log(JSON.stringify({ adminModelSettingsPersist: true, privateAtomicSettings: true, featureCatalog: true, planningEngineContracts: true, noNetworkOrPaidCalls: true }));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
    fs.rmSync(settingsDirectory, { recursive: true, force: true });
    Module._resolveFilename = originalResolve;
});
