import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";

const ORDER_SHEET = "採購單";
const ITEM_SHEET = "採購單明細";
const ORDER_RANGE = `${ORDER_SHEET}!A:P`;
const ITEM_RANGE = `${ITEM_SHEET}!A:J`;
const ORDER_ID_RANGE = `${ORDER_SHEET}!A2:A`;

interface ParsedOrder {
  orderId: string;
  orderDate: string;
  supplierId: string;
  supplierSnapshot: Record<string, string>;
  subtotal: number;
  shippingFee: number;
  taxAmount: number;
  totalAmount: number;
  notes: string;
  deliveryAddress: string;
  expectedDeliveryDate: string;
}

interface ParsedItem {
  orderId: string;
  sortOrder: number;
  productId: string;
  productSnapshot: Record<string, string>;
  quantity: number;
  unitPrice: number;
  amount: number;
  notes: string;
}

interface ImportRequest {
  mode: "preview" | "commit";
  /** 主檔 backup sheet,可以是完整 URL 或 spreadsheetId */
  ordersSource: string;
  /** 明細 backup sheet,可以是完整 URL 或 spreadsheetId */
  itemsSource: string;
  /** 主檔工作表頁籤名稱,預設「採購單」 */
  ordersSheetName?: string;
  /** 明細工作表頁籤名稱,預設「採購單」(Ragic 慣例同名) */
  itemsSheetName?: string;
}

/**
 * 從 Google Sheets URL 抽出 spreadsheetId
 * https://docs.google.com/spreadsheets/d/{ID}/edit
 */
function extractSpreadsheetId(input: string): string {
  if (!input) return "";
  const m = input.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return m[1];
  // 假設輸入本身就是 ID
  return input.trim();
}

function rowsToObjects(values: string[][]): Array<Record<string, string>> {
  if (values.length < 2) return [];
  const headers = values[0].map((h) => (h ?? "").trim().replace(/\*$/, ""));
  const out: Array<Record<string, string>> = [];
  for (let i = 1; i < values.length; i++) {
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = ((values[i] ?? [])[idx] ?? "").toString().trim();
    });
    // 全空列跳過
    if (Object.values(row).some((v) => v.length > 0)) out.push(row);
  }
  return out;
}

function normalizeMoney(raw: string): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/[$,\s]/g, "").replace(/\.$/, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function normalizeDate(raw: string): string {
  if (!raw) return "";
  const m = raw.trim().replace(/\//g, "-").match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return "";
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

function buildOrders(rows: Array<Record<string, string>>): {
  orders: ParsedOrder[];
  errors: string[];
} {
  const orders: ParsedOrder[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  rows.forEach((r, idx) => {
    const lineNo = idx + 2;
    const orderId = r["採購單號"];
    if (!orderId) {
      errors.push(`主檔第 ${lineNo} 列: 缺少採購單號`);
      return;
    }
    if (seen.has(orderId)) {
      // 同一單號重複 (主檔)
      return;
    }
    seen.add(orderId);
    const orderDate = normalizeDate(r["採購日期"] ?? "");
    if (!orderDate) {
      errors.push(`主檔第 ${lineNo} 列 (${orderId}): 採購日期格式錯誤`);
      return;
    }
    const supplierId = r["廠商編號"] ?? "";
    if (!supplierId) {
      errors.push(`主檔第 ${lineNo} 列 (${orderId}): 缺少廠商編號`);
      return;
    }
    orders.push({
      orderId,
      orderDate,
      supplierId,
      supplierSnapshot: {
        name: r["廠商名稱"] ?? "",
        shortName: r["廠商簡稱"] ?? "",
        contactPerson: r["聯絡人"] ?? "",
        phone: r["電話"] ?? "",
        fax: r["傳真"] ?? "",
        email: r["E-mail"] ?? r["Email"] ?? "",
        taxId: r["統一編號"] ?? "",
        address: r["地址"] ?? "",
        paymentMethod: r["付款方式"] ?? "",
        paymentTerms: r["付款條件"] ?? "",
      },
      subtotal: normalizeMoney(r["小計"] ?? ""),
      shippingFee: normalizeMoney(r["運費"] ?? ""),
      taxAmount: normalizeMoney(r["稅額"] ?? ""),
      totalAmount: normalizeMoney(r["合計金額"] ?? ""),
      notes: r["附註"] ?? "",
      deliveryAddress: r["交貨地址"] ?? "",
      expectedDeliveryDate: normalizeDate(r["到貨日期"] ?? ""),
    });
  });
  return { orders, errors };
}

function buildItems(rows: Array<Record<string, string>>): {
  items: ParsedItem[];
  errors: string[];
} {
  const items: ParsedItem[] = [];
  const errors: string[] = [];
  rows.forEach((r, idx) => {
    const lineNo = idx + 2;
    const orderId = r["採購單號"];
    if (!orderId) {
      errors.push(`明細第 ${lineNo} 列: 缺少採購單號`);
      return;
    }
    const productCode = r["商品編號"] ?? "";
    if (!productCode) {
      // 主檔常會跟明細混在同一張表 (Ragic 子表),沒商品編號的列代表單頭,跳過
      return;
    }
    const quantity = Number(r["數量"] ?? 0) || 0;
    const unitPrice = normalizeMoney(r["單價"] ?? "");
    const amount =
      normalizeMoney(r["金額"] ?? "") || Math.round(quantity * unitPrice * 100) / 100;
    items.push({
      orderId,
      sortOrder: Number(r["項次"] ?? 0) || items.length + 1,
      productId: r["商品採購編號"] ?? "",
      productSnapshot: {
        productCode,
        productName: r["商品名稱"] ?? "",
        specification: r["規格"] ?? "",
        unit: r["單位"] ?? "碼",
      },
      quantity,
      unitPrice,
      amount,
      notes: r["備註"] ?? "",
    });
  });
  return { items, errors };
}

function orderToRow(o: ParsedOrder): string[] {
  const now = new Date().toISOString();
  return [
    o.orderId,
    o.orderDate,
    o.supplierId,
    "",
    "",
    JSON.stringify(o.supplierSnapshot),
    String(o.subtotal),
    String(o.shippingFee),
    String(o.taxAmount),
    String(o.totalAmount),
    o.notes,
    "received",
    o.deliveryAddress,
    o.expectedDeliveryDate,
    now,
    now,
  ];
}

function itemToRow(item: ParsedItem, idx: number): string[] {
  const itemId = `${item.orderId}-${String(item.sortOrder || idx + 1).padStart(3, "0")}`;
  return [
    itemId,
    item.orderId,
    String(item.sortOrder || idx + 1),
    item.productId,
    JSON.stringify(item.productSnapshot),
    String(item.quantity),
    String(item.quantity),
    String(item.unitPrice),
    String(item.amount),
    item.notes,
  ];
}

export async function POST(request: Request) {
  let body: ImportRequest;
  try {
    body = (await request.json()) as ImportRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "請求格式錯誤" }, { status: 400 });
  }

  if (!body.ordersSource || !body.itemsSource) {
    return NextResponse.json(
      { ok: false, error: "請提供 ordersSource 與 itemsSource (URL 或 spreadsheetId)" },
      { status: 400 },
    );
  }

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json(
      { ok: false, error: "Google Sheets 未設定" },
      { status: 503 },
    );
  }

  const ordersSpreadsheetId = extractSpreadsheetId(body.ordersSource);
  const itemsSpreadsheetId = extractSpreadsheetId(body.itemsSource);
  const ordersSheetName = body.ordersSheetName ?? "採購單";
  const itemsSheetName = body.itemsSheetName ?? "採購單";

  // 讀取來源 sheets
  let ordersValues: string[][] = [];
  let itemsValues: string[][] = [];
  try {
    const [ordersRes, itemsRes] = await Promise.all([
      client.sheets.spreadsheets.values.get({
        spreadsheetId: ordersSpreadsheetId,
        range: `${ordersSheetName}!A:Z`,
      }),
      client.sheets.spreadsheets.values.get({
        spreadsheetId: itemsSpreadsheetId,
        range: `${itemsSheetName}!A:Z`,
      }),
    ]);
    ordersValues = (ordersRes.data.values ?? []) as string[][];
    itemsValues = (itemsRes.data.values ?? []) as string[][];
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "讀取來源 Sheet 失敗",
        hint: "請確認 service account 對來源 Sheet 有讀取權限,並確認工作表頁籤名稱正確",
      },
      { status: 500 },
    );
  }

  const orderRows = rowsToObjects(ordersValues);
  const itemRows = rowsToObjects(itemsValues);

  const { orders, errors: orderErrors } = buildOrders(orderRows);
  const { items, errors: itemErrors } = buildItems(itemRows);

  const orderIdSet = new Set(orders.map((o) => o.orderId));
  const orphanItems: string[] = [];
  for (const it of items) {
    if (!orderIdSet.has(it.orderId)) {
      orphanItems.push(`${it.orderId}-${it.productSnapshot.productCode}`);
    }
  }

  // 抓現有採購單 ID 偵測重複
  let existingOrderIds = new Set<string>();
  try {
    const idRes = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: ORDER_ID_RANGE,
    });
    existingOrderIds = new Set(
      (idRes.data.values ?? []).flat().filter((id): id is string => Boolean(id)),
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "讀取目標 Sheet 失敗" },
      { status: 500 },
    );
  }

  const newOrders = orders.filter((o) => !existingOrderIds.has(o.orderId));
  const skippedOrders = orders.filter((o) => existingOrderIds.has(o.orderId));
  const newOrderIdSet = new Set(newOrders.map((o) => o.orderId));
  const newItems = items.filter((it) => newOrderIdSet.has(it.orderId));

  const stats = {
    parsedOrders: orders.length,
    parsedItems: items.length,
    newOrders: newOrders.length,
    skippedOrders: skippedOrders.length,
    newItems: newItems.length,
    orphanItems: orphanItems.length,
    parseErrors: [...orderErrors, ...itemErrors],
  };

  if (body.mode === "preview") {
    return NextResponse.json({
      ok: true,
      mode: "preview",
      stats,
      sampleOrders: newOrders.slice(0, 5),
      sampleItems: newItems.slice(0, 5),
      skippedOrderIds: skippedOrders.map((o) => o.orderId).slice(0, 20),
      orphanItemKeys: orphanItems.slice(0, 20),
    });
  }

  if (body.mode !== "commit") {
    return NextResponse.json(
      { ok: false, error: "mode 必須是 preview 或 commit" },
      { status: 400 },
    );
  }

  if (newOrders.length === 0 && newItems.length === 0) {
    return NextResponse.json({
      ok: true,
      mode: "commit",
      stats,
      message: "沒有可寫入的新資料",
    });
  }

  try {
    if (newOrders.length > 0) {
      await client.sheets.spreadsheets.values.append({
        spreadsheetId: client.spreadsheetId,
        range: ORDER_RANGE,
        valueInputOption: "RAW",
        requestBody: { values: newOrders.map(orderToRow) },
      });
    }
    if (newItems.length > 0) {
      const grouped = new Map<string, ParsedItem[]>();
      for (const it of newItems) {
        const arr = grouped.get(it.orderId) ?? [];
        arr.push(it);
        grouped.set(it.orderId, arr);
      }
      const itemRowsToAppend: string[][] = [];
      for (const [, group] of grouped) {
        group.forEach((it, idx) => {
          itemRowsToAppend.push(itemToRow(it, idx));
        });
      }
      await client.sheets.spreadsheets.values.append({
        spreadsheetId: client.spreadsheetId,
        range: ITEM_RANGE,
        valueInputOption: "RAW",
        requestBody: { values: itemRowsToAppend },
      });
    }
    return NextResponse.json({
      ok: true,
      mode: "commit",
      stats,
      message: `已寫入 ${newOrders.length} 張採購單、${newItems.length} 筆明細`,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "寫入失敗",
        stats,
      },
      { status: 500 },
    );
  }
}
