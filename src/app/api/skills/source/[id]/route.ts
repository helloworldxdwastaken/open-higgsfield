import { NextRequest, NextResponse } from "next/server";
import { getSkillReference, skillReferenceLicense } from "@/lib/skill-reference";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const { id } = await context.params;
    const source = getSkillReference(id);
    if (!source) return NextResponse.json({ error: "ERR_SKILL_SOURCE_NOT_FOUND" }, { status: 404, headers: privateHeaders });
    if (request.nextUrl.searchParams.get("bundle") === "1") {
        return new NextResponse(JSON.stringify({ format: "highfield-licensed-source", schemaVersion: 1, ...skillReferenceLicense(), ...source }, null, 2), {
            headers: { ...privateHeaders, "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${id}-source.json"` },
        });
    }
    const filename = request.nextUrl.searchParams.get("file") || `${id}/SKILL.md`;
    const file = source.files.find(entry => entry.path === filename);
    if (!file) return NextResponse.json({ error: "ERR_SKILL_SOURCE_NOT_FOUND" }, { status: 404, headers: privateHeaders });
    return new NextResponse(file.content, { headers: { ...privateHeaders, "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename="${file.path.split("/").at(-1)}"`, "X-Source-SHA256": file.sha256 } });
}
