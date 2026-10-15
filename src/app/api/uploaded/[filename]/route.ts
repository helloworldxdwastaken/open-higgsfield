import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import mime from "mime-types";
import { STORAGE_ROOT } from "@/lib/storage-paths";
import { PRIVATE_MEDIA_HEADERS } from "@/lib/public-tasks";

const UPLOADS_DIR = path.join(STORAGE_ROOT, "uploads");

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;
  // Prevent path traversal
  const safe = path.basename(filename);
  const filePath = path.join(UPLOADS_DIR, safe);

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: PRIVATE_MEDIA_HEADERS });
  }

  const buf = fs.readFileSync(filePath);
  const mimeType = mime.lookup(filePath) || "application/octet-stream";

  return new NextResponse(buf, {
    headers: {
      "Content-Type": mimeType,
      ...PRIVATE_MEDIA_HEADERS,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
