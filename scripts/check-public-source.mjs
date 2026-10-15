#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// No source, credentials, or scanner reports leave this machine.
const history = process.argv.includes("--history");
const root = process.cwd();
const temporary = mkdtempSync(path.join(tmpdir(), "highfield-source-audit-"));
const issues = [];
const summary = [];
function run(command, args, cwd = root) {
    return spawnSync(command, args, { cwd, encoding: "utf8", maxBuffer: 128 * 1024 * 1024, timeout: 180000 });
}
function git(args, cwd = root) {
    const result = run("git", args, cwd);
    if (result.status !== 0) throw new Error("Git inspection failed; no clean result recorded.");
    return result.stdout;
}
function forbidden(file) {
    const parts = file.replaceAll("\\", "/").split("/");
    return parts.some(part => /^(?:\.env(?:\..*)?|private-settings|\.runtime|secrets|accounts|sessions|backups|uploads|downloads|data|\.ssh|\.aws|\.kube|\.npmrc|\.pypirc|\.privacy-denylist\.json|PROJECT_MEMORY\.md|tasks_history\.json(?:\..*)?)$/i.test(part) && part !== ".env.example") ||
        /(?:credentials|service-account).*\.json$/i.test(file) || /\.(?:pem|key|p12|pfx|sqlite3?|db(?:-shm|-wal)?|dump|bak)$/i.test(file) || /(?:^|\/)cookies[^/]*\.txt$/i.test(file);
}
function checkContents(file, bytes, scope, denylist) {
    if (forbidden(file)) issues.push({ scope, file, rule: "private-file" });
    if (path.basename(file) === ".env.example") {
        for (const line of bytes.toString("utf8").split(/\r?\n/)) {
            const assignment = line.match(/^\s*([A-Z0-9_]*(?:KEY|TOKEN|PASSWORD|SECRET|CREDENTIAL)[A-Z0-9_]*)\s*=\s*(.*?)\s*$/i);
            if (assignment && assignment[2] && !/^(?:""|'')$/.test(assignment[2])) issues.push({ scope, file, rule: "populated-example-credential" });
        }
    }
    for (const value of denylist) if (bytes.includes(Buffer.from(value))) {
        issues.push({ scope, file, rule: "operator-private-value" });
        break;
    }
}

try {
    git(["rev-parse", "--show-toplevel"]);
    const configured = run("git", ["config", "--get", "highfield.gitleaksBin"]).stdout?.trim();
    const scanner = process.env.GITLEAKS_BIN || configured || "gitleaks";
    if (run(scanner, ["version"]).status !== 0) throw new Error("Gitleaks is required. Set GITLEAKS_BIN to a verified local binary; the check never downloads tools.");
    let denylist = [];
    const denylistFile = process.env.PRIVACY_DENYLIST_FILE || run("git", ["config", "--get", "highfield.privateDenylistFile"]).stdout?.trim();
    try { if (denylistFile) denylist = JSON.parse(readFileSync(denylistFile, "utf8")); }
    catch { throw new Error("Cannot read private denylist as JSON; contents withheld."); }
    if (!Array.isArray(denylist) || denylist.some(value => typeof value !== "string" || value.length < 8)) throw new Error("Private denylist must be an array of strings of at least eight characters.");
    const sources = [{ name: "application", directory: root }];
    const links = git(["ls-files", "--stage", "-z"]).split("\0").filter(line => line.startsWith("160000 "));
    for (const link of links) {
        const match = link.match(/^160000 ([a-f0-9]+) \d\t(.+)$/s);
        if (!match) throw new Error("Invalid submodule entry.");
        const directory = path.resolve(root, match[2]);
        if (!existsSync(path.join(directory, ".git"))) throw new Error("Initialize pinned submodules before publishing.");
        if (git(["rev-parse", "HEAD"], directory).trim() !== match[1]) throw new Error("Submodule checkout differs from its staged source pin.");
        sources.push({ name: match[2], directory });
    }
    const baseline = JSON.parse(readFileSync(path.join(import.meta.dirname, "privacy-baseline.json"), "utf8"));
    for (let number = 0; number < sources.length; number++) {
        const source = sources[number];
        const exported = path.join(temporary, `source-${number}`);
        mkdirSync(exported, { mode: 0o700 });
        const files = [...new Set(git(["ls-files", "--cached", "--others", "--exclude-standard", "-z"], source.directory).split("\0").filter(Boolean))];
        let count = 0;
        for (const file of files) {
            const absolute = path.join(source.directory, file);
            if (!existsSync(absolute)) continue;
            const stat = lstatSync(absolute);
            if (stat.isDirectory()) continue; // Gitlinks are inspected as separate source trees.
            if (stat.isSymbolicLink()) {
                if (!realpathSync(absolute).startsWith(realpathSync(source.directory) + path.sep)) issues.push({ scope: source.name, file, rule: "external-symlink" });
                continue;
            }
            const bytes = readFileSync(absolute);
            checkContents(file, bytes, source.name, denylist);
            const destination = path.join(exported, file);
            mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
            writeFileSync(destination, bytes, { mode: 0o600 });
            count++;
        }
        const scans = ["current", ...(history ? ["history"] : [])];
        let reviewedExamples = 0;
        for (const scan of scans) {
            const report = path.join(temporary, `report-${number}-${scan}.json`);
            const args = [scan === "history" ? "git" : "dir", scan === "history" ? source.directory : exported,
                "--redact=100", "--ignore-gitleaks-allow", "--no-banner", "--log-level=error", "--report-format=json", `--report-path=${report}`, "--timeout=120"];
            if (scan === "history") args.push("--log-opts=--all");
            const result = run(scanner, args);
            if (![0, 1].includes(result.status)) throw new Error("Secret scanner failed; no clean result recorded.");
            const findings = existsSync(report) ? JSON.parse(readFileSync(report, "utf8")) : [];
            for (const finding of findings) {
                const file = path.isAbsolute(finding.File) ? path.relative(exported, finding.File) : finding.File;
                const known = baseline.find(entry => entry.scope === source.name && entry.file === file && entry.rule === finding.RuleID && entry.line === finding.StartLine &&
                    (scan === "history" ? entry.commit === finding.Commit : existsSync(path.join(source.directory, file)) && createHash("sha256").update(readFileSync(path.join(source.directory, file))).digest("hex") === entry.sha256));
                if (known) reviewedExamples++;
                else issues.push({ scope: source.name, scan, file, line: finding.StartLine, rule: finding.RuleID });
            }
        }
        if (history) {
            // Exact operator values are also checked in every reachable Git blob.
            const objects = git(["rev-list", "--objects", "--all"], source.directory).trim().split("\n");
            for (const object of objects) {
                const space = object.indexOf(" ");
                if (space < 0) continue;
                const oid = object.slice(0, space), file = object.slice(space + 1);
                if (git(["cat-file", "-t", oid], source.directory).trim() !== "blob") continue;
                const result = spawnSync("git", ["cat-file", "blob", oid], { cwd: source.directory, maxBuffer: 128 * 1024 * 1024 });
                if (result.status !== 0) throw new Error("History blob inspection failed.");
                checkContents(file, result.stdout, `${source.name}:history`, denylist);
            }
        }
        summary.push({ scope: source.name, files: count, reviewedExamples, ...(history ? { commits: Number(git(["rev-list", "--count", "--all"], source.directory)), shallow: git(["rev-parse", "--is-shallow-repository"], source.directory).trim() === "true" } : {}) });
    }
    console.log(JSON.stringify({ passed: issues.length === 0, history, sources: summary, issues }, null, 2));
    if (issues.length) process.exitCode = 1;
} catch (error) {
    console.error(error instanceof Error ? error.message : "Source privacy check failed.");
    process.exitCode = 1;
} finally {
    rmSync(temporary, { recursive: true, force: true });
}
