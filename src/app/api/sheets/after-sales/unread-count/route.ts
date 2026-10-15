import { NextResponse } from "next/server";

// 2026-10-15：原本自己解析 cookie 只驗簽章，不查這個帳號現在還在不在職——
// 停用帳號 30 天內照樣進得來。改用 lib/api-auth 的共用實作，停用與降權立刻生效。

import { getActiveSession } from "@/lib/api-auth";
import { getSheetsClient } from "@/lib/sheets-client";
import { findUserByEmail, updateUser } from "@/lib/users-sheet";


interface UnreadItem {
  serviceId: string;
  author: string;
  content: string;
  occurredAt: string;
}

/** GET — 回傳未讀回覆數 + 最新 20 筆未讀明細 */
export async function GET(request: Request) {
  const session = await getActiveSession(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  }

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: true, unreadCount: 0, items: [] });
  }

  const res = await client.sheets.spreadsheets.values.batchGet({
    spreadsheetId: client.spreadsheetId,
    ranges: ["使用者!A2:H", "售後服務回應!A2:G"],
  });

  const [usersData, repliesData] = res.data.valueRanges ?? [];
  const userRows = (usersData?.values ?? []) as string[][];
  const replyRows = (repliesData?.values ?? []) as string[][];

  const emailLower = session.email.toLowerCase();
  const userRow = userRows.find(
    (r) => (r[1] ?? "").toLowerCase() === emailLower && r[4] !== "FALSE",
  );
  if (!userRow) {
    return NextResponse.json({ ok: true, unreadCount: 0, items: [] });
  }

  const lastRead = userRow[7] ?? "";
  if (!lastRead) {
    const userId = userRow[0] ?? "";
    if (userId) {
      void updateUser(userId, { lastReadRepliesAt: new Date().toISOString() }).catch(() => {});
    }
    return NextResponse.json({ ok: true, unreadCount: 0, items: [] });
  }

  // row: [0]=replyId [1]=serviceId [2]=occurredAt [3]=author [4]=content [5]=attachments [6]=createdAt
  const unreadItems: UnreadItem[] = [];
  for (const row of replyRows) {
    const occurredAt = row[2] ?? "";
    const author = row[3] ?? "";
    if (occurredAt > lastRead && author !== session.displayName) {
      unreadItems.push({
        serviceId: row[1] ?? "",
        author,
        content: (row[4] ?? "").slice(0, 80),
        occurredAt,
      });
    }
  }

  // 按時間倒序，最多回傳 20 筆
  unreadItems.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const items = unreadItems.slice(0, 20);

  return NextResponse.json({ ok: true, unreadCount: unreadItems.length, items });
}

/** POST — 標記全部已讀 */
export async function POST(request: Request) {
  const session = await getActiveSession(request);
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
