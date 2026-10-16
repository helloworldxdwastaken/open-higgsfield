import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import { timingSafeEqual } from "node:crypto";
import { countUsers, createSession, createUser, SESSION_COOKIE } from "@/lib/users";

async function readBootstrapToken(): Promise<Buffer | null> {
    const settingsDir = process.env.STUDIO_SETTINGS_DIR;
    if (!settingsDir) return null;
    const tokenPath = path.join(settingsDir, "highfield-bootstrap.token");
    try {
        const [token, stat] = await Promise.all([fs.readFile(tokenPath), fs.stat(tokenPath)]);
        return stat.mode & 0o077 ? null : token;
    } catch {
        return null;
    }
}

function tokenMatches(expected: Buffer, supplied: string): boolean {
    const actual = Buffer.from(supplied, "utf8");
    return expected.length > 0 && actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function POST(request: Request) {
    try {
        const bootstrapToken = await readBootstrapToken();
        const body = (await request.json()) as { email?: string; password?: string; setup_token?: string };
        if (!bootstrapToken || !tokenMatches(bootstrapToken, String(body.setup_token ?? ""))) {
            return NextResponse.json({ error: "BOOTSTRAP_TOKEN_REQUIRED" }, { status: 403 });
        }
        if ((await countUsers()) > 0) {
            return NextResponse.json({ error: "BOOTSTRAP_CLOSED" }, { status: 403 });
        }
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
