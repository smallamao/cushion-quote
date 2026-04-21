import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";

/**
 * v12: add 結帳方式 (billingType) column to 客戶資料庫.
 *
 * Old schema: 17 cols (A:Q)
 * New schema: 18 cols (A:R), where R = "結帳方式" with values
 *   "per_quote" (default, create AR per accepted quote)
 *   "monthly"   (skip auto AR, use monthly statement instead)
 *
 * Existing rows get their R column initialized to "per_quote" so
 * nothing changes behavior for current clients until admin flips
 * individual accounts to "monthly".
 */

export async function GET() {
  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json(
      { ok: false, error: "Google Sheets 未設定" },
      { status: 503 },
    );
  }

  try {
    const meta = await client.sheets.spreadsheets.get({
      spreadsheetId: client.spreadsheetId,
    });

    const clientSheet = (meta.data.sheets ?? []).find(
      (s) => s.properties?.title === "客戶資料庫",
    );
    if (!clientSheet || clientSheet.properties?.sheetId == null) {
      return NextResponse.json(
        { ok: false, error: "客戶資料庫 工作表不存在" },
        { status: 404 },
      );
    }

    const sheetId = clientSheet.properties.sheetId;
    const currentCols = clientSheet.properties.gridProperties?.columnCount ?? 0;
    const requiredCols = 18;

    // Safety: refuse to run if R1 already has a header that is not
    // empty and not "結帳方式" — otherwise we would clobber legacy
    // data (e.g. 建立日期 in the old 21-column schema).
    const headerRes = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: "客戶資料庫!R1",
    });
    const currentR1 = headerRes.data.values?.[0]?.[0] ?? "";
    if (currentR1 && currentR1 !== "結帳方式") {
      return NextResponse.json(
        {
          ok: false,
          error: `偵測到 R 欄已有資料 "${currentR1}"，migration 已中止以免覆蓋。請聯絡開發者調整欄位位置。`,
          currentR1,
        },
        { status: 409 },
      );
    }

    if (currentCols < requiredCols) {
      await client.sheets.spreadsheets.batchUpdate({
        spreadsheetId: client.spreadsheetId,
        requestBody: {
          requests: [
            {
              appendDimension: {
                sheetId,
                dimension: "COLUMNS",
                length: requiredCols - currentCols,
              },
            },
          ],
        },
      });
    }

    // Write header at R1 (safe now — we verified it's empty or already "結帳方式")
    await client.sheets.spreadsheets.values.update({
      spreadsheetId: client.spreadsheetId,
      range: "客戶資料庫!R1",
      valueInputOption: "RAW",
      requestBody: { values: [["結帳方式"]] },
    });

    // Count existing data rows so we can backfill R column
    const dataRes = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: "客戶資料庫!A2:A",
    });
    const rowCount = (dataRes.data.values ?? []).length;

    let backfilled = 0;
    if (rowCount > 0) {
      // Read current R column to avoid overwriting values admin has
      // already set (e.g. someone flipping a row to "monthly" by hand).
      const existingRes = await client.sheets.spreadsheets.values.get({
        spreadsheetId: client.spreadsheetId,
        range: `客戶資料庫!R2:R${rowCount + 1}`,
      });
      const existing = existingRes.data.values ?? [];
      const values = Array.from({ length: rowCount }, (_, i) => {
        const cur = existing[i]?.[0] ?? "";
        if (cur === "per_quote" || cur === "monthly") return [cur];
        backfilled++;
        return ["per_quote"];
      });
      await client.sheets.spreadsheets.values.update({
        spreadsheetId: client.spreadsheetId,
        range: `客戶資料庫!R2:R${rowCount + 1}`,
        valueInputOption: "RAW",
        requestBody: { values },
      });
    }

    // Refresh column count so the response reflects reality (we only
    // grew the grid when currentCols < requiredCols; otherwise the
    // existing column count is preserved).
    const finalCols = Math.max(currentCols, requiredCols);

    return NextResponse.json({
      ok: true,
      previousCols: currentCols,
      finalCols,
      requiredCols,
      rowsBackfilled: backfilled,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
