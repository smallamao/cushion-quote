import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";

const ORDER_SHEET = "採購單";
const ORDER_RANGE = `${ORDER_SHEET}!A2:P`;

interface TrendPoint {
  month: string; // YYYY-MM
  totalAmount: number;
  orderCount: number;
}

function normalizeMonth(raw: string): string {
  if (!raw) return "";
  const m = raw
    .trim()
    .replaceAll("/", "-")
    .match(/^(\d{4})-(\d{1,2})/);
  if (!m) return "";
  return `${m[1]}-${m[2].padStart(2, "0")}`;
}

function priorMonths(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(
      `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}`,
    );
  }
  return out;
}

/**
 * 回傳過去 N 個月(含本月)的採購金額與張數趨勢。
 * 只掃 採購單 表格,不需讀 明細,速度快。
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const n = Math.min(Math.max(Number(searchParams.get("months") ?? 6), 1), 24);

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json(
      { ok: false, error: "Google Sheets 未設定" },
      { status: 503 },
    );
  }

  try {
    const res = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: ORDER_RANGE,
    });
    const rows = res.data.values ?? [];

    const points = new Map<string, TrendPoint>();
    for (const m of priorMonths(n)) {
      points.set(m, { month: m, totalAmount: 0, orderCount: 0 });
    }

    for (const row of rows) {
      const isLegacy = row.length <= 14 || (row[3] ?? "").trim().startsWith("{");
      const orderId = row[0] ?? "";
      if (!orderId) continue;
      const month = normalizeMonth(row[1] ?? "");
      if (!month || !points.has(month)) continue;
      const status = row[isLegacy ? 9 : 11] ?? "draft";
      if (status === "cancelled") continue;
      // 合計金額: 舊格式在 col 7, 新格式在 col 9 (index 0-based)
      const totalAmount = Number(row[isLegacy ? 7 : 9] ?? 0) || 0;

      const entry = points.get(month);
      if (entry) {
        entry.totalAmount += totalAmount;
        entry.orderCount += 1;
      }
    }

    return NextResponse.json({
      ok: true,
      points: Array.from(points.values()),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "載入趨勢失敗";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
