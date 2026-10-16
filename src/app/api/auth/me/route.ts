import { NextResponse } from "next/server";
import { getSessionUser, readSessionCookie } from "@/lib/users";

export async function GET(request: Request) {
    const user = await getSessionUser(readSessionCookie(request.headers.get("cookie")));
    if (!user) return NextResponse.json({ user: null }, { status: 401 });
    return NextResponse.json({ user: { id: user.id, email: user.email, role: user.role } });
}
