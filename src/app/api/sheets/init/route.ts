import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";

const SHEET_DEFINITIONS = [
  {
    title: "材質資料庫",
    headers: ["編號", "品牌", "系列", "色號", "色名", "分類", "進價/才", "牌價/才", "供應商", "門幅cm", "最低訂量", "交期天", "庫存狀態", "特殊功能", "備註", "啟用", "建立日期", "更新日期"],
  },
  {
    title: "工資表",
    headers: ["作法代碼", "作法名稱", "說明", "最低才數", "基準厚度", "基準工資/才", "每半吋加價", "可選厚度"],
  },
  {
    title: "報價紀錄",
    headers: ["報價單號", "報價日期", "客戶名稱", "聯絡人", "電話", "案場名稱", "案場地址", "通路", "稅前合計", "稅額", "含稅合計", "佣金模式", "返佣比例%", "返佣金額", "狀態", "建立者", "備註", "建立時間", "更新時間", "clientId"],
  },
  {
    title: "報價明細",
    headers: ["報價單號", "項次", "商品名稱", "作法", "寬cm", "高cm", "才數", "泡棉厚度", "材質編號", "材質描述", "數量", "工資/才", "面料/才", "加工項目", "單價", "每片價", "小計", "備註"],
  },
  {
    title: "報價變更紀錄",
    headers: ["quoteId", "revision", "timestamp", "changeType", "snapshot"],
  },
  {
    title: "系統設定",
    headers: ["設定項", "設定值"],
  },
  {
    title: "客戶資料庫",
    headers: ["編號", "公司名稱", "簡稱", "客戶類型", "通路", "聯絡人", "電話", "備用電話", "LINE", "Email", "地址", "統一編號", "佣金模式", "返佣比例%", "付款條件", "預設備註", "啟用", "建立日期", "更新日期", "內部備註"],
  },
];

const DEFAULT_SETTINGS_ROWS = [
  ["quality_premium", "10"],
  ["default_waste_rate", "15"],
  ["wholesale_multiplier", "1.4"],
  ["designer_multiplier", "2"],
  ["retail_multiplier", "2.8"],
  ["luxury_retail_multiplier", "3.2"],
  ["tax_rate", "5"],
  ["commission_mode", "price_gap"],
  ["commission_rate", "12"],
  ["quote_validity_days", "30"],
  ["company_name", "馬鈴薯沙發"],
  ["company_phone", "(02)8262-9396"],
  ["company_address", ""],
  ["company_line", ""],
  ["company_fax", "(02)8262-8182"],
  ["company_tax_id", "85164778"],
  ["company_contact", "周春懋"],
  ["company_full_name", "馬鈴薯沙發企業社"],
];

const DEFAULT_LABOR_ROWS = [
  ["flat", "平貼", "不貼合泡棉，直接平裱。", "1", "", "60", "0", ""],
  ["single_headboard", "單面床頭板", "有木板，基本 3 才。", "3", "1", "100", "15", "1,1.5,2,2.5,3"],
  ["removable_headboard", "活動床頭板", "可拆式板件，基本 3 才。", "3", "1", "155", "20", "1,1.5,2,2.5,3"],
  ["single_daybed", "單面臥榻", "有木板，基本 3 才。", "3", "2", "180", "20", "2,2.5,3"],
  ["double_daybed", "雙面臥榻", "雙面包覆，基本 4 才。", "4", "2", "210", "20", "2,2.5,3"],
];

export async function POST() {
  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 環境變數未設定" }, { status: 503 });
  }

  try {
    const existing = await client.sheets.spreadsheets.get({ spreadsheetId: client.spreadsheetId });
    const existingTitles = (existing.data.sheets ?? []).map((s) => s.properties?.title).filter(Boolean);

    const sheetsToCreate = SHEET_DEFINITIONS.filter((def) => !existingTitles.includes(def.title));

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

    for (const def of SHEET_DEFINITIONS) {
      await client.sheets.spreadsheets.values.update({
        spreadsheetId: client.spreadsheetId,
        range: `${def.title}!A1`,
        valueInputOption: "RAW",
        requestBody: { values: [def.headers] },
      });

      if (def.title === "系統設定") {
        await client.sheets.spreadsheets.values.update({
          spreadsheetId: client.spreadsheetId,
          range: `${def.title}!A2`,
          valueInputOption: "RAW",
          requestBody: { values: DEFAULT_SETTINGS_ROWS },
        });
      }

      if (def.title === "工資表") {
        await client.sheets.spreadsheets.values.update({
          spreadsheetId: client.spreadsheetId,
          range: `${def.title}!A2`,
          valueInputOption: "RAW",
          requestBody: { values: DEFAULT_LABOR_ROWS },
        });
      }
    }

    return NextResponse.json({
      ok: true,
      created: sheetsToCreate.map((s) => s.title),
      existing: existingTitles,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
