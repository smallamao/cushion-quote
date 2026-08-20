import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import { parsePosBasePrices, parsePosAdjRates } from "@/lib/pos-pricing-engine";

// GET 不讀 request → Next 會在建置時靜態化、永遠回舊快照（範本存了看不到的根因）
export const dynamic = "force-dynamic";

export async function GET() {
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
