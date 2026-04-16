import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME, verifySession } from "@/lib/auth";
import { listAllReplies } from "@/lib/after-sales-sheet";
import { findUserByEmail, updateUser } from "@/lib/users-sheet";

function getSession(request: Request) {
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .find((c) => c.trim().startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.split("=")[1];
  return verifySession(token);
}

/** GET — 回傳目前使用者的未讀回覆數 */
export async function GET(request: Request) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  }

  const user = await findUserByEmail(session.email);
  if (!user) {
    return NextResponse.json({ ok: true, unreadCount: 0 });
  }

  const lastRead = user.lastReadRepliesAt || "";
  const replies = await listAllReplies();

  // 首次使用（沒有 lastReadRepliesAt）→ 回 0，不灌一堆歷史通知
  if (!lastRead) {
    return NextResponse.json({ ok: true, unreadCount: 0 });
  }

  const unreadCount = replies.filter(
    (r) => r.occurredAt > lastRead && r.author !== session.displayName,
  ).length;

  return NextResponse.json({ ok: true, unreadCount });
}

/** POST — 標記全部已讀（更新 lastReadRepliesAt） */
export async function POST(request: Request) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  }

  const user = await findUserByEmail(session.email);
  if (!user) {
    return NextResponse.json({ ok: false, error: "user_not_found" }, { status: 404 });
  }

  await updateUser(user.userId, {
    lastReadRepliesAt: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}
