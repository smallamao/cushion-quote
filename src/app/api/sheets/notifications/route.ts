import { NextResponse } from "next/server";

import { listRecentNotifications } from "@/lib/notifications-sheet";

// GET 不讀 request → Next 會在建置時靜態化、永遠回舊快照（範本存了看不到的根因）
export const dynamic = "force-dynamic";

// GET — 最新後台通知（免帶已讀狀態；已讀由前端 localStorage 判定）。
// 存取權由 middleware 對 /api/sheets/* 的登入守門控制。
export async function GET() {
  const items = await listRecentNotifications(30);
  return NextResponse.json({ ok: true, items });
}
