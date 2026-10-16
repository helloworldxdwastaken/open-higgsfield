import { NextResponse } from "next/server";
import { createSession, SESSION_COOKIE, getUserByEmail, verifyPassword } from "@/lib/users";

export async function POST(request: Request) {
    try {
        const body = (await request.json()) as { email?: string; password?: string };
        if (!body.email || !body.password) return NextResponse.json({ error: "MISSING_CREDENTIALS" }, { status: 400 });
        const user = await getUserByEmail(body.email);
        if (!user || !user.active || !(await verifyPassword(body.password, user.password_hash))) {
            return NextResponse.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
        }
        const { token, expiresAt } = await createSession(user.id);
        const response = NextResponse.json({ ok: true, user: { id: user.id, email: user.email, role: user.role } });
        response.cookies.set(SESSION_COOKIE, token, {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            expires: expiresAt,
            path: "/",
        });
        return response;
    } catch (error) {
        console.error("login failed", error);
        return NextResponse.json({ error: "LOGIN_FAILED" }, { status: 500 });
    }
}
