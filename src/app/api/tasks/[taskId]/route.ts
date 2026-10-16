import { NextRequest, NextResponse } from "next/server";
import { getTask, deleteTask, initStore } from "@/lib/task-store";
import { getRequestSessionUser } from "@/lib/users";

export const runtime = "nodejs";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const user = await getRequestSessionUser(_req);
  if (!user) return NextResponse.json({ error: "ERR_AUTHENTICATION_REQUIRED" }, { status: 401 });
  await initStore();
  if (!getTask(taskId, user.id)) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  await deleteTask(taskId, user.id);
  return NextResponse.json({ ok: true });
}
