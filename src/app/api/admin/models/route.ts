import { NextRequest, NextResponse } from "next/server";
import { ADMIN_MODEL_FEATURES, listAdminModelSettings, saveAdminModelSetting } from "@/lib/model-settings";
import { getRequestSessionUser } from "@/lib/users";

const headers = { "Cache-Control": "private, no-store" };

async function requireAdmin(request: NextRequest) {
    const user = await getRequestSessionUser(request);
    if (!user) return { error: NextResponse.json({ error: "ERR_AUTHENTICATION_REQUIRED" }, { status: 401, headers }) };
    if (user.role !== "admin") return { error: NextResponse.json({ error: "ERR_ADMIN_REQUIRED" }, { status: 403, headers }) };
    return { user };
}

export async function GET(request: NextRequest) {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;
    return NextResponse.json({ features: ADMIN_MODEL_FEATURES, settings: await listAdminModelSettings() }, { headers });
}

export async function PUT(request: NextRequest) {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;
    try {
        const body = await request.json() as { feature?: string; model_id?: string; provider_engine?: string };
        if (!body.feature || typeof body.model_id !== "string") return NextResponse.json({ error: "ERR_INVALID_MODEL_SETTING" }, { status: 400, headers });
        const setting = await saveAdminModelSetting(body.feature, body);
        return NextResponse.json({ setting }, { headers });
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "ERR_MODEL_SETTINGS_FAILED" }, { status: 400, headers });
    }
}
