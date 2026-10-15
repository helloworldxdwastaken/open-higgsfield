import { NextResponse } from "next/server";
import { getVideoTasks, initStore } from "@/lib/task-store";
import { PRIVATE_MEDIA_HEADERS, toPublicTask } from "@/lib/public-tasks";

export const runtime = "nodejs";

export async function GET() {
  await initStore();
  const tasks = getVideoTasks();
  return NextResponse.json(tasks.map(toPublicTask), { headers: PRIVATE_MEDIA_HEADERS });
}
