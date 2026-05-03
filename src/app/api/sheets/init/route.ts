import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";

const SHEET_DEFINITIONS = [
  {
    title: "客戶資料庫",
    headers: ["編號", "公司名稱", "簡稱", "客戶類型", "通路", "地址", "統一編號", "佣金模式", "返佣比例%", "付款條件", "預設備註", "啟用", "建立日期", "更新日期", "內部備註", "固定佣金金額", "客戶來源", "結帳方式"],
  },
  {
    title: "聯絡人",
    headers: ["編號", "公司ID", "姓名", "角色", "電話", "備用電話", "LINE", "Email", "名片圖片", "主要聯絡人", "建立日期", "更新日期"],
  },
  {
    title: "案件",
    headers: ["案件ID", "案件名稱", "客戶ID", "客戶名稱", "聯絡人", "電話", "案件地址", "通路", "案件狀態", "立案日", "最新報價ID", "最新版本ID", "最近送出時間", "下次追蹤日", "最後追蹤時間", "成交版本ID", "失單原因", "內部備註", "建立時間", "更新時間", "案件來源", "來源細項", "來源人/介紹人", "來源備註", "出貨狀態", "物流單號", "出貨日期", "介紹公司ID", "介紹公司名稱"],
  },
  {
    title: "報價",
    headers: ["報價ID", "案件ID", "報價序號", "報價名稱", "報價類型", "範圍說明", "報價狀態", "目前版本ID", "採用版本ID", "版本數", "最近送出時間", "下次追蹤日", "排序", "內部備註", "建立時間", "更新時間"],
  },
  {
    title: "報價版本",
    headers: ["版本ID", "報價ID", "案件ID", "版本號", "來源版本ID", "版本標籤", "版本狀態", "報價日期", "送出時間", "有效期限", "追蹤天數", "下次追蹤日", "最後追蹤時間", "提醒狀態", "未稅總額", "折扣金額", "稅率", "稅額", "含稅總額", "預估成本", "預估毛利", "預估毛利率", "通路", "條款模板", "對外說明", "對外說明附圖", "內部備註", "已鎖定", "鎖定時間", "客戶名稱", "聯絡人", "電話", "案件名稱", "案件地址", "通路快照", "建立時間", "更新時間", "佣金模式", "佣金比例", "佣金金額", "固定佣金金額", "佣金分潤", "方案名稱", "已回簽", "回簽日期", "合約檔案JSON", "回簽備註"],
  },
  {
    title: "佣金結算",
    headers: ["結算ID", "報價單號", "版本ID", "案件ID", "合作方名稱", "合作方ID", "合作身份", "佣金模式", "佣金比例", "佣金金額", "結算狀態", "付款日期", "付款方式", "憑證備註", "建立時間", "更新時間"],
  },
  {
    title: "報價版本明細",
    headers: ["明細ID", "版本ID", "報價ID", "案件ID", "行號", "項目名稱", "規格說明", "材質ID", "數量", "單位", "單價", "金額", "預估單位成本", "預估成本金額", "預估毛利", "預估毛利率", "成本列", "顯示於報價單", "備註", "附圖", "建立時間", "更新時間", "規格附圖", "安裝高度等級", "板片尺寸等級", "施工加給%", "輸入模式", "整面寬度cm", "整面高度cm", "分片方向", "分片數", "才數進位模式", "自訂分片尺寸"],
  },
  {
    title: "材質資料庫",
    headers: ["編號", "品牌", "系列", "色號", "色名", "分類", "進價/才", "牌價/才", "供應商", "門幅cm", "最低訂量", "交期天", "庫存狀態", "特殊功能", "備註", "啟用", "建立日期", "更新日期"],
  },
  {
    title: "工資表",
    headers: ["作法代碼", "作法名稱", "說明", "最低才數", "基準厚度", "基準工資/才", "每半吋加價", "可選厚度"],
  },
  {
    title: "系統設定",
    headers: ["設定項", "設定值"],
  },
  {
    title: "報價範本",
    headers: ["範本ID", "範本名稱", "說明", "品項JSON", "啟用", "建立時間", "更新時間"],
  },
  {
    title: "廠商",
    headers: ["廠商編號", "名稱", "簡稱", "聯絡人", "電話", "手機", "傳真", "Email", "統一編號", "地址", "付款方式", "付款條件", "備註", "啟用", "建立時間", "更新時間"],
  },
{
    title: "採購商品",
    headers: [
      "ID",
      "商品編號",
      "廠商產品編號",
      "商品名稱",
      "規格",
      "分類",
      "單位",
      "廠商編號",
      "廠商名稱",
      "幅寬(cm)",
      "進價",
      "牌價",
      "品牌",
      "系列",
      "色號",
      "色名",
      "圖片URL",
      "備註",
      "最小訂量",
      "交期",
      "庫存狀態",
      "啟用",
      "建立時間",
      "更新時間",
    ],
  },
  {
    title: "採購單",
    headers: ["採購單號", "採購日期", "廠商編號", "案件編號", "案件名稱快照", "廠商快照JSON", "小計", "運費", "稅額", "合計金額", "附註", "狀態", "交貨地址", "到貨日期", "建立時間", "更新時間"],
  },
  {
    title: "採購單明細",
    headers: ["明細ID", "採購單號", "項次", "商品ID", "商品快照JSON", "數量", "實收數量", "單價", "金額", "備註"],
  },
  {
    title: "庫存主檔",
    headers: [
      "庫存ID",
      "商品ID",
      "廠商編號",
      "商品快照JSON",
      "目前庫存",
      "最近入庫成本",
      "最近入庫日",
      "最近異動時間",
      "備註",
      "建立時間",
      "更新時間",
    ],
  },
  {
    title: "庫存異動",
    headers: [
      "異動ID",
      "庫存ID",
      "商品ID",
      "廠商編號",
      "採購單號",
      "採購明細ID",
      "異動類型",
      "數量變化",
      "單位",
      "單位成本",
      "發生時間",
      "參考單號",
      "備註",
      "建立時間",
      "更新時間",
      "批次ID",
    ],
  },
  {
    title: "庫存批次",
    headers: [
      "批次ID",
      "庫存ID",
      "商品ID",
      "來源參考",
      "批次說明",
      "初始數量",
      "單位",
      "建立時間",
      "備註",
    ],
  },
  {
    title: "應收帳款",
    headers: [
      "應收單號",
      "建立日期",
      "案件ID",
      "案件名稱快照",
      "報價ID",
      "版本ID",
      "客戶ID",
      "客戶名稱快照",
      "聯絡人快照",
      "客戶電話快照",
      "專案名稱快照",
      "總金額",
      "已收金額",
      "未收金額",
      "分期數",
      "應收狀態",
      "有逾期",
      "最近收款日",
      "備註",
      "建立時間",
      "更新時間",
      "建立者",
    ],
  },
  {
    title: "應收分期",
    headers: [
      "分期ID",
      "應收單號",
      "期數",
      "標籤",
      "比例",
      "應收金額",
      "預定收款日",
      "實收金額",
      "實收日期",
      "收款方式",
      "分期狀態",
      "調整金額",
      "備註",
      "建立時間",
      "更新時間",
    ],
  },
  {
    title: "電子發票紀錄",
    headers: [
      "發票ID",
      "重試來源ID",
      "來源類型",
      "來源ID",
      "來源子ID",
      "報價ID",
      "版本ID",
      "案件ID",
      "客戶ID",
      "買方類型",
      "買方名稱",
      "買方統編",
      "Email",
      "載具類型",
      "載具值",
      "捐贈碼",
      "開立日期",
      "課稅別",
      "未稅金額",
      "稅額",
      "總金額",
      "稅率",
      "品項數",
      "品項JSON",
      "備註",
      "狀態",
      "供應商",
      "發票號碼",
      "隨機碼/追蹤碼",
      "回應JSON",
      "請求JSON",
      "錯誤代碼",
      "錯誤訊息",
      "作廢時間",
      "作廢原因",
       "建立者",
       "建立時間",
       "更新時間",
       "買方地址",
       "內部註記",
       "總備註",
     ],
  },
  {
    title: "電子發票事件",
    headers: [
      "事件ID",
      "發票ID",
      "事件類型",
      "前狀態",
      "後狀態",
      "訊息",
      "請求JSON",
      "回應JSON",
      "操作者",
      "發生時間",
    ],
  },
  {
    title: "電子發票不開清單",
    headers: ["版本ID", "設定時間"],
  },
  {
    title: "司機資料",
    headers: ["key", "title", "confirmTitle", "phoneNumber", "labelId", "active"],
  },
  {
    title: "POS_底價",
    headers: ["款式", "座位", "TW_LV1", "TW_LV2", "TW_LV3", "TW_LV4", "TW_LV5", "IMPORT_LV1", "IMPORT_LV2", "IMPORT_LV3", "IMPORT_LV4", "IMPORT_LV5", "LEATHER_LV1", "LEATHER_LV2", "LEATHER_LV3"],
  },
  {
    title: "POS_調整費率",
    headers: ["費率群組", "適用材質IDs", "1人_深/6cm", "1人_背/6cm", "2人_深/6cm", "2人_背/6cm", "3人_深/6cm", "3人_背/6cm", "加寬/1cm"],
  },
  {
    title: "轉介紹人",
    headers: [
      "引荐人ID",
      "引荐人名稱",
      "介紹人數",
      "訂單數",
      "貢獻營收",
      "獎勵層級",
      "獎勵狀態",
      "最近轉介日",
      "被介紹人JSON",
      "同步時間",
    ],
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
  ["commission_fixed_amount", "0"],
  ["quote_validity_days", "30"],
  ["company_name", "馬鈴薯沙發"],
  ["company_phone", "(02)8262-9396"],
  ["company_address", ""],
  ["company_line", ""],
  ["company_fax", "(02)8262-8182"],
  ["company_tax_id", "85164778"],
  ["company_contact", "周春懋"],
  ["company_full_name", "馬鈴薯沙發"],
  ["factory_address", "236新北市土城區廣福街77巷6-6號"],
  ["purchase_order_prefix", "PS"],
];

const DEFAULT_DRIVER_ROWS = [
  ["shin", "阿信 (兩人）[BXH-6828]", "阿信哥～",  "0958640520",               "5ccbe7e691d0c2ddc5263071", "TRUE"],
  ["ya",   "葉先生 (回頭車)",          "葉先生",    "0933468058 / 0928338272",  "5d959bab4e385d7900fe6ac2", "TRUE"],
  ["fu",   "阿富",                    "阿富～",    "0953123527",               "5f6aa9adc159722ed25e4708", "TRUE"],
  ["hang", "志航",                    "",          "0922898816",               "5f7a80fb0496ea8a2d92b045", "TRUE"],
  ["jian", "簡先生",                  "簡大哥～",  "0910347260",               "5fac0898ecc96e14517bbf8e", "TRUE"],
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

      if (def.title === "司機資料") {
        const existingDrivers = await client.sheets.spreadsheets.values.get({
          spreadsheetId: client.spreadsheetId,
          range: "司機資料!A2:A",
        });
        if (!existingDrivers.data.values?.length) {
          await client.sheets.spreadsheets.values.update({
            spreadsheetId: client.spreadsheetId,
            range: "司機資料!A2",
            valueInputOption: "RAW",
            requestBody: { values: DEFAULT_DRIVER_ROWS },
          });
        }
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
