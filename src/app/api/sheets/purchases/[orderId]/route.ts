import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import type {
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderStatus,
  PurchaseUnit,
} from "@/lib/types";

const ORDER_SHEET = "採購單";
const ITEM_SHEET = "採購單明細";
const ORDER_RANGE_IDS = `${ORDER_SHEET}!A2:A`;
const ORDER_RANGE_DATA = `${ORDER_SHEET}!A2:P`;
const ITEM_RANGE_DATA = `${ITEM_SHEET}!A2:J`;
const ITEM_RANGE_FULL = `${ITEM_SHEET}!A:J`;

function rowToOrder(row: string[]): PurchaseOrder {
  const isLegacyOrderRow = row.length <= 14 || (row[3] ?? "").trim().startsWith("{");
  let supplierSnapshot: PurchaseOrder["supplierSnapshot"] = {
    name: "",
    shortName: "",
    contactPerson: "",
    phone: "",
    fax: "",
    email: "",
    taxId: "",
    address: "",
    paymentMethod: "",
    paymentTerms: "",
  };
  try {
    const snapshotRaw = isLegacyOrderRow ? row[3] : row[5];
    if (snapshotRaw) supplierSnapshot = { ...supplierSnapshot, ...JSON.parse(snapshotRaw) };
  } catch {
    /* ignore */
  }

  if (isLegacyOrderRow) {
    return {
      orderId: row[0] ?? "",
      orderDate: row[1] ?? "",
      supplierId: row[2] ?? "",
      caseId: "",
      caseNameSnapshot: "",
      supplierSnapshot,
      subtotal: Number(row[4] ?? 0) || 0,
      shippingFee: Number(row[5] ?? 0) || 0,
      taxAmount: Number(row[6] ?? 0) || 0,
      totalAmount: Number(row[7] ?? 0) || 0,
      notes: row[8] ?? "",
      status: (row[9] as PurchaseOrderStatus) || "draft",
      deliveryAddress: row[10] ?? "",
      expectedDeliveryDate: row[11] ?? "",
      createdAt: row[12] ?? "",
      updatedAt: row[13] ?? "",
    };
  }

  return {
    orderId: row[0] ?? "",
    orderDate: row[1] ?? "",
    supplierId: row[2] ?? "",
    caseId: row[3] ?? "",
    caseNameSnapshot: row[4] ?? "",
    supplierSnapshot,
    subtotal: Number(row[6] ?? 0),
    shippingFee: Number(row[7] ?? 0),
    taxAmount: Number(row[8] ?? 0),
    totalAmount: Number(row[9] ?? 0),
    notes: row[10] ?? "",
    status: (row[11] as PurchaseOrderStatus) ?? "draft",
    deliveryAddress: row[12] ?? "",
    expectedDeliveryDate: row[13] ?? "",
    createdAt: row[14] ?? "",
    updatedAt: row[15] ?? "",
  };
}

function orderToRow(o: PurchaseOrder): string[] {
  return [
    o.orderId,
    o.orderDate,
    o.supplierId,
    o.caseId,
    o.caseNameSnapshot,
    JSON.stringify(o.supplierSnapshot ?? {}),
    String(o.subtotal),
    String(o.shippingFee),
    String(o.taxAmount),
    String(o.totalAmount),
    o.notes,
    o.status,
    o.deliveryAddress,
    o.expectedDeliveryDate,
    o.createdAt,
    o.updatedAt,
  ];
}

function rowToItem(row: string[]): PurchaseOrderItem {
  const isLegacyItemRow = row.length <= 9;
  let productSnapshot: PurchaseOrderItem["productSnapshot"] = {
    productCode: "",
    productName: "",
    specification: "",
    unit: "碼" as PurchaseUnit,
  };
  try {
    if (row[4]) productSnapshot = { ...productSnapshot, ...JSON.parse(row[4]) };
  } catch {
    /* ignore */
  }

  return {
    itemId: row[0] ?? "",
    orderId: row[1] ?? "",
    sortOrder: Number(row[2] ?? 0),
    productId: row[3] ?? "",
    productSnapshot,
    quantity: Number(row[5] ?? 0),
    receivedQuantity: isLegacyItemRow ? 0 : Number(row[6] ?? 0),
    unitPrice: Number(row[isLegacyItemRow ? 6 : 7] ?? 0),
    amount: Number(row[isLegacyItemRow ? 7 : 8] ?? 0),
    notes: row[isLegacyItemRow ? 8 : 9] ?? "",
  };
}

function itemToRow(i: PurchaseOrderItem): string[] {
  return [
    i.itemId,
    i.orderId,
    String(i.sortOrder),
    i.productId,
    JSON.stringify(i.productSnapshot ?? {}),
    String(i.quantity),
    String(i.receivedQuantity),
    String(i.unitPrice),
    String(i.amount),
    i.notes,
  ];
}

function normalizeReceivedQuantity(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function deriveOrderStatus(items: PurchaseOrderItem[], requestedStatus: PurchaseOrderStatus): PurchaseOrderStatus {
  if (requestedStatus === "cancelled") {
    return "cancelled";
  }

  if (items.length > 0 && items.every((item) => item.receivedQuantity >= item.quantity)) {
    return "received";
  }

  if (items.some((item) => item.receivedQuantity > 0)) {
    return "confirmed";
  }

  if (requestedStatus === "received") {
    return "confirmed";
  }

  return requestedStatus;
}

type RouteContext = { params: Promise<{ orderId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { orderId } = await context.params;
  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const orderRes = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: ORDER_RANGE_DATA,
    });
    const orders = (orderRes.data.values ?? []).map(rowToOrder);
    const order = orders.find((o) => o.orderId === orderId);
    if (!order) {
      return NextResponse.json({ ok: false, error: "order not found" }, { status: 404 });
    }

    const itemRes = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: ITEM_RANGE_DATA,
    });
    const items = (itemRes.data.values ?? [])
      .map(rowToItem)
      .filter((i) => i.orderId === orderId)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    return NextResponse.json({ ok: true, order, items });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/**
 * PATCH = update order + replace items
 * Body: { order: PurchaseOrder, items: PurchaseOrderItem[] }
 */
export async function PATCH(request: Request, context: RouteContext) {
  const { orderId } = await context.params;
  const body = (await request.json()) as {
    order: PurchaseOrder;
    items: PurchaseOrderItem[];
  };

  body.order.orderId = orderId;
  body.order.updatedAt = new Date().toISOString();

  const sheetsClient = await getSheetsClient();
  if (!sheetsClient) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    // Locate order row
    const idsRes = await sheetsClient.sheets.spreadsheets.values.get({
      spreadsheetId: sheetsClient.spreadsheetId,
      range: ORDER_RANGE_IDS,
    });
    const ids = (idsRes.data.values ?? []).flat();
    const rowIndex = ids.indexOf(orderId);
    if (rowIndex === -1) {
      return NextResponse.json({ ok: false, error: "order not found" }, { status: 404 });
    }
    const sheetRow = rowIndex + 2;

    // Replace items: read existing, delete matching rows, append new
    const itemRes = await sheetsClient.sheets.spreadsheets.values.get({
      spreadsheetId: sheetsClient.spreadsheetId,
      range: ITEM_RANGE_DATA,
    });
    const allItemRows = itemRes.data.values ?? [];
    const existingOrderItems = allItemRows
      .map(rowToItem)
      .filter((item) => item.orderId === orderId);
    const existingItemsById = new Map(existingOrderItems.map((item) => [item.itemId, item]));

    // Find rows belonging to this orderId (col B = orderId)
    const keepRows = allItemRows.filter((r) => r[1] !== orderId);

    const deletedReceivedItem = existingOrderItems.find(
      (existingItem) =>
        existingItem.receivedQuantity > 0 &&
        !body.items.some((incomingItem) => incomingItem.itemId === existingItem.itemId),
    );
    if (deletedReceivedItem) {
      return NextResponse.json(
        { ok: false, error: `cannot delete received item: ${deletedReceivedItem.itemId}` },
        { status: 400 },
      );
    }

    // Normalize new items
    const normalized = body.items.map((item, idx) => ({
      ...item,
      orderId,
      itemId: item.itemId || `${orderId}-${String(idx + 1).padStart(3, "0")}`,
      sortOrder: item.sortOrder || idx + 1,
      receivedQuantity: normalizeReceivedQuantity(
        existingItemsById.get(item.itemId || "")?.receivedQuantity ?? Number(item.receivedQuantity ?? 0),
      ),
    }));

    const receivedQuantityEditedItem = normalized.find((item) => {
      const existingItem = existingItemsById.get(item.itemId);
      if (!existingItem) {
        return item.receivedQuantity > 0;
      }

      return item.receivedQuantity !== existingItem.receivedQuantity;
    });
    if (receivedQuantityEditedItem) {
      return NextResponse.json(
        { ok: false, error: `請使用收貨入庫流程更新實收數量：${receivedQuantityEditedItem.itemId}` },
        { status: 400 },
      );
    }

    const invalidQuantityItem = normalized.find((item) => item.receivedQuantity > item.quantity);
    if (invalidQuantityItem) {
      return NextResponse.json(
        { ok: false, error: `quantity cannot be less than receivedQuantity for ${invalidQuantityItem.itemId}` },
        { status: 400 },
      );
    }

    const editedReceivedItem = normalized.find((item) => {
      const existingItem = existingItemsById.get(item.itemId);
      if (!existingItem || existingItem.receivedQuantity <= 0) {
        return false;
      }

      return (
        existingItem.productId !== item.productId ||
        existingItem.productSnapshot.unit !== item.productSnapshot.unit ||
        existingItem.unitPrice !== item.unitPrice
      );
    });
    if (editedReceivedItem) {
      return NextResponse.json(
        {
          ok: false,
          error: `cannot change product, unit, or unitPrice after receiving for ${editedReceivedItem.itemId}`,
        },
        { status: 400 },
      );
    }

    body.order.status = deriveOrderStatus(normalized, body.order.status);
    body.order.updatedAt = new Date().toISOString();
    const newItemRows = normalized.map(itemToRow);

    await sheetsClient.sheets.spreadsheets.values.update({
      spreadsheetId: sheetsClient.spreadsheetId,
      range: `${ORDER_SHEET}!A${sheetRow}:P${sheetRow}`,
      valueInputOption: "RAW",
      requestBody: { values: [orderToRow(body.order)] },
    });

    // Clear all item rows and rewrite
    await sheetsClient.sheets.spreadsheets.values.clear({
      spreadsheetId: sheetsClient.spreadsheetId,
      range: ITEM_RANGE_DATA,
    });

    const merged = [...keepRows, ...newItemRows];
    if (merged.length > 0) {
      await sheetsClient.sheets.spreadsheets.values.update({
        spreadsheetId: sheetsClient.spreadsheetId,
        range: `${ITEM_SHEET}!A2`,
        valueInputOption: "RAW",
        requestBody: { values: merged },
      });
    }

    return NextResponse.json({ ok: true, order: body.order, items: normalized });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/**
 * PUT = lightweight status-only update
 * Body: { status: PurchaseOrderStatus }
 */
export async function PUT(request: Request, context: RouteContext) {
  const { orderId } = await context.params;
  const body = (await request.json()) as { status: PurchaseOrderStatus };
  if (!body.status) {
    return NextResponse.json({ ok: false, error: "status is required" }, { status: 400 });
  }

  const sheetsClient = await getSheetsClient();
  if (!sheetsClient) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const orderRes = await sheetsClient.sheets.spreadsheets.values.get({
      spreadsheetId: sheetsClient.spreadsheetId,
      range: ORDER_RANGE_DATA,
    });
    const rows = orderRes.data.values ?? [];
    const rowIndex = rows.findIndex((r) => r[0] === orderId);
    if (rowIndex === -1) {
      return NextResponse.json({ ok: false, error: "order not found" }, { status: 404 });
    }

    const sheetRow = rowIndex + 2;
    const now = new Date().toISOString();
    // Status = column L (index 11), updatedAt = column P (index 15)
    await sheetsClient.sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: sheetsClient.spreadsheetId,
      requestBody: {
        valueInputOption: "RAW",
        data: [
          { range: `${ORDER_SHEET}!L${sheetRow}`, values: [[body.status]] },
          { range: `${ORDER_SHEET}!P${sheetRow}`, values: [[now]] },
        ],
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/**
 * DELETE = soft-delete by setting status = cancelled
 */
export async function DELETE(_request: Request, context: RouteContext) {
  const { orderId } = await context.params;
  const sheetsClient = await getSheetsClient();
  if (!sheetsClient) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const orderRes = await sheetsClient.sheets.spreadsheets.values.get({
      spreadsheetId: sheetsClient.spreadsheetId,
      range: ORDER_RANGE_DATA,
    });
    const rows = orderRes.data.values ?? [];
    const rowIndex = rows.findIndex((r) => r[0] === orderId);
    if (rowIndex === -1) {
      return NextResponse.json({ ok: false, error: "order not found" }, { status: 404 });
    }

    const order = rowToOrder(rows[rowIndex]);
    order.status = "cancelled";
    order.updatedAt = new Date().toISOString();

    const sheetRow = rowIndex + 2;
    await sheetsClient.sheets.spreadsheets.values.update({
      spreadsheetId: sheetsClient.spreadsheetId,
      range: `${ORDER_SHEET}!A${sheetRow}:P${sheetRow}`,
      valueInputOption: "RAW",
      requestBody: { values: [orderToRow(order)] },
    });

    return NextResponse.json({ ok: true, order });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// Silence unused warning for ITEM_RANGE_FULL (reserved for future append path)
void ITEM_RANGE_FULL;
