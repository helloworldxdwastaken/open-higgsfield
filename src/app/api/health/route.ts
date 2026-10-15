import { NextResponse } from "next/server";

export function GET() {
    return NextResponse.json({ status: "ok", service: "open-higgsfield", application: "Highfield", version: "0.2.0" });
}
