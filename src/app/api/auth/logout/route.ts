import { NextResponse } from "next/server";
import { destroySession, readSessionCookie, SESSION_COOKIE } from "@/lib/users";

export async function POST(request: Request) {
    const token = readSessionCookie(request.headers.get("cookie"));
    if (token) await destroySession(token);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", expires: new Date(0) });
    return response;
}
