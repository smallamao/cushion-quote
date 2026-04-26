import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME, verifySession } from "@/lib/auth";
import { cacheGet, cacheInvalidate, cacheSet, singleFlight } from "@/lib/sheets-cache";
import { getSheetsClient } from "@/lib/sheets-client";
import { yardToCai } from "@/lib/utils";
import type { PurchaseProduct, PurchaseProductCategory, PurchaseUnit } from "@/lib/types";

const SHEET = "採購商品";
// Actual sheet schema (25 columns A:Y) — matches the user's header row.
// Migration endpoint /migrate-to-25col converts any legacy 13-col rows
// to this layout. New writes always use this layout going forward.
//
//  A  ID            → id
//  B  商品編號       → productCode
//  C  廠商產品編號    → supplierProductCode
//  D  商品名稱       → productName
//  E  規格           → specification
//  F  分類           → category
//  G  單位           → unit
//  H  廠商編號       → supplierId
//  I  廠商名稱       → supplierName
//  J  幅寬(cm)       → widthCm
//  K  進價           → unitPrice (主要單價,UI 顯示)
//  L  牌價           → listPricePerCai
//  M  品牌           → brand
//  N  系列           → series
//  O  色號           → colorCode
//  P  色名           → colorName
//  Q  圖片URL        → imageUrl
//  R  備註           → notes
//  S  最小訂量       → (not in type yet, written empty)
//  T  交期           → (not in type yet, written empty)
//  U  庫存狀態       → (not in type yet, written empty)
//  V  啟用           → isActive
//  W  建立時間       → createdAt
//  X  更新時間       → updatedAt
//  Y  更新時間 (dup) → updatedAt (mirrored)
const RANGE_FULL = `${SHEET}!A:Y`;
const RANGE_DATA = `${SHEET}!A2:Y`;
const RANGE_IDS = `${SHEET}!A2:A`;

function safeNumber(v: string | undefined): number | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function rowToProduct(row: string[]): PurchaseProduct {
  const unit = (row[6] as PurchaseUnit) ?? "碼";
  const widthCm = safeNumber(row[9]);
  const legacyUnitPrice = safeNumber(row[10]) ?? 0;
  // Convert per-unit purchase price to per-才 for calculator use
  const costPerCai = (() => {
    if (!legacyUnitPrice) return 0;
    if (unit === "才") return legacyUnitPrice;
    if (unit === "碼") return yardToCai(legacyUnitPrice, widthCm ?? 137);
    return legacyUnitPrice;
  })();
  return {
    id: row[0] ?? "",
    productCode: row[1] ?? "",
    supplierProductCode: row[2] ?? "",
    productName: row[3] ?? "",
    specification: row[4] ?? "",
    category: (row[5] as PurchaseProductCategory) ?? "其他",
    unit,
    supplierId: row[7] ?? "",
    supplierName: row[8] ?? "",
    widthCm,
    unitPrice: legacyUnitPrice,
    costPerCai,
    listPricePerCai: safeNumber(row[11]),
    brand: row[12] ?? "",
    series: row[13] ?? "",
    colorCode: row[14] ?? "",
    colorName: row[15] ?? "",
    imageUrl: row[16] ?? "",
    notes: row[17] ?? "",
    // S(18)=最小訂量, T(19)=交期, U(20)=庫存狀態 — not modeled in type yet
    isActive: (row[21] ?? "TRUE") !== "FALSE",
    createdAt: row[22] ?? "",
    updatedAt: row[23] ?? "",
  };
}

function productToRow(p: PurchaseProduct): string[] {
  return [
    p.id,                                                   // A
    p.productCode,                                          // B
    p.supplierProductCode || p.productCode,                 // C — fallback
    p.productName,                                          // D
    p.specification,                                        // E
    p.category,                                             // F
    p.unit,                                                 // G
    p.supplierId,                                           // H
    p.supplierName ?? "",                                   // I
    p.widthCm != null ? String(p.widthCm) : "",             // J
    String(p.unitPrice ?? 0),                               // K (進價，per-unit price)
    p.listPricePerCai != null ? String(p.listPricePerCai) : "", // L (牌價)
    p.brand ?? "",                                          // M
    p.series ?? "",                                         // N
    p.colorCode ?? "",                                      // O
    p.colorName ?? "",                                      // P
    p.imageUrl ?? "",                                       // Q
    p.notes ?? "",                                          // R
    "",                                                     // S 最小訂量
    "",                                                     // T 交期
    "",                                                     // U 庫存狀態
    p.isActive ? "TRUE" : "FALSE",                          // V
    p.createdAt,                                            // W
    p.updatedAt,                                            // X
    p.updatedAt,                                            // Y (mirror — dup header)
  ];
}

const CACHE_KEY = "purchase-products:all";
const CACHE_TTL = 60_000; // 1 min

async function getPurchaseProducts(
  client: NonNullable<Awaited<ReturnType<typeof getSheetsClient>>>,
): Promise<PurchaseProduct[]> {
  const response = await client.sheets.spreadsheets.values.get({
    spreadsheetId: client.spreadsheetId,
    range: RANGE_DATA,
  });
  return (response.data.values ?? []).map(rowToProduct).filter((p) => p.id);
}

export async function GET() {
  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ products: [] as PurchaseProduct[], source: "defaults" as const });
  }

  const cached = cacheGet<PurchaseProduct[]>(CACHE_KEY);
  if (cached) {
    return NextResponse.json({ products: cached, source: "sheets" as const });
  }

  try {
    const products = await singleFlight(CACHE_KEY, () => getPurchaseProducts(client));
    cacheSet(CACHE_KEY, products, CACHE_TTL);
    return NextResponse.json({ products, source: "sheets" as const });
  } catch {
    return NextResponse.json({ products: [] as PurchaseProduct[], source: "defaults" as const });
  }
}

export async function POST(request: Request) {
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .find((item) => item.trim().startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.split("=")[1];
  const session = verifySession(token);
  if (!session) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const payload = (await request.json()) as PurchaseProduct | PurchaseProduct[];
  const now = new Date().toISOString().slice(0, 10);
  const items = Array.isArray(payload) ? payload : [payload];

  for (const item of items) {
    item.createdAt = item.createdAt || now;
    item.updatedAt = now;
    if (item.isActive === undefined) item.isActive = true;
  }

  const sheetsClient = await getSheetsClient();
  if (!sheetsClient) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    // Fetch existing rows to check for duplicates and find next empty row
    const existingRes = await sheetsClient.sheets.spreadsheets.values.get({
      spreadsheetId: sheetsClient.spreadsheetId,
      range: `${SHEET}!A2:H`,
    });
    const existingRows = existingRes.data.values ?? [];

    // Check for duplicate productCode within the same supplier
    const duplicates: string[] = [];
    for (const item of items) {
      const conflict = existingRows.find(
        (row) => row[1] === item.productCode && row[7] === item.supplierId,
      );
      if (conflict) {
        duplicates.push(`${item.productCode}（廠商 ${item.supplierId}）`);
      }
    }
    if (duplicates.length > 0) {
      return NextResponse.json(
        { ok: false, error: `以下商品編號在此廠商下已存在，請使用不同編號：${duplicates.join("、")}` },
        { status: 409 },
      );
    }

    const existingCount = existingRows.length;
    const startRow = existingCount + 2; // +2: skip header row (1) + 1-indexed
    const endRow = startRow + items.length - 1;

    await sheetsClient.sheets.spreadsheets.values.update({
      spreadsheetId: sheetsClient.spreadsheetId,
      range: `${SHEET}!A${startRow}:Y${endRow}`,
      valueInputOption: "RAW",
      requestBody: { values: items.map(productToRow) },
    });
    cacheInvalidate(CACHE_KEY);
    return NextResponse.json(
      { ok: true, products: items, count: items.length },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .find((item) => item.trim().startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.split("=")[1];
  const session = verifySession(token);
  if (!session) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const payload = (await request.json()) as PurchaseProduct;
  payload.updatedAt = new Date().toISOString().slice(0, 10);

  const sheetsClient = await getSheetsClient();
  if (!sheetsClient) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const response = await sheetsClient.sheets.spreadsheets.values.get({
      spreadsheetId: sheetsClient.spreadsheetId,
      range: RANGE_IDS,
    });
    const ids = (response.data.values ?? []).flat();
    const rowIndex = ids.indexOf(payload.id);
    if (rowIndex === -1) {
      return NextResponse.json({ ok: false, error: "product not found" }, { status: 404 });
    }

    const sheetRow = rowIndex + 2;
    await sheetsClient.sheets.spreadsheets.values.update({
      spreadsheetId: sheetsClient.spreadsheetId,
      range: `${SHEET}!A${sheetRow}:Y${sheetRow}`,
      valueInputOption: "RAW",
      requestBody: { values: [productToRow(payload)] },
    });
    cacheInvalidate(CACHE_KEY);
    return NextResponse.json({ ok: true, product: payload });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
