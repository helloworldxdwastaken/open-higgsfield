import { NextRequest, NextResponse } from "next/server";
import { connectionStatus, saveConnections } from "@/lib/connections";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
export async function GET() {
  try { return NextResponse.json({ fields: connectionStatus() }, { headers }); }
  catch { return NextResponse.json({ error: "Unable to read provider settings." }, { status: 500, headers }); }
}
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== process.env.STUDIO_PUBLIC_ORIGIN) return NextResponse.json({ error: "This request must come from your studio." }, { status: 403, headers });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return NextResponse.json({ error: "JSON required." }, { status: 415, headers });
  const text = await request.text();
  if (text.length > 65536) return NextResponse.json({ error: "Settings are too large." }, { status: 413, headers });
  try {
    const body = JSON.parse(text);
    return NextResponse.json({ fields: saveConnections(body.values, body.remove ?? []) }, { headers });
  } catch {
    return NextResponse.json({ error: "Settings could not be saved. Check the fields and service account JSON." }, { status: 400, headers });
  }
}
