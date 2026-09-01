import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME, verifySession } from "@/lib/auth";
import {
  CACHE_KEY,
  CACHE_TTL,
  RANGE_DATA,
  RANGE_FULL,
  RANGE_IDS,
  SHEET,
  productToRow,
  rowToProduct,
} from "@/lib/purchase-products-sheet";
import { cacheGet, cacheInvalidate, cacheSet, singleFlight } from "@/lib/sheets-cache";
import { getSheetsClient } from "@/lib/sheets-client";
import type { PurchaseProduct } from "@/lib/types";

// GET 不讀 request → Next 會在建置時靜態化、永遠回舊快照（範本存了看不到的根因）
export const dynamic = "force-dynamic";

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
