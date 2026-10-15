import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const source = path.resolve(import.meta.dirname, "..");
const configured = spawnSync("git", ["config", "--get", "highfield.gitleaksBin"], { cwd: source, encoding: "utf8" }).stdout?.trim();
const scanner = process.env.GITLEAKS_BIN || (configured ? path.resolve(source, configured) : "gitleaks");
const fixture = mkdtempSync(path.join(tmpdir(), "highfield-privacy-test-"));
function git(...args) {
    assert.equal(spawnSync("git", args, { cwd: fixture, encoding: "utf8" }).status, 0);
}
function check(args = [], extra = {}) {
    const result = spawnSync(process.execPath, ["scripts/check-public-source.mjs", ...args], { cwd: fixture, encoding: "utf8", env: { ...process.env, PRIVACY_DENYLIST_FILE: "", GITLEAKS_BIN: scanner, ...extra } });
    return { status: result.status, text: result.stdout + result.stderr };
}
try {
    git("init", "--quiet"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.invalid");
    mkdirSync(path.join(fixture, "scripts"));
    copyFileSync(path.join(source, "scripts/check-public-source.mjs"), path.join(fixture, "scripts/check-public-source.mjs"));
    writeFileSync(path.join(fixture, "scripts/privacy-baseline.json"), "[]\n");
    writeFileSync(path.join(fixture, ".env.example"), 'PROVIDER_API_KEY=\nPASSWORD=""\n');
    writeFileSync(path.join(fixture, "README.md"), "A public sample.\n");
    git("add", "."); git("commit", "--quiet", "-m", "Fixture base");
    assert.equal(check(["--history"]).status, 0, "Blank examples should pass");
    writeFileSync(path.join(fixture, ".env.local"), "PRIVATE_SETTING=fixture-only\n");
    assert.equal(check().status, 1, "New private files must be rejected");
    rmSync(path.join(fixture, ".env.local"));
    const token = randomBytes(32).toString("hex");
    writeFileSync(path.join(fixture, "leaked.js"), `const API_KEY = "${token}";\n`);
    const detected = check();
    assert.equal(detected.status, 1, "A newly introduced synthetic secret must be rejected");
    assert(!detected.text.includes(token), "Secret values must never be printed");
    git("add", "leaked.js"); git("commit", "--quiet", "-m", "Synthetic secret fixture");
    git("rm", "--quiet", "leaked.js"); git("commit", "--quiet", "-m", "Remove fixture secret");
    assert.equal(check().status, 0, "Removed fixture is absent from the current tree");
    assert.equal(check(["--history"]).status, 1, "Deleting a secret must not evade the history check");
    const privateText = randomBytes(12).toString("hex");
    const denylist = path.join(tmpdir(), `highfield-test-denylist-${randomBytes(8).toString("hex")}.json`);
    try {
        writeFileSync(denylist, JSON.stringify([privateText]), { mode: 0o600 });
        writeFileSync(path.join(fixture, "README.md"), privateText);
        const exact = check([], { PRIVACY_DENYLIST_FILE: denylist });
        assert.equal(exact.status, 1); assert(!exact.text.includes(privateText));
        writeFileSync(denylist, `invalid ${privateText}`);
        const malformed = check([], { PRIVACY_DENYLIST_FILE: denylist });
        assert.equal(malformed.status, 1); assert(!malformed.text.includes(privateText));
    } finally { rmSync(denylist, { force: true }); }
    assert.equal(check([], { GITLEAKS_BIN: path.join(fixture, "missing-scanner") }).status, 1, "A missing scanner must fail closed");
    console.log("Source privacy guard passed: clean examples, private paths, synthetic secrets, deleted history, exact values, redaction and missing scanner.");
} finally { rmSync(fixture, { recursive: true, force: true }); }
