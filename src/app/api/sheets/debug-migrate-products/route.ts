import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";

const SHEET = "採購商品";

const NEW_HEADER = [
  "ID",            // A
  "商品編號",       // B
  "商品名稱",       // C
  "規格",          // D
  "分類",          // E
  "單位",          // F
  "廠商編號",       // G
  "進價",          // H (本來叫「單價」,語意改為進價)
  "圖片URL",       // I
  "備註",          // J
  "啟用",          // K
  "建立時間",       // L
  "更新時間",       // M
  "牌價",          // N
  "廠商原碼",       // O
];

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
      range: `${SHEET}!A1:O`,
    });
    const rows = res.data.values ?? [];
    if (rows.length === 0) {
      return NextResponse.json({ ok: false, error: "空表" }, { status: 400 });
    }

    const header = rows[0] ?? [];
    const body = rows.slice(1);

    // 統計列長度分佈
    const lengthCounts: Record<number, number> = {};
    body.forEach((r) => {
      const len = r.length;
      lengthCounts[len] = (lengthCounts[len] ?? 0) + 1;
    });

    // 補齊每列到 15 欄 (右側補空字串)
    const migrated = body.map((row) => {
      return Array.from({ length: 15 }, (_, i) => row[i] ?? "");
    });

    const stats = {
      totalRows: body.length,
      currentHeaderCount: header.length,
      newHeaderCount: NEW_HEADER.length,
      lengthDistribution: lengthCounts,
    };

    if (mode === "preview") {
      return NextResponse.json({
        ok: true,
        mode: "preview",
        stats,
        sampleMigratedRow: migrated[0],
        message: `將補齊 ${body.length} 列到 15 欄,header 同步更新為 15 欄`,
      });
    }

    await client.sheets.spreadsheets.values.clear({
      spreadsheetId: client.spreadsheetId,
      range: `${SHEET}!A:O`,
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
      message: `已寫入 ${migrated.length} 列 + 新 header (15 欄)`,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "fail" },
      { status: 500 },
    );
  }
}
