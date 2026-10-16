// Reproducible, explicit source-data import. Does not execute imported instructions or scripts.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
const root = process.cwd();
const manifest = JSON.parse(fs.readFileSync(path.join(root, "docs/upstream-sources.json"), "utf8")).sources.find(item => item.name === "higgsfield-skills");
const directory = path.join(root, manifest.path);
if (execFileSync("git", ["-C", directory, "rev-parse", "HEAD"], { encoding: "utf8" }).trim() !== manifest.commit) throw new Error("Pinned skill revision mismatch");
if (execFileSync("git", ["-C", directory, "status", "--porcelain", "--untracked-files=all"], { encoding: "utf8" }).trim()) throw new Error("Skill source has local modifications; review instead of attributing them to upstream");
const digest = text => crypto.createHash("sha256").update(text).digest("hex");
const license = fs.readFileSync(path.join(directory, "LICENSE"), "utf8");
if (digest(license) !== manifest.license_sha256) throw new Error("Skill license changed; review before importing");
const sources = manifest.skill_files.map(file => {
    const skill = path.posix.dirname(file);
    const files = [file];
    const references = path.join(directory, skill, "references");
    if (fs.existsSync(references)) for (const name of fs.readdirSync(references).sort()) if (/^[a-z0-9-]+\.md$/.test(name)) files.push(`${skill}/references/${name}`);
    return { id: skill, files: files.map(name => {
        const content = fs.readFileSync(path.join(directory, name), "utf8");
        if (Buffer.byteLength(content) > 512 * 1024) throw new Error("Unexpectedly large source");
        return { path: name, sha256: digest(content), content };
    }) };
});
const data = { schemaVersion: 1, repository: manifest.repository, commit: manifest.commit, license, licenseSha256: manifest.license_sha256, sources };
fs.mkdirSync(path.join(root, "src/content"), { recursive: true });
fs.writeFileSync(path.join(root, "src/content/licensed-skill-reference.json"), JSON.stringify(data, null, 2) + "\n");
fs.mkdirSync(path.join(root, "public/licenses"), { recursive: true });
fs.writeFileSync(path.join(root, "public/licenses/higgsfield-skills-MIT.txt"), license);
console.log(JSON.stringify({ skills: sources.length, documents: sources.reduce((n, item) => n + item.files.length, 0), pinnedCommit: data.commit, licenseVerified: true, scriptsExecuted: false }));
