import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/api-auth";

import { getSheetsClient } from "@/lib/sheets-client";
import { parsePosBasePrices, parsePosAdjRates } from "@/lib/pos-pricing-engine";

// GET 不讀 request → Next 會在建置時靜態化、永遠回舊快照（範本存了看不到的根因）
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // route 層再驗一次身分。middleware 已經把這條路徑限制在 admin，這裡是第二道鎖：
  // /api/sheets 底下多數端點原本只靠 middleware 那一道門，而 Next.js 近期就有三個
  // middleware bypass 的公告——一道門倒了不該等於全部資料大開（2026-10-15 弱點分析）。
  const guard = requireAdmin(request);
  if (guard.denied) return guard.denied;


  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const toStringMatrix = (values: unknown[][] | null | undefined): string[][] =>
      (values ?? []).map((row) => (row ?? []).map((cell) => String(cell ?? "")));

    const [basePricesRes, adjRatesRes] = await Promise.all([
      client.sheets.spreadsheets.values.get({
        spreadsheetId: client.spreadsheetId,
        range: "POS_底價!A1:O",
      }),
      client.sheets.spreadsheets.values.get({
        spreadsheetId: client.spreadsheetId,
        range: "POS_調整費率!A1:I",
      }),
    ]);

    const basePrices = parsePosBasePrices(toStringMatrix(basePricesRes.data.values));
    const adjRates = parsePosAdjRates(toStringMatrix(adjRatesRes.data.values));

    return NextResponse.json({ basePrices, adjRates });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
