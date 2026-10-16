import { NextRequest, NextResponse } from "next/server";
import { getFeatureModel } from "@/lib/model-settings";
import { getRequestSessionUser } from "@/lib/users";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest) {
    const user = await getRequestSessionUser(request);
    if (!user) return NextResponse.json({ error: "ERR_AUTHENTICATION_REQUIRED" }, { status: 401, headers });
    const features = ["image_generation", "video_generation", "ads_generation", "cinema_generation", "influencer_generation", "supercomputer_generation", "katana_generation", "genjutsu_motion_transfer", "genjutsu_object_swap", "openrouter_image", "openrouter_video", "local_image"];
    const settings = Object.fromEntries(await Promise.all(features.map(async feature => [feature, await getFeatureModel(feature)] as const)));
    return NextResponse.json({ settings }, { headers });
}
