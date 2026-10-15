import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/api-auth";

import { listRecentNotifications } from "@/lib/notifications-sheet";

// GET 不讀 request → Next 會在建置時靜態化、永遠回舊快照（範本存了看不到的根因）
export const dynamic = "force-dynamic";

// GET — 最新後台通知（免帶已讀狀態；已讀由前端 localStorage 判定）。
// 存取權由 middleware 對 /api/sheets/* 的登入守門控制。
export async function GET(request: Request) {
  // route 層再驗一次身分。middleware 已經把這條路徑限制在 admin，這裡是第二道鎖：
  // /api/sheets 底下多數端點原本只靠 middleware 那一道門，而 Next.js 近期就有三個
  // middleware bypass 的公告——一道門倒了不該等於全部資料大開（2026-10-15 弱點分析）。
  const guard = await requireAdmin(request);
  if (guard.denied) return guard.denied;


  const items = await listRecentNotifications(30);
  return NextResponse.json({ ok: true, items });
}
