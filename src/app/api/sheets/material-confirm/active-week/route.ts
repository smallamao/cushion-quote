/**
 * GET /api/sheets/material-confirm/active-week
 * 回「現在該處理哪一週」——最早一個還沒全部確認完的生產週。
 *
 * 🔴 為什麼不用推算：原本預設「往後數第 N 個週一」，但叫料提前天數會浮動
 * （實際落在生產週前 11~14 天），老闆 2026-09-30 打開時停在 10/19，
 * 而他正在處理的是 10/12，滿畫面紅字完全看不懂。
 * 改成看實際資料：哪一週還有沒確認完的，就開那一週。
 */
import { NextResponse } from "next/server";

import { listConfirms } from "@/lib/material-confirm-sheet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 客人那關已經過了的狀態（司機還沒排不算沒處理完）。 */
const CUSTOMER_DONE = new Set(["confirmed", "scheduled", "driver_rejected"]);

export async function GET() {
  let rows: Awaited<ReturnType<typeof listConfirms>> = [];
  try {
    rows = await listConfirms();
  } catch {
    return NextResponse.json({ ok: true, weekKey: "" });
  }

  const byWeek = new Map<string, { total: number; pending: number }>();
  for (const { confirm } of rows) {
    const wk = confirm.weekKey;
    if (!wk) continue;
    const cur = byWeek.get(wk) ?? { total: 0, pending: 0 };
    cur.total += 1;
    if (!CUSTOMER_DONE.has(confirm.status)) cur.pending += 1;
    byWeek.set(wk, cur);
  }

  // 最早一個還有未確認的週；全部確認完就回空，讓前端用推算的預設值
  const pending = [...byWeek.entries()]
    .filter(([, v]) => v.pending > 0)
    .sort((a, b) => a[0].localeCompare(b[0]));

  return NextResponse.json({
    ok: true,
    weekKey: pending[0]?.[0] ?? "",
    pendingCount: pending[0]?.[1].pending ?? 0,
    weeks: [...byWeek.entries()].sort().map(([k, v]) => ({ weekKey: k, ...v })),
  });
}
