import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import mime from "mime-types";
import { userUploadsDir, USER_STORAGE_ID_PATTERN } from "@/lib/storage-paths";
import { PRIVATE_MEDIA_HEADERS } from "@/lib/public-tasks";
import { getRequestSessionUser } from "@/lib/users";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const user = await getRequestSessionUser(_req);
  if (!user) return NextResponse.json({ error: "ERR_AUTHENTICATION_REQUIRED" }, { status: 401, headers: PRIVATE_MEDIA_HEADERS });

  const { path: segments } = await params;
  if (segments.length !== 2 || !USER_STORAGE_ID_PATTERN.test(segments[0]) || segments[0] !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: PRIVATE_MEDIA_HEADERS });
  }

  const safeFilename = segments[1].replace(/\\/g, "/").split("/").pop() ?? "";
  if (!safeFilename || safeFilename.startsWith(".")) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: PRIVATE_MEDIA_HEADERS });
  }

  const filePath = path.join(userUploadsDir(user.id), safeFilename);
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: PRIVATE_MEDIA_HEADERS });
  }

  const buffer = fs.readFileSync(filePath);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": mime.lookup(filePath) || "application/octet-stream",
      ...PRIVATE_MEDIA_HEADERS,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
