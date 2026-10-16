// Explicit bounded public-image cache. No provider/session credentials are read or forwarded.
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import sharp from "sharp";
const catalog = JSON.parse(await fs.readFile("src/content/effect-presets.json", "utf8"));
const root = path.resolve(process.env.STUDIO_SETTINGS_DIR || "private-settings");
const directory = path.join(root, "preset-previews");
for (const location of [root, directory]) {
  await fs.mkdir(location, { recursive: true, mode: 0o700 });
  const stat = await fs.lstat(location);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Unsafe preview directory");
  await fs.chmod(location, 0o700);
}
const results = [];
async function cache(preset) {
  if (!/^[a-z0-9-]{1,80}$/.test(preset.id)) throw new Error("Invalid preset ID");
  const url = new URL(preset.previewSource);
  if (url.protocol !== "https:" || url.hostname !== "cdn.higgsfield.ai" || url.username || url.password || url.search || url.hash) throw new Error("Invalid public preview URL");
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(20000), headers: { Accept: "image/webp,image/png,image/jpeg", "User-Agent": "Highfield-public-showcase-cache/1" } });
  if (!response.ok || !/^image\/(webp|png|jpeg)(?:;|$)/.test(response.headers.get("content-type") || "")) { await response.body?.cancel(); throw new Error("Public preview unavailable"); }
  if (Number(response.headers.get("content-length")) > 4 * 1024 * 1024) { await response.body?.cancel(); throw new Error("Preview too large"); }
  const reader = response.body?.getReader(); if (!reader) throw new Error("Empty preview");
  let size = 0; const chunks = [];
  try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 4 * 1024 * 1024) throw new Error("Preview too large"); chunks.push(value); } }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const original = Buffer.concat(chunks);
  const image = sharp(original, { limitInputPixels: 20_000_000, animated: false });
  const metadata = await image.metadata(); if (!metadata.width || !metadata.height) throw new Error("Invalid preview");
  const output = await image.rotate().resize({ width: 768, height: 1024, fit: "inside", withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
  if (output.length > 512 * 1024) throw new Error("Cached preview too large");
  const target = path.join(directory, preset.id + ".webp"); const temporary = target + "." + randomUUID() + ".tmp";
  try { await fs.writeFile(temporary, output, { mode: 0o600, flag: "wx" }); await fs.rename(temporary, target); }
  finally { await fs.unlink(temporary).catch(() => {}); }
  return { id: preset.id, bytes: output.length, originalSha256: createHash("sha256").update(original).digest("hex"), cachedSha256: createHash("sha256").update(output).digest("hex") };
}
let next = 0;
await Promise.all(Array.from({ length: 4 }, async () => {
  while (next < catalog.presets.length) {
    const preset = catalog.presets[next++];
    try { results.push({ ...(await cache(preset)), ready: true }); }
    catch { results.push({ id: preset.id, ready: false }); }
  }
}));
const receipt = { schemaVersion: 1, examplesOnly: true, downloadedAt: new Date().toISOString(), results };
const temporary = path.join(directory, `manifest.${randomUUID()}.tmp`);
try { await fs.writeFile(temporary, JSON.stringify(receipt, null, 2), { mode: 0o600, flag: "wx" }); await fs.rename(temporary, path.join(directory, "manifest.json")); }
finally { await fs.unlink(temporary).catch(() => {}); }
console.log(JSON.stringify({ cached: results.filter(item => item.ready).length, failed: results.filter(item => !item.ready).map(item => item.id), bytes: results.reduce((sum, item) => sum + (item.bytes || 0), 0), providerCalls: 0 }));
if (results.some(item => !item.ready)) process.exitCode = 1;
