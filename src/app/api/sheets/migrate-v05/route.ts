import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";

/**
 * v0.5 遷移腳本：新增採購系統的 4 個分頁
 *
 * 新增分頁：
 *   1. 廠商 (Suppliers)
 *   2. 採購商品 (PurchaseProducts)
 *   3. 採購單 (PurchaseOrders)
 *   4. 採購單明細 (PurchaseOrderItems)
 *
 * 同時新增系統設定：
 *   - factory_address: 工廠地址（預設交貨地址）
 *   - purchase_order_prefix: 採購單號前綴（預設 PS）
 *
 * 冪等設計：
 *   - 檢查每個分頁是否已存在
 *   - 檢查系統設定是否已存在
 *   - 已存在則跳過
 *
 * POST = 執行遷移
 * GET  = 預覽遷移狀態
 */

const NEW_SHEETS = [
  {
    title: "廠商",
    headers: [
      "廠商編號",
      "名稱",
      "簡稱",
      "聯絡人",
      "電話",
      "手機",
      "傳真",
      "Email",
      "統一編號",
      "地址",
      "付款方式",
      "付款條件",
      "備註",
      "啟用",
      "建立時間",
      "更新時間",
    ],
  },
  {
    title: "採購商品",
    headers: [
      "ID",
      "商品編號",
      "商品名稱",
      "規格",
      "分類",
      "單位",
      "廠商編號",
      "單價",
      "圖片URL",
      "備註",
      "啟用",
      "建立時間",
      "更新時間",
    ],
  },
  {
    title: "採購單",
    headers: [
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
    ],
  },
  {
    title: "採購單明細",
    headers: [
      "明細ID",
      "採購單號",
      "項次",
      "商品ID",
      "商品快照JSON",
      "數量",
      "實收數量",
      "單價",
      "金額",
      "備註",
    ],
  },
];

const NEW_SETTINGS: Array<[string, string]> = [
  ["factory_address", "236新北市土城區廣福街77巷6-6號"],
  ["purchase_order_prefix", "PS"],
];

const SETTINGS_SHEET = "系統設定";

export async function GET() {
  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const existing = await client.sheets.spreadsheets.get({
      spreadsheetId: client.spreadsheetId,
    });
    const existingTitles = (existing.data.sheets ?? [])
      .map((s) => s.properties?.title)
      .filter((t): t is string => Boolean(t));

    const sheetsToCreate = NEW_SHEETS.filter((def) => !existingTitles.includes(def.title));
    const sheetsAlreadyExist = NEW_SHEETS.filter((def) => existingTitles.includes(def.title));

    // Check existing settings
    const settingsRes = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: `${SETTINGS_SHEET}!A:B`,
    });
    const existingSettingKeys = new Set(
      (settingsRes.data.values ?? [])
        .slice(1)
        .map((row) => String(row[0] ?? ""))
        .filter(Boolean)
    );
    const settingsToAdd = NEW_SETTINGS.filter(([key]) => !existingSettingKeys.has(key));

    return NextResponse.json({
      ok: true,
      mode: "preview",
      sheetsToCreate: sheetsToCreate.map((s) => s.title),
      sheetsAlreadyExist: sheetsAlreadyExist.map((s) => s.title),
      settingsToAdd: settingsToAdd.map(([k]) => k),
      alreadyMigrated: sheetsToCreate.length === 0 && settingsToAdd.length === 0,
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
    const existing = await client.sheets.spreadsheets.get({
      spreadsheetId: client.spreadsheetId,
    });
    const existingTitles = (existing.data.sheets ?? [])
      .map((s) => s.properties?.title)
      .filter((t): t is string => Boolean(t));

    const sheetsToCreate = NEW_SHEETS.filter((def) => !existingTitles.includes(def.title));

    // Create missing sheets in batch
    if (sheetsToCreate.length > 0) {
      await client.sheets.spreadsheets.batchUpdate({
        spreadsheetId: client.spreadsheetId,
        requestBody: {
          requests: sheetsToCreate.map((def) => ({
            addSheet: { properties: { title: def.title } },
          })),
        },
      });
    }

    // Write headers to all NEW sheets (only newly created ones to avoid overwriting data)
    for (const def of sheetsToCreate) {
      await client.sheets.spreadsheets.values.update({
        spreadsheetId: client.spreadsheetId,
        range: `${def.title}!A1`,
        valueInputOption: "RAW",
        requestBody: { values: [def.headers] },
      });
    }

    // Add new settings (append, don't overwrite existing)
    const settingsRes = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: `${SETTINGS_SHEET}!A:B`,
    });
    const existingSettingKeys = new Set(
      (settingsRes.data.values ?? [])
        .slice(1)
        .map((row) => String(row[0] ?? ""))
        .filter(Boolean)
    );
    const settingsToAdd = NEW_SETTINGS.filter(([key]) => !existingSettingKeys.has(key));

    if (settingsToAdd.length > 0) {
      await client.sheets.spreadsheets.values.append({
        spreadsheetId: client.spreadsheetId,
        range: `${SETTINGS_SHEET}!A:B`,
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: settingsToAdd },
      });
    }

    return NextResponse.json({
      ok: true,
      mode: "migrated",
      message: `已建立 ${sheetsToCreate.length} 個採購系統分頁，新增 ${settingsToAdd.length} 個設定`,
      sheetsCreated: sheetsToCreate.map((s) => s.title),
      settingsAdded: settingsToAdd.map(([k]) => k),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
