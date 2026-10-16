import { NextResponse } from "next/server";
import { createUser, getRequestSessionUser, listUsers, setUserActive } from "@/lib/users";

async function requireAdmin(request: Request) {
    const user = await getRequestSessionUser(request);
    if (!user) return { error: NextResponse.json({ error: "ERR_AUTHENTICATION_REQUIRED" }, { status: 401 }) };
    if (user.role !== "admin") return { error: NextResponse.json({ error: "ERR_ADMIN_REQUIRED" }, { status: 403 }) };
    return { user };
}

export async function GET(request: Request) {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;
    try {
        return NextResponse.json({ users: await listUsers() }, { headers: { "Cache-Control": "private, no-store" } });
    } catch {
        return NextResponse.json({ error: "ADMIN_USERS_FAILED" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;
    try {
        const body = await request.json() as { email?: string; password?: string; role?: "admin" | "user" };
        if (!body.email || !body.password) return NextResponse.json({ error: "MISSING_CREDENTIALS" }, { status: 400 });
        const user = await createUser(body.email, body.password, body.role === "admin" ? "admin" : "user");
        return NextResponse.json({ user }, { headers: { "Cache-Control": "private, no-store" } });
    } catch (error) {
        const message = error instanceof Error ? error.message : "ADMIN_USER_CREATE_FAILED";
        return NextResponse.json({ error: message }, { status: 400 });
    }
}

export async function PATCH(request: Request) {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;
    try {
        const body = await request.json() as { user_id?: string; active?: boolean };
        if (!body.user_id || typeof body.active !== "boolean") return NextResponse.json({ error: "INVALID_USER_UPDATE" }, { status: 400 });
        if (body.user_id === auth.user!.id && !body.active) return NextResponse.json({ error: "CANNOT_DEACTIVATE_SELF" }, { status: 400 });
        await setUserActive(body.user_id, body.active);
        return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
    } catch {
        return NextResponse.json({ error: "ADMIN_USER_UPDATE_FAILED" }, { status: 500 });
    }
}
