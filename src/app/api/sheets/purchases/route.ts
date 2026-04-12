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
const ORDER_RANGE_FULL = `${ORDER_SHEET}!A:P`;
const ORDER_RANGE_DATA = `${ORDER_SHEET}!A2:P`;
const ITEM_RANGE_FULL = `${ITEM_SHEET}!A:J`;
const ITEM_RANGE_DATA = `${ITEM_SHEET}!A2:J`;

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
    if (snapshotRaw) {
      supplierSnapshot = { ...supplierSnapshot, ...JSON.parse(snapshotRaw) };
    }
  } catch {
    /* ignore snapshot parse errors */
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
    if (row[4]) {
      productSnapshot = { ...productSnapshot, ...JSON.parse(row[4]) };
    }
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

/**
 * GET = list all purchase orders (without items by default)
 * Query param: ?includeItems=true to include line items
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const includeItems = searchParams.get("includeItems") === "true";

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ orders: [] as PurchaseOrder[], source: "defaults" as const });
  }

  try {
    const orderRes = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: ORDER_RANGE_DATA,
    });
    const orders = (orderRes.data.values ?? [])
      .map(rowToOrder)
      .filter((o) => o.orderId);

    if (!includeItems) {
      return NextResponse.json({ orders, source: "sheets" as const });
    }

    const itemRes = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: ITEM_RANGE_DATA,
    });
    const items = (itemRes.data.values ?? [])
      .map(rowToItem)
      .filter((i) => i.itemId);

    const itemsByOrder: Record<string, PurchaseOrderItem[]> = {};
    for (const it of items) {
      if (!itemsByOrder[it.orderId]) itemsByOrder[it.orderId] = [];
      itemsByOrder[it.orderId].push(it);
    }
    for (const key of Object.keys(itemsByOrder)) {
      itemsByOrder[key].sort((a, b) => a.sortOrder - b.sortOrder);
    }

    return NextResponse.json({
      orders,
      itemsByOrder,
      source: "sheets" as const,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json(
      { ok: false, orders: [] as PurchaseOrder[], error: message },
      { status: 500 }
    );
  }
}

/**
 * POST = create a new purchase order with items
 * Body: { order: PurchaseOrder, items: PurchaseOrderItem[] }
 */
export async function POST(request: Request) {
  const body = (await request.json()) as {
    order: PurchaseOrder;
    items: PurchaseOrderItem[];
  };

  const now = new Date().toISOString();
  body.order.createdAt = body.order.createdAt || now;
  body.order.updatedAt = now;

  const sheetsClient = await getSheetsClient();
  if (!sheetsClient) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    // Auto-generate orderId if missing: PS-YYYYMMDD-NN
    if (!body.order.orderId) {
      const dateStr = (body.order.orderDate || new Date().toISOString().slice(0, 10))
        .replace(/-/g, "")
        .slice(0, 8);
      const prefix = `PS-${dateStr}-`;

      const existingRes = await sheetsClient.sheets.spreadsheets.values.get({
        spreadsheetId: sheetsClient.spreadsheetId,
        range: `${ORDER_SHEET}!A2:A`,
      });
      const existingIds = (existingRes.data.values ?? []).flat() as string[];
      const sameDayIds = existingIds.filter((id) => id.startsWith(prefix));
      const maxSeq = sameDayIds.reduce((max, id) => {
        const seq = Number(id.slice(prefix.length));
        return Number.isFinite(seq) && seq > max ? seq : max;
      }, 0);
      body.order.orderId = `${prefix}${String(maxSeq + 1).padStart(2, "0")}`;
    }

    // Ensure items have orderId and itemId
    body.items = body.items.map((item, idx) => ({
      ...item,
      orderId: body.order.orderId,
      itemId: item.itemId || `${body.order.orderId}-${String(idx + 1).padStart(3, "0")}`,
      sortOrder: item.sortOrder || idx + 1,
      receivedQuantity: normalizeReceivedQuantity(Number(item.receivedQuantity ?? 0)),
    }));

    const hasInvalidReceivedQuantity = body.items.some(
      (item) => item.receivedQuantity < 0 || item.receivedQuantity > item.quantity,
    );
    if (hasInvalidReceivedQuantity) {
      return NextResponse.json(
        { ok: false, error: "receivedQuantity must be between 0 and quantity" },
        { status: 400 },
      );
    }

    if (body.items.some((item) => item.receivedQuantity > 0)) {
      return NextResponse.json(
        { ok: false, error: "請使用收貨入庫流程更新實收數量" },
        { status: 400 },
      );
    }

    body.order.status = deriveOrderStatus(body.items, body.order.status);

    // Append order
    await sheetsClient.sheets.spreadsheets.values.append({
      spreadsheetId: sheetsClient.spreadsheetId,
      range: ORDER_RANGE_FULL,
      valueInputOption: "RAW",
      requestBody: { values: [orderToRow(body.order)] },
    });

    // Append items (if any)
    if (body.items.length > 0) {
      await sheetsClient.sheets.spreadsheets.values.append({
        spreadsheetId: sheetsClient.spreadsheetId,
        range: ITEM_RANGE_FULL,
        valueInputOption: "RAW",
        requestBody: { values: body.items.map(itemToRow) },
      });
    }

    return NextResponse.json(
      { ok: true, order: body.order, items: body.items },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
