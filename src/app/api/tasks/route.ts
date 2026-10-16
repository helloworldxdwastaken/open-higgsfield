import { NextResponse } from "next/server";
import { getVideoTasks, initStore } from "@/lib/task-store";
import { PRIVATE_MEDIA_HEADERS, toPublicTask } from "@/lib/public-tasks";
import { getRequestSessionUser } from "@/lib/users";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getRequestSessionUser(request);
  if (!user) return NextResponse.json({ error: "ERR_AUTHENTICATION_REQUIRED" }, { status: 401, headers: PRIVATE_MEDIA_HEADERS });
  await initStore();
  const tasks = getVideoTasks(user.id);
  return NextResponse.json(tasks.map(toPublicTask), { headers: PRIVATE_MEDIA_HEADERS });
}
