#!/usr/bin/env node
/**
 * 一次性:匯入設備型錄資料到 Google Sheets
 * 用法: node --env-file=.env.local scripts/seed-equipment.mjs
 */
import { google } from "googleapis";

const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
const keyRaw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
if (!spreadsheetId || !keyRaw) {
  console.error("缺少 GOOGLE_SHEETS_SPREADSHEET_ID 或 GOOGLE_SERVICE_ACCOUNT_KEY");
  process.exit(1);
}
const creds = JSON.parse(keyRaw);

// 來源資料 (從使用者貼的表格轉換)
// Ragic 有 4 欄: 編號 / 狀態 / 名稱 / 種類
// 我們的 schema 只有: modelCode / modelName / category / notes / isActive
// 「在庫」統一視為 isActive=true,"設備狀態" 存進 notes 備用
const EQUIPMENT = [
  { code: "00023", name: "長型43x63公分置物椅", category: "型錄傢俱" },
  { code: "FURNITURE", name: "型錄傢俱", category: "型錄傢俱" },
  { code: "HAILY", name: "海力", category: "沙發" },
  { code: "MULE", name: "沐樂", category: "沙發" },
  { code: "LEMON", name: "雷夢", category: "沙發" },
  { code: "AMI", name: "愛馬仕", category: "沙發" },
  { code: "OBA", name: "歐巴", category: "沙發" },
  { code: "BOOM", name: "爆發力", category: "沙發" },
  { code: "FLA", name: "引爆點", category: "沙發" },
  { code: "JIMMY", name: "吉米", category: "沙發" },
  { code: "MIKO", name: "米可", category: "沙發" },
  { code: "ICE", name: "艾斯", category: "沙發" },
  { code: "BSK", name: "巴斯克", category: "沙發" },
  { code: "EDSON", name: "安德森", category: "沙發" },
  { code: "BJ", name: "伯爵", category: "沙發" },
  { code: "BLT", name: "安格斯", category: "沙發" },
  { code: "POINT", name: "轉捩點", category: "沙發" },
  { code: "ELEC", name: "高壓電", category: "沙發" },
  { code: "LEO", name: "里歐", category: "沙發" },
  { code: "GALI", name: "咖哩", category: "沙發" },
];

const SHEET = "設備型錄";
const RANGE_DATA = `${SHEET}!A2:G`;
const RANGE_FULL = `${SHEET}!A:G`;

async function main() {
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
    ],
  });
  const sheets = google.sheets({ version: "v4", auth });

  // 讀現有資料,避免重複
  const existingRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: RANGE_DATA,
  });
  const existingCodes = new Set(
    (existingRes.data.values ?? []).map((r) => r[0]).filter(Boolean),
  );

  const toInsert = EQUIPMENT.filter((e) => !existingCodes.has(e.code));
  const skipped = EQUIPMENT.length - toInsert.length;

  if (toInsert.length === 0) {
    console.log(`所有 ${EQUIPMENT.length} 筆都已存在,沒有需要寫入的。`);
    return;
  }

  const now = new Date().toISOString();
  const rows = toInsert.map((e) => [
    e.code,
    e.name,
    e.category,
    "", // notes
    "TRUE", // isActive
    now,
    now,
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: RANGE_FULL,
    valueInputOption: "RAW",
    requestBody: { values: rows },
  });

  console.log(`✅ 成功寫入 ${toInsert.length} 筆設備型錄 (跳過 ${skipped} 筆已存在)`);
  for (const e of toInsert) {
    console.log(`  + ${e.code.padEnd(12)} ${e.name}`);
  }
}

main().catch((err) => {
  console.error("❌ 失敗:", err.message);
  process.exit(1);
});
