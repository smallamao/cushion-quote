import { NextResponse } from "next/server";

// 2026-10-15：原本自己解析 cookie 只驗簽章，不查這個帳號現在還在不在職——
// 停用帳號 30 天內照樣進得來。改用 lib/api-auth 的共用實作，停用與降權立刻生效。

import { getActiveSession } from "@/lib/api-auth";
import { listServices } from "@/lib/after-sales-sheet";
import { getSheetsClient } from "@/lib/sheets-client";
import { selectUnreadReplies } from "@/lib/unread-replies";
import { findUserByEmail, updateUser } from "@/lib/users-sheet";


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

  // 🔴 2026-10-15 第二輪稽核：原本只比對「時間 > 上次已讀」與「作者不是自己」，
  //    完全沒有比對這張單是不是你的——師傅因此看得到所有單的回覆前 80 字，
  //    包含其他師傅的案子與客人對話。非 admin 要先算出自己被指派的單號。
  const isAdmin = session.role === "admin";
  let assignedServiceIds: Set<string> = new Set();
  if (!isAdmin) {
    const me = session.displayName.trim();
    if (!me) {
      // 拿不到自己的名字就無法判斷歸屬，一律回空——不可退化成「全部看得到」
      return NextResponse.json({ ok: true, unreadCount: 0, items: [] });
    }
    try {
      const services = await listServices();
      assignedServiceIds = new Set(
        services.filter((sv) => (sv.assignedTo ?? "").trim() === me).map((sv) => sv.serviceId),
      );
    } catch {
      return NextResponse.json({ ok: true, unreadCount: 0, items: [] });
    }
  }

  // row: [0]=replyId [1]=serviceId [2]=occurredAt [3]=author [4]=content [5]=attachments [6]=createdAt
  const unreadItems = selectUnreadReplies(replyRows, {
    lastRead,
    displayName: session.displayName,
    isAdmin,
    assignedServiceIds,
  });

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
