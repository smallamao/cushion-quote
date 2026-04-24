import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import type { InventorySummary, PurchaseProduct, PurchaseProductCategory, PurchaseUnit } from "@/lib/types";

const INVENTORY_SHEET = "庫存主檔";
const INVENTORY_RANGE_FULL = `${INVENTORY_SHEET}!A:K`;
const INVENTORY_RANGE_DATA = `${INVENTORY_SHEET}!A2:K`;
const INVENTORY_RANGE_IDS = `${INVENTORY_SHEET}!A2:A`;
const PRODUCT_SHEET = "採購商品";
const PRODUCT_RANGE_DATA = `${PRODUCT_SHEET}!A2:O`;

function rowToInventorySummary(row: string[]): InventorySummary {
  let productSnapshot: InventorySummary["productSnapshot"] = {
    productCode: "",
    productName: "",
    specification: "",
    category: "其他",
    unit: "碼",
  };

  try {
    if (row[3]) {
      productSnapshot = { ...productSnapshot, ...JSON.parse(row[3]) };
    }
  } catch {
    productSnapshot = { ...productSnapshot };
  }

  return {
    inventoryId: row[0] ?? "",
    productId: row[1] ?? "",
    supplierId: row[2] ?? "",
    productSnapshot,
    quantityOnHand: Number(row[4] ?? 0),
    lastUnitCost: Number(row[5] ?? 0),
    lastReceivedAt: row[6] ?? "",
    lastTransactionAt: row[7] ?? "",
    notes: row[8] ?? "",
    createdAt: row[9] ?? "",
    updatedAt: row[10] ?? "",
  };
}

function inventorySummaryToRow(summary: InventorySummary): string[] {
  return [
    summary.inventoryId,
    summary.productId,
    summary.supplierId,
    JSON.stringify(summary.productSnapshot),
    String(summary.quantityOnHand),
    String(summary.lastUnitCost),
    summary.lastReceivedAt,
    summary.lastTransactionAt,
    summary.notes,
    summary.createdAt,
    summary.updatedAt,
  ];
}

function rowToPurchaseProduct(row: string[]): PurchaseProduct {
  return {
    id: row[0] ?? "",
    productCode: row[1] ?? "",
    supplierProductCode: row[13] ?? "",
    productName: row[2] ?? "",
    specification: row[3] ?? "",
    category: (row[4] as PurchaseProductCategory) ?? "其他",
    unit: (row[5] as PurchaseUnit) ?? "碼",
    supplierId: row[6] ?? "",
    costPerCai: Number(row[8] ?? 0),
    widthCm: undefined,
    listPricePerCai: Number(row[9] ?? 0),
    supplierName: "",
    imageUrl: row[10] ?? "",
    notes: row[11] ?? "",
    isActive: row[12] !== "FALSE",
    createdAt: row[13] ?? "",
    updatedAt: row[14] ?? "",
  };
}

function buildInventoryId(productId: string): string {
  return `INV-${productId}`;
}

async function getPurchaseProductMap(client: NonNullable<Awaited<ReturnType<typeof getSheetsClient>>>) {
  const response = await client.sheets.spreadsheets.values.get({
    spreadsheetId: client.spreadsheetId,
    range: PRODUCT_RANGE_DATA,
  });

  const products = (response.data.values ?? []).map(rowToPurchaseProduct).filter((item) => item.id);
  return new Map(products.map((item) => [item.id, item]));
}

function buildProductSnapshot(product: PurchaseProduct): InventorySummary["productSnapshot"] {
  return {
    productCode: product.productCode,
    productName: product.productName,
    specification: product.specification,
    category: product.category,
    unit: product.unit,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const productId = searchParams.get("productId")?.trim() ?? "";
  const supplierId = searchParams.get("supplierId")?.trim() ?? "";

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ inventory: [] as InventorySummary[], source: "defaults" as const });
  }

  try {
    const response = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: INVENTORY_RANGE_DATA,
    });

    const inventory = (response.data.values ?? [])
      .map(rowToInventorySummary)
      .filter(
        (item) =>
          item.inventoryId &&
          (!productId || item.productId === productId) &&
          (!supplierId || item.supplierId === supplierId),
      );

    return NextResponse.json({ inventory, source: "sheets" as const });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const payload = (await request.json()) as Partial<InventorySummary> & { productId?: string };

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  const productId = payload.productId?.trim() ?? "";
  if (!productId) {
    return NextResponse.json({ ok: false, error: "productId is required" }, { status: 400 });
  }

  try {
    const productMap = await getPurchaseProductMap(client);
    const product = productMap.get(productId);
    if (!product) {
      return NextResponse.json({ ok: false, error: "purchase product not found" }, { status: 404 });
    }

    const now = new Date().toISOString();
    const summary: InventorySummary = {
      inventoryId: payload.inventoryId?.trim() || buildInventoryId(productId),
      productId,
      supplierId: payload.supplierId?.trim() || product.supplierId,
      productSnapshot: payload.productSnapshot ?? buildProductSnapshot(product),
      quantityOnHand: Number(payload.quantityOnHand ?? 0),
      lastUnitCost: Number(payload.lastUnitCost ?? product.unitPrice),
      lastReceivedAt: payload.lastReceivedAt?.trim() ?? "",
      lastTransactionAt: payload.lastTransactionAt?.trim() ?? "",
      notes: payload.notes?.trim() ?? "",
      createdAt: payload.createdAt?.trim() || now,
      updatedAt: now,
    };

    const existingIdsResponse = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: INVENTORY_RANGE_IDS,
    });
    const existingIds = (existingIdsResponse.data.values ?? []).flat();
    if (existingIds.includes(summary.inventoryId)) {
      return NextResponse.json({ ok: false, error: "inventory already exists" }, { status: 409 });
    }

    await client.sheets.spreadsheets.values.append({
      spreadsheetId: client.spreadsheetId,
      range: INVENTORY_RANGE_FULL,
      valueInputOption: "RAW",
      requestBody: { values: [inventorySummaryToRow(summary)] },
    });

    return NextResponse.json({ ok: true, inventory: summary }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const payload = (await request.json()) as Partial<InventorySummary> & { inventoryId?: string };
  const inventoryId = payload.inventoryId?.trim() ?? "";

  if (!inventoryId) {
    return NextResponse.json({ ok: false, error: "inventoryId is required" }, { status: 400 });
  }

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const response = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: INVENTORY_RANGE_DATA,
    });
    const rows = response.data.values ?? [];
    const rowIndex = rows.findIndex((row) => (row[0] ?? "") === inventoryId);
    if (rowIndex === -1) {
      return NextResponse.json({ ok: false, error: "inventory not found" }, { status: 404 });
    }

    const current = rowToInventorySummary(rows[rowIndex] ?? []);
    const merged: InventorySummary = {
      ...current,
      ...payload,
      inventoryId: current.inventoryId,
      productId: payload.productId?.trim() ?? current.productId,
      supplierId: payload.supplierId?.trim() ?? current.supplierId,
      notes: payload.notes?.trim() ?? current.notes,
      lastReceivedAt: payload.lastReceivedAt?.trim() ?? current.lastReceivedAt,
      lastTransactionAt: payload.lastTransactionAt?.trim() ?? current.lastTransactionAt,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
    };

    const sheetRow = rowIndex + 2;
    await client.sheets.spreadsheets.values.update({
      spreadsheetId: client.spreadsheetId,
      range: `${INVENTORY_SHEET}!A${sheetRow}:K${sheetRow}`,
      valueInputOption: "RAW",
      requestBody: { values: [inventorySummaryToRow(merged)] },
    });

    return NextResponse.json({ ok: true, inventory: merged });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
