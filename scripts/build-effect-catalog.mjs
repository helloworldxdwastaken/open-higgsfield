// Reads a public-page metadata capture; never runs page JavaScript or accesses authenticated content.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { instructions } from "./preset-instructions.mjs";

const capture = fs.readFileSync(process.argv[2], "utf8");
const rows = JSON.parse(capture);
if (!Array.isArray(rows) || rows.length !== Object.keys(instructions).length) throw new Error("Review the public catalog before changing its size");
const ids = new Set();
const presets = rows.map(row => {
  if (!row || !/^[a-z0-9-]{1,80}$/.test(row.id) || ids.has(row.id) || !instructions[row.id] || typeof row.name !== "string" || row.name.length > 80) throw new Error("Invalid or unsupported preset metadata");
  ids.add(row.id);
  const image = new URL(row.image);
  if (image.protocol !== "https:" || image.hostname !== "cdn.higgsfield.ai" || image.username || image.password || image.search || image.hash || !/^\/[a-zA-Z0-9_/-]+\.(?:webp|jpg|png)$/.test(image.pathname)) throw new Error("Only captured public Higgsfield showcase images are allowed");
  const source = `https://higgsfield.ai/effects/examples/${row.id}`;
  if (row.source !== source) throw new Error("Unexpected source page");
  const [mediaType, category, direction] = instructions[row.id];
  const prompt = `${mediaType === "image" ? "Create a still-image interpretation using the uploaded image as the subject reference." : "Create a short video using the uploaded image as the subject reference."} ${direction} Keep the reference identity and setting consistent except for the described effect. Do not add captions, watermarks or unrelated logos. This is artistic prompt guidance for the selected model, not a request to run a proprietary preset engine.`;
  return { id: row.id, name: row.name, mediaType, category, direction, prompt, requiredImages: 1, execution: "prompt-interpretation", previewSource: image.href, exampleUrl: source, originalPresetUrl: `https://higgsfield.ai/effects/use/${row.id}` };
});
const result = { schemaVersion: 1, capturedOn: "2026-10-16", source: "https://higgsfield.ai/effects", captureSha256: createHash("sha256").update(capture).digest("hex"), artworkRights: "Third-party showcase examples; no open-source image license is assumed. Image files are excluded from public source and cached privately at the owner's request.", recipeRights: "Independently authored Highfield prompt interpretations, not original Higgsfield preset recipes.", presets };
fs.mkdirSync("src/content", { recursive: true });
fs.writeFileSync(path.join("src/content", "effect-presets.json"), JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({ publicExamples: presets.length, promptInterpretations: presets.length, noOriginalPresetRecipesRecovered: true, imageFilesBundled: false }));
