import { NextResponse } from "next/server";
import { countUsers, createSession, createUser, SESSION_COOKIE } from "@/lib/users";

export async function POST(request: Request) {
    try {
        if ((await countUsers()) > 0) {
            return NextResponse.json({ error: "BOOTSTRAP_CLOSED" }, { status: 403 });
        }
        const body = (await request.json()) as { email?: string; password?: string };
        if (!body.email || !body.password) return NextResponse.json({ error: "MISSING_CREDENTIALS" }, { status: 400 });
        const user = await createUser(body.email, body.password, "admin");
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
        const message = error instanceof Error ? error.message : "BOOTSTRAP_FAILED";
        return NextResponse.json({ error: message }, { status: 400 });
    }
}
