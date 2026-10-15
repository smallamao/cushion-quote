import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/api-auth";

import { getSheetsClient } from "@/lib/sheets-client";

const SHEET = "採購商品";
const UPDATED_AT_COLUMN = "M";

// 採購商品欄序: A id B 商品編號 C 商品名稱 D 規格 E 分類 F 單位 G 廠商編號
//             H 進價 I 圖片URL J 備註 K 啟用 L 建立時間 M 更新時間 N 牌價 O 廠商原碼
const COL = {
  productCode: "B",
  specification: "D",
  supplierProductCode: "O",
} as const;

const COL_INDEX = {
  productCode: 1,
  specification: 3,
  supplierProductCode: 14,
} as const;

type SwapKind = "code-supplier" | "code-spec";

interface BatchSwapRequest {
  productIds: string[];
  swap: SwapKind;
}

export async function POST(request: Request) {
  // route 層再驗一次身分。middleware 已經把這條路徑限制在 admin，這裡是第二道鎖：
  // /api/sheets 底下多數端點原本只靠 middleware 那一道門，而 Next.js 近期就有三個
  // middleware bypass 的公告——一道門倒了不該等於全部資料大開（2026-10-15 弱點分析）。
  const guard = requireAdmin(request);
  if (guard.denied) return guard.denied;


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

  let body: BatchSwapRequest;
  try {
    body = (await request.json()) as BatchSwapRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "請求格式錯誤" }, { status: 400 });
  }

  const ids = Array.from(new Set(body.productIds ?? []));
  if (ids.length === 0) {
    return NextResponse.json({ ok: false, error: "未選擇任何商品" }, { status: 400 });
  }
  if (ids.length > 500) {
    return NextResponse.json({ ok: false, error: "單次最多 500 筆" }, { status: 400 });
  }
  if (body.swap !== "code-supplier" && body.swap !== "code-spec") {
    return NextResponse.json({ ok: false, error: "swap 參數錯誤" }, { status: 400 });
  }

  try {
    const res = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: `${SHEET}!A2:O`,
    });
    const rows = res.data.values ?? [];

    const idSet = new Set(ids);
    const data: Array<{ range: string; values: string[][] }> = [];
    const now = new Date().toISOString().slice(0, 10);
    let updatedCount = 0;

    rows.forEach((row, idx) => {
      const id = row[0];
      if (!id || !idSet.has(id)) return;
      const sheetRow = idx + 2;

      const productCode = row[COL_INDEX.productCode] ?? "";
      const specification = row[COL_INDEX.specification] ?? "";
      const supplierProductCode = row[COL_INDEX.supplierProductCode] ?? "";

      if (body.swap === "code-supplier") {
        // 對調 商品編號 ↔ 廠商原碼
        data.push({
          range: `${SHEET}!${COL.productCode}${sheetRow}`,
          values: [[supplierProductCode]],
        });
        data.push({
          range: `${SHEET}!${COL.supplierProductCode}${sheetRow}`,
          values: [[productCode]],
        });
      } else {
        // 對調 商品編號 ↔ 規格
        data.push({
          range: `${SHEET}!${COL.productCode}${sheetRow}`,
          values: [[specification]],
        });
        data.push({
          range: `${SHEET}!${COL.specification}${sheetRow}`,
          values: [[productCode]],
        });
      }
      data.push({
        range: `${SHEET}!${UPDATED_AT_COLUMN}${sheetRow}`,
        values: [[now]],
      });
      updatedCount += 1;
    });

    if (updatedCount === 0) {
      return NextResponse.json(
        { ok: false, error: "找不到任何符合的商品" },
        { status: 404 },
      );
    }

    await client.sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: client.spreadsheetId,
      requestBody: { data, valueInputOption: "RAW" },
    });

    return NextResponse.json({ ok: true, updatedCount });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "對調失敗";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
