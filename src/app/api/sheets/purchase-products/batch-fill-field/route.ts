import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";

const SHEET = "採購商品";
const UPDATED_AT_COLUMN = "M";

/**
 * field → column 對照。需要擴充時加進來即可。
 */
const FIELD_COLUMN: Record<string, string> = {
  supplierProductCode: "O", // 廠商原碼
  productName: "C", // 商品名稱
  notes: "J", // 備註
  isActive: "K", // 啟用
};

type Source = "productCode" | "specification" | "fixed";

interface BatchFillRequest {
  productIds: string[];
  field: keyof typeof FIELD_COLUMN;
  source: Source;
  /** source=fixed 時用;其他 source 忽略 */
  value?: string;
}

export async function POST(request: Request) {
  // 🔒 停用中（2026-10-15）：本檔的欄位對應是錯的——更新時間常數指向 M 欄（品牌），
  // 批量改價更會把新價格寫進 H 欄（廠商編號），導致商品永久失去廠商且無法復原。
  // 線上資料已確認至今未被觸發（廠商編號無一筆為數字、品牌欄 878 筆全空）。
  // 修正欄位對應並以一筆測試商品驗證寫入位置後，才可把這個旗標改回 false。
  // 型別刻意標成 boolean 而非字面值 true：否則後面的程式會被判定為無法執行，
  // 型別推斷連帶失效。
  const DISABLED: boolean = true;
  if (DISABLED) {
    return NextResponse.json(
      { ok: false, error: "此批次功能已暫時停用（欄位對應錯誤修正中）" },
      { status: 503 },
    );
  }

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json(
      { ok: false, error: "Google Sheets 未設定" },
      { status: 503 },
    );
  }

  let body: BatchFillRequest;
  try {
    body = (await request.json()) as BatchFillRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "請求格式錯誤" }, { status: 400 });
  }

  const ids = Array.from(new Set(body.productIds ?? []));
  if (ids.length === 0) {
    return NextResponse.json({ ok: false, error: "未選擇任何商品" }, { status: 400 });
  }
  if (ids.length > 500) {
    return NextResponse.json(
      { ok: false, error: "單次最多更新 500 筆" },
      { status: 400 },
    );
  }

  const targetColumn = FIELD_COLUMN[body.field];
  if (!targetColumn) {
    return NextResponse.json(
      { ok: false, error: `不支援的欄位: ${body.field}` },
      { status: 400 },
    );
  }

  const source = body.source;
  if (!["productCode", "specification", "fixed"].includes(source)) {
    return NextResponse.json({ ok: false, error: "source 參數錯誤" }, { status: 400 });
  }

  try {
    const response = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: `${SHEET}!A2:O`,
    });

    const rows = response.data.values ?? [];
    const idSet = new Set(ids);
    const updates: Array<{ rowIndex: number; newValue: string }> = [];

    rows.forEach((row, idx) => {
      const id = row[0];
      if (!id || !idSet.has(id)) return;
      const productCode = row[1] ?? "";
      const specification = row[3] ?? "";
      const newValue =
        source === "productCode"
          ? productCode
          : source === "specification"
            ? specification
            : (body.value ?? "").trim();
      updates.push({ rowIndex: idx + 2, newValue });
    });

    if (updates.length === 0) {
      return NextResponse.json({ ok: false, error: "找不到任何符合的商品" }, { status: 404 });
    }

    const now = new Date().toISOString().slice(0, 10);
    const data = [
      ...updates.map((u) => ({
        range: `${SHEET}!${targetColumn}${u.rowIndex}`,
        values: [[u.newValue]],
      })),
      ...updates.map((u) => ({
        range: `${SHEET}!${UPDATED_AT_COLUMN}${u.rowIndex}`,
        values: [[now]],
      })),
    ];

    await client.sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: client.spreadsheetId,
      requestBody: { data, valueInputOption: "RAW" },
    });

    return NextResponse.json({ ok: true, updatedCount: updates.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "批次填值失敗";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
