import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getEffectPreset } from "@/lib/effect-presets";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!getEffectPreset(id)) return NextResponse.json({ error: "ERR_PREVIEW_NOT_FOUND" }, { status: 404, headers });
  try {
    const directory = path.join(path.resolve(process.env.STUDIO_SETTINGS_DIR || "private-settings"), "preset-previews");
    const stat = await fs.lstat(directory); if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error();
    const file = await fs.open(path.join(directory, id + ".webp"), constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    try {
      const info = await file.stat(); if (!info.isFile() || info.size > 512 * 1024) throw new Error();
      const image = await file.readFile();
      if (image.length < 12 || image.toString("ascii", 0, 4) !== "RIFF" || image.toString("ascii", 8, 12) !== "WEBP") throw new Error();
      return new NextResponse(new Uint8Array(image), { headers: { ...headers, "Content-Type": "image/webp" } });
    } finally { await file.close(); }
  } catch { return NextResponse.json({ error: "ERR_PREVIEW_UNAVAILABLE" }, { status: 404, headers }); }
}
