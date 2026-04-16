import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";

const SHEET = "採購單";

const NEW_HEADER = [
  "採購單號",
  "採購日期",
  "廠商編號",
  "案件編號",
  "案件名稱快照",
  "廠商快照JSON",
  "小計",
  "運費",
  "稅額",
  "合計金額",
  "附註",
  "狀態",
  "交貨地址",
  "到貨日期",
  "建立時間",
  "更新時間",
];

/**
 * 一次性遷移: 把舊的 14 欄列轉成新的 16 欄
 *
 * GET  ?mode=preview  → 不寫入,只回統計
 * POST ?mode=commit   → 實際寫回 Sheet
 */
export async function GET() {
  return runMigration("preview");
}

export async function POST() {
  return runMigration("commit");
}

async function runMigration(mode: "preview" | "commit") {
  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "no sheets" }, { status: 503 });
  }

  try {
    const res = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: `${SHEET}!A1:P`,
    });
    const rows = res.data.values ?? [];
    if (rows.length === 0) {
      return NextResponse.json({ ok: false, error: "空表" }, { status: 400 });
    }

    const header = rows[0] ?? [];
    const body = rows.slice(1);

    const legacyRows: number[] = []; // 1-based 行號
    const newRows: number[] = [];
    const migrated: string[][] = [];

    body.forEach((row, idx) => {
      const lineNo = idx + 2;
      // 判斷:長度 <= 14,或 col D (index 3) 是 JSON 開頭
      const isLegacy =
        row.length <= 14 || (row[3] ?? "").toString().trim().startsWith("{");

      if (isLegacy) {
        legacyRows.push(lineNo);
        // 在 index 3 (D) 之前插入兩個空字串 (案件編號, 案件名稱快照)
        const padded = [
          row[0] ?? "", // A 採購單號
          row[1] ?? "", // B 採購日期
          row[2] ?? "", // C 廠商編號
          "", // D 案件編號 (新)
          "", // E 案件名稱快照 (新)
          row[3] ?? "", // F 廠商快照JSON (原 D)
          row[4] ?? "", // G 小計 (原 E)
          row[5] ?? "", // H 運費 (原 F)
          row[6] ?? "", // I 稅額 (原 G)
          row[7] ?? "", // J 合計金額 (原 H)
          row[8] ?? "", // K 附註 (原 I)
          row[9] ?? "", // L 狀態 (原 J)
          row[10] ?? "", // M 交貨地址 (原 K)
          row[11] ?? "", // N 到貨日期 (原 L)
          row[12] ?? "", // O 建立時間 (原 M)
          row[13] ?? "", // P 更新時間 (原 N)
        ];
        migrated.push(padded);
      } else {
        newRows.push(lineNo);
        // 補齊到 16 欄 (有些可能只有 15)
        const padded = Array.from({ length: 16 }, (_, i) => row[i] ?? "");
        migrated.push(padded);
      }
    });

    const stats = {
      totalRows: body.length,
      legacyRows: legacyRows.length,
      newRows: newRows.length,
      currentHeaderCount: header.length,
      sampleLegacyLineNos: legacyRows.slice(0, 5),
      sampleNewLineNos: newRows.slice(0, 5),
    };

    if (mode === "preview") {
      return NextResponse.json({
        ok: true,
        mode: "preview",
        stats,
        sampleMigratedRow: migrated[0],
        message: `將把 ${legacyRows.length} 列從 14 欄遷移到 16 欄,header 同步更新。POST 同 endpoint 執行。`,
      });
    }

    // commit: 清空整個 A:P 然後重寫 header + 全部 body
    await client.sheets.spreadsheets.values.clear({
      spreadsheetId: client.spreadsheetId,
      range: `${SHEET}!A:P`,
    });

    await client.sheets.spreadsheets.values.update({
      spreadsheetId: client.spreadsheetId,
      range: `${SHEET}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [NEW_HEADER, ...migrated] },
    });

    return NextResponse.json({
      ok: true,
      mode: "commit",
      stats,
      message: `已遷移 ${legacyRows.length} 列,寫入 ${migrated.length} 列 + 新 header (16 欄)`,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "fail" },
      { status: 500 },
    );
  }
}
