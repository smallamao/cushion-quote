import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME, verifySession } from "@/lib/auth";
import { getSheetsClient } from "@/lib/sheets-client";
import { findUserByEmail, updateUser } from "@/lib/users-sheet";

function getSession(request: Request) {
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .find((c) => c.trim().startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.split("=")[1];
  return verifySession(token);
}

/** GET — 回傳目前使用者的未讀回覆數（單次 batchGet 讀取兩張表） */
export async function GET(request: Request) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  }

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: true, unreadCount: 0 });
  }

  // 一次 batchGet 同時讀使用者表和回覆表
  const res = await client.sheets.spreadsheets.values.batchGet({
    spreadsheetId: client.spreadsheetId,
    ranges: ["使用者!A2:H", "售後服務回應!A2:G"],
  });

  const [usersData, repliesData] = res.data.valueRanges ?? [];
  const userRows = (usersData?.values ?? []) as string[][];
  const replyRows = (repliesData?.values ?? []) as string[][];

  // 找當前使用者的 lastReadRepliesAt (col H = index 7)
  const emailLower = session.email.toLowerCase();
  const userRow = userRows.find(
    (r) => (r[1] ?? "").toLowerCase() === emailLower && r[4] !== "FALSE",
  );
  if (!userRow) {
    return NextResponse.json({ ok: true, unreadCount: 0 });
  }

  const lastRead = userRow[7] ?? "";
  if (!lastRead) {
    return NextResponse.json({ ok: true, unreadCount: 0 });
  }

  // 計算未讀：occurredAt(col C=2) > lastRead 且 author(col D=3) 不是自己
  let unreadCount = 0;
  for (const row of replyRows) {
    const occurredAt = row[2] ?? "";
    const author = row[3] ?? "";
    if (occurredAt > lastRead && author !== session.displayName) {
      unreadCount++;
    }
  }

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
