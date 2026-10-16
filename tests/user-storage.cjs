/* eslint-disable @typescript-eslint/no-require-imports -- Offline per-user storage quota contract. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "highfield-user-storage-"));
process.env.OPEN_HIGGSFIELD_STORAGE_DIR = storageRoot;
process.env.HIGHFIELD_USER_STORAGE_LIMIT_BYTES = "1024";
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (id, parent, ...rest) {
    return originalResolve.call(this, id.startsWith("@/") ? path.join(root, "src", id.slice(2)) + ".ts" : id, parent, ...rest);
};
Module._extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);
global.fetch = async () => { throw new Error("Fixture attempted a network request"); };

(async () => {
    const { USER_STORAGE_LIMIT_BYTES } = require(path.join(root, "src/lib/storage-paths.ts"));
    const { getUserStorageUsage, withUserStorageQuota } = require(path.join(root, "src/lib/user-storage.ts"));
    const userId = "0123456789abcdef0123456789abcdef";
    const userRoot = path.join(storageRoot, "users", userId, "downloads", "images");
    fs.mkdirSync(userRoot, { recursive: true });
    fs.writeFileSync(path.join(userRoot, "existing.bin"), Buffer.alloc(700));
    fs.symlinkSync("/etc/hostname", path.join(userRoot, "unsafe-link"));
    assert.equal(USER_STORAGE_LIMIT_BYTES, 1024);
    assert.equal(await getUserStorageUsage(userId), 700);
    await withUserStorageQuota(userId, 300, async () => "fits");
    await assert.rejects(withUserStorageQuota(userId, 325, async () => "too-large"), /ERR_STORAGE_QUOTA_EXCEEDED/);
    const raceUserId = "fedcba9876543210fedcba9876543210";
    const raceRoot = path.join(storageRoot, "users", raceUserId, "uploads");
    fs.mkdirSync(raceRoot, { recursive: true });
    fs.writeFileSync(path.join(raceRoot, "existing.bin"), Buffer.alloc(500));
    const races = await Promise.allSettled([
        withUserStorageQuota(raceUserId, 300, async () => fs.writeFileSync(path.join(raceRoot, "race-first.bin"), Buffer.alloc(300))),
        withUserStorageQuota(raceUserId, 300, async () => fs.writeFileSync(path.join(raceRoot, "race-second.bin"), Buffer.alloc(300))),
    ]);
    assert.equal(races.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(JSON.stringify({ usage: await getUserStorageUsage(userId) }).includes("private-path"), false);
    console.log(JSON.stringify({ perUserStorageUsage: true, quotaEnforcement: true, concurrentQuotaSafe: true, symlinkUsageIgnored: true, noNetworkOrPaidCalls: true }));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
    fs.rmSync(storageRoot, { recursive: true, force: true });
    Module._resolveFilename = originalResolve;
});
