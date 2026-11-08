import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/api-auth";
import { createBooking, type BookingInput } from "@/lib/notion-booking";

export const runtime = "nodejs";

/**
 * POST /api/notion/bookings —— 在 Notion「預約紀錄」新增一筆展示間參觀預約。
 *
 * 給畫面助手的「確認」按鈕用：助手只提議，使用者按下確認才走到這裡。
 * LINE 那條不經過這支（agent 直接呼叫 create_notion_booking），因為在 LINE 沒有按鈕可按。
 */
export async function POST(request: Request) {
  const guard = await requireAdmin(request);
  if (guard.denied) return guard.denied;

  let body: BookingInput;
  try {
    body = (await request.json()) as BookingInput;
  } catch {
    return NextResponse.json({ ok: false, error: "請求格式錯誤" }, { status: 400 });
  }

  try {
    const result = await createBooking(body);
    return NextResponse.json(
      { ok: result.ok, message: result.message, pageUrl: result.pageUrl },
      { status: result.ok ? 200 : 400 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
