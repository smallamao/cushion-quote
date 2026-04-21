import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import {
  getQuoteRows,
  getVersionRows,
  quoteRowToRecord,
  versionRecordToRow,
  versionRowToRecord,
} from "../_v2-utils";

/**
 * 回填腳本：為既有版本記錄填充 quoteNameSnapshot
 *
 * 用途：
 *   遷移後既有的版本記錄 quoteNameSnapshot 欄位為空
 *   此腳本會從 QuotePlanRecord 讀取 quoteName 並回填到版本記錄
 *
 * GET  = 預覽需要回填的記錄數量
 * POST = 執行回填操作
 */

export async function GET() {
  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const versionRows = await getVersionRows(client);
    const versions = versionRows.map(versionRowToRecord);

    // 統計需要回填的記錄（quoteNameSnapshot 為空的）
    const needsBackfill = versions.filter((v) => !v.quoteNameSnapshot);
    const alreadyFilled = versions.filter((v) => v.quoteNameSnapshot);

    return NextResponse.json({
      ok: true,
      mode: "preview",
      total: versions.length,
      needsBackfill: needsBackfill.length,
      alreadyFilled: alreadyFilled.length,
      sampleEmptyVersions: needsBackfill.slice(0, 5).map((v) => ({
        versionId: v.versionId,
        quoteId: v.quoteId,
        projectName: v.projectNameSnapshot,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST() {
  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    // 讀取所有版本和報價記錄
    const [versionRows, quoteRows] = await Promise.all([
      getVersionRows(client),
      getQuoteRows(client),
    ]);

    const versions = versionRows.map(versionRowToRecord);
    const quotes = quoteRows.map(quoteRowToRecord);

    // 建立 quoteId -> quoteName 映射
    const quoteNameMap = new Map<string, string>();
    quotes.forEach((quote) => {
      quoteNameMap.set(quote.quoteId, quote.quoteName);
    });

    // 找出需要回填的版本（quoteNameSnapshot 為空）
    const toUpdate = versions
      .map((version, index) => ({ version, rowIndex: index }))
      .filter(({ version }) => !version.quoteNameSnapshot);

    if (toUpdate.length === 0) {
      return NextResponse.json({
        ok: true,
        mode: "no_action_needed",
        message: "所有版本記錄的方案名稱都已填充，無需回填",
        updated: 0,
      });
    }

    // 批次更新
    const updatePromises = toUpdate.map(async ({ version, rowIndex }) => {
      const quoteName = quoteNameMap.get(version.quoteId) || "";
      const updatedVersion = {
        ...version,
        quoteNameSnapshot: quoteName,
      };

      const sheetRow = rowIndex + 2; // +2 because: 1-indexed + header row
      await client.sheets.spreadsheets.values.update({
        spreadsheetId: client.spreadsheetId,
        range: `報價版本!A${sheetRow}:AU${sheetRow}`,
        valueInputOption: "RAW",
        requestBody: { values: [versionRecordToRow(updatedVersion)] },
      });

      return { versionId: version.versionId, quoteName };
    });

    const results = await Promise.all(updatePromises);

    return NextResponse.json({
      ok: true,
      mode: "backfilled",
      message: `成功回填 ${results.length} 筆版本記錄的方案名稱`,
      updated: results.length,
      samples: results.slice(0, 10).map((r) => ({
        versionId: r.versionId,
        filledWith: r.quoteName,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
