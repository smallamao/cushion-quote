import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/api-auth";
import { listConfirms } from "@/lib/material-confirm-sheet";
import { buildOtdByWeek, type OtdOrder } from "@/lib/otd";
import { toTaipeiYmd } from "@/lib/trello-server";

/**
 * 交期達成率（OTD）：按生產週統計「承諾區間內交付」的比例。
 *
 * 承諾區間來自 productionWindow(生產週)，也就是已經寫進客人訊息的
 * 「【X/X ～ X/X 製作完成】」那個迄日——是對外承諾，不是內部估算。
 *
 * 🔴 計算刻意把「未交付但區間已過」算成逾期（見 lib/otd.ts 的註解）。
 *    只看已交付的單會系統性高估：2026-11-10 實測，同一批資料
 *    錯算法畫出 45%→60%→88%→100% 的假改善，真實是 33%→60%→64%。
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = await requireAdmin(request);
  if (guard.denied) return guard.denied;

  try {
    const confirms = await listConfirms();
    const orders: OtdOrder[] = confirms.map(({ confirm }) => ({
      orderNumber: confirm.orderNumber,
      customerName: confirm.customerName,
      weekKey: confirm.weekKey,
      chosenDate: confirm.chosenDate,
      status: confirm.status,
    }));

    // 台灣時區的今天。伺服器跑在 UTC，用本地時間會跨日偏一天。
    const today = toTaipeiYmd(new Date().toISOString());
    const weeks = buildOtdByWeek(orders, today);

    // 整體只採計「已判定完畢」的週——還在進行中的週會把數字拉高
    const settled = weeks.filter((w) => w.complete && w.judged > 0);
    const onTime = settled.reduce((s, w) => s + w.onTime, 0);
    const judged = settled.reduce((s, w) => s + w.judged, 0);

    return NextResponse.json({
      ok: true,
      today,
      weeks,
      overall: {
        onTime,
        judged,
        rate: judged > 0 ? Math.round((onTime / judged) * 100) : null,
        settledWeeks: settled.length,
        inFlightWeeks: weeks.length - settled.length,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "讀取失敗";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
