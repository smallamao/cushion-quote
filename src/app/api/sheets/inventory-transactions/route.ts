import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import type {
  InventorySummary,
  InventoryTransaction,
  InventoryTransactionType,
  PurchaseProduct,
  PurchaseProductCategory,
  PurchaseUnit,
} from "@/lib/types";

const TRANSACTION_SHEET = "庫存異動";
const TRANSACTION_RANGE_FULL = `${TRANSACTION_SHEET}!A:O`;
const TRANSACTION_RANGE_DATA = `${TRANSACTION_SHEET}!A2:O`;
const INVENTORY_SHEET = "庫存主檔";
const INVENTORY_RANGE_DATA = `${INVENTORY_SHEET}!A2:K`;
const PRODUCT_SHEET = "採購商品";
const PRODUCT_RANGE_DATA = `${PRODUCT_SHEET}!A2:M`;

function toNumber(value: string | number | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildInventoryId(productId: string): string {
  return `INV-${productId}`;
}

function rowToInventoryTransaction(row: string[]): InventoryTransaction {
  return {
    transactionId: row[0] ?? "",
    inventoryId: row[1] ?? "",
    productId: row[2] ?? "",
    supplierId: row[3] ?? "",
    orderId: row[4] ?? "",
    orderItemId: row[5] ?? "",
    transactionType: (row[6] as InventoryTransactionType) ?? "manual_adjustment",
    quantityDelta: toNumber(row[7]),
    unit: (row[8] as PurchaseUnit) ?? "碼",
    unitCost: toNumber(row[9]),
    occurredAt: row[10] ?? "",
    referenceNumber: row[11] ?? "",
    notes: row[12] ?? "",
    createdAt: row[13] ?? "",
    updatedAt: row[14] ?? "",
  };
}

function transactionToRow(record: InventoryTransaction): string[] {
  return [
    record.transactionId,
    record.inventoryId,
    record.productId,
    record.supplierId,
    record.orderId,
    record.orderItemId,
    record.transactionType,
    String(record.quantityDelta),
    record.unit,
    String(record.unitCost),
    record.occurredAt,
    record.referenceNumber,
    record.notes,
    record.createdAt,
    record.updatedAt,
  ];
}

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
    quantityOnHand: toNumber(row[4]),
    lastUnitCost: toNumber(row[5]),
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
    unitPrice: toNumber(row[7]),
    imageUrl: row[8] ?? "",
    notes: row[9] ?? "",
    isActive: row[10] !== "FALSE",
    createdAt: row[11] ?? "",
    updatedAt: row[12] ?? "",
  };
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

async function getInventoryRows(client: NonNullable<Awaited<ReturnType<typeof getSheetsClient>>>) {
  const response = await client.sheets.spreadsheets.values.get({
    spreadsheetId: client.spreadsheetId,
    range: INVENTORY_RANGE_DATA,
  });
  return response.data.values ?? [];
}

async function getProductMap(client: NonNullable<Awaited<ReturnType<typeof getSheetsClient>>>) {
  const response = await client.sheets.spreadsheets.values.get({
    spreadsheetId: client.spreadsheetId,
    range: PRODUCT_RANGE_DATA,
  });
  const products = (response.data.values ?? []).map(rowToPurchaseProduct).filter((item) => item.id);
  return new Map(products.map((item) => [item.id, item]));
}

async function generateTransactionId(client: NonNullable<Awaited<ReturnType<typeof getSheetsClient>>>, now = new Date()) {
  const dateToken = now.toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `INVTX-${dateToken}-`;
  const response = await client.sheets.spreadsheets.values.get({
    spreadsheetId: client.spreadsheetId,
    range: `${TRANSACTION_SHEET}!A2:A`,
  });
  const ids = (response.data.values ?? []).flat() as string[];
  const maxSeq = ids
    .filter((id) => id.startsWith(prefix))
    .reduce((max, id) => {
      const seq = Number(id.slice(prefix.length));
      return Number.isFinite(seq) ? Math.max(max, seq) : max;
    }, 0);
  return `${prefix}${String(maxSeq + 1).padStart(3, "0")}`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const inventoryId = searchParams.get("inventoryId")?.trim() ?? "";
  const productId = searchParams.get("productId")?.trim() ?? "";
  const orderId = searchParams.get("orderId")?.trim() ?? "";
  const transactionType = searchParams.get("transactionType")?.trim() ?? "";

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ transactions: [] as InventoryTransaction[] });
  }

  try {
    const response = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: TRANSACTION_RANGE_DATA,
    });

    const transactions = (response.data.values ?? [])
      .map(rowToInventoryTransaction)
      .filter(
        (item) =>
          item.transactionId &&
          (!inventoryId || item.inventoryId === inventoryId) &&
          (!productId || item.productId === productId) &&
          (!orderId || item.orderId === orderId) &&
          (!transactionType || item.transactionType === transactionType),
      );

    return NextResponse.json({ transactions });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const payload = (await request.json()) as Partial<InventoryTransaction> & {
    productId?: string;
    quantityDelta?: number;
  };

  const productId = payload.productId?.trim() ?? "";
  if (!productId) {
    return NextResponse.json({ ok: false, error: "productId is required" }, { status: 400 });
  }

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const productMap = await getProductMap(client);
    const product = productMap.get(productId);
    if (!product) {
      return NextResponse.json({ ok: false, error: "purchase product not found" }, { status: 404 });
    }

    const inventoryRows = await getInventoryRows(client);
    const inventoryList = inventoryRows.map(rowToInventorySummary).filter((item) => item.inventoryId);
    const requestedInventoryId = payload.inventoryId?.trim() || buildInventoryId(productId);
    const existingInventoryIndex = inventoryList.findIndex((item) => item.inventoryId === requestedInventoryId);
    const existingInventory = existingInventoryIndex >= 0 ? inventoryList[existingInventoryIndex] : null;
    const now = new Date();
    const nowIso = now.toISOString();
    const quantityDelta = toNumber(payload.quantityDelta);

    const transaction: InventoryTransaction = {
      transactionId: payload.transactionId?.trim() || (await generateTransactionId(client, now)),
      inventoryId: requestedInventoryId,
      productId,
      supplierId: payload.supplierId?.trim() || product.supplierId,
      orderId: payload.orderId?.trim() ?? "",
      orderItemId: payload.orderItemId?.trim() ?? "",
      transactionType: payload.transactionType ?? "manual_adjustment",
      quantityDelta,
      unit: payload.unit ?? product.unit,
      unitCost: toNumber(payload.unitCost ?? product.unitPrice),
      occurredAt: payload.occurredAt?.trim() || nowIso,
      referenceNumber: payload.referenceNumber?.trim() ?? "",
      notes: payload.notes?.trim() ?? "",
      createdAt: payload.createdAt?.trim() || nowIso,
      updatedAt: nowIso,
    };

    const nextQuantityOnHand = toNumber(existingInventory?.quantityOnHand) + quantityDelta;
    if (nextQuantityOnHand < 0) {
      return NextResponse.json({ ok: false, error: "inventory would become negative" }, { status: 400 });
    }

    const nextInventory: InventorySummary = {
      inventoryId: requestedInventoryId,
      productId,
      supplierId: existingInventory?.supplierId || transaction.supplierId,
      productSnapshot: existingInventory?.productSnapshot ?? buildProductSnapshot(product),
      quantityOnHand: nextQuantityOnHand,
      lastUnitCost: transaction.unitCost,
      lastReceivedAt:
        transaction.quantityDelta > 0
          ? transaction.occurredAt
          : (existingInventory?.lastReceivedAt ?? ""),
      lastTransactionAt: transaction.occurredAt,
      notes: existingInventory?.notes ?? "",
      createdAt: existingInventory?.createdAt || nowIso,
      updatedAt: nowIso,
    };

    await client.sheets.spreadsheets.values.append({
      spreadsheetId: client.spreadsheetId,
      range: TRANSACTION_RANGE_FULL,
      valueInputOption: "RAW",
      requestBody: { values: [transactionToRow(transaction)] },
    });

    if (existingInventoryIndex >= 0) {
      const sheetRow = existingInventoryIndex + 2;
      await client.sheets.spreadsheets.values.update({
        spreadsheetId: client.spreadsheetId,
        range: `${INVENTORY_SHEET}!A${sheetRow}:K${sheetRow}`,
        valueInputOption: "RAW",
        requestBody: { values: [inventorySummaryToRow(nextInventory)] },
      });
    } else {
      await client.sheets.spreadsheets.values.append({
        spreadsheetId: client.spreadsheetId,
        range: `${INVENTORY_SHEET}!A:K`,
        valueInputOption: "RAW",
        requestBody: { values: [inventorySummaryToRow(nextInventory)] },
      });
    }

    return NextResponse.json(
      { ok: true, transaction, inventory: nextInventory },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
