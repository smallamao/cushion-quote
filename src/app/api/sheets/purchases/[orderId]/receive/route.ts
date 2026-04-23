import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import type {
  InventorySummary,
  InventoryTransaction,
  InventoryTransactionType,
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderStatus,
  PurchaseProduct,
  PurchaseProductCategory,
  PurchaseUnit,
} from "@/lib/types";

const ORDER_SHEET = "採購單";
const ITEM_SHEET = "採購單明細";
const INVENTORY_SHEET = "庫存主檔";
const TRANSACTION_SHEET = "庫存異動";
const PRODUCT_SHEET = "採購商品";

const ORDER_RANGE_DATA = `${ORDER_SHEET}!A2:P`;
const ITEM_RANGE_DATA = `${ITEM_SHEET}!A2:J`;
const INVENTORY_RANGE_DATA = `${INVENTORY_SHEET}!A2:K`;
const TRANSACTION_ID_RANGE = `${TRANSACTION_SHEET}!A2:A`;
const PRODUCT_RANGE_DATA = `${PRODUCT_SHEET}!A2:M`;

type RouteContext = { params: Promise<{ orderId: string }> };

interface ReceiveItemInput {
  itemId: string;
  receivedQuantity: number;
  occurredAt?: string;
  referenceNumber?: string;
  notes?: string;
}

function toNumber(value: string | number | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

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
    supplierSnapshot = { ...supplierSnapshot };
  }

  if (isLegacyOrderRow) {
    return {
      orderId: row[0] ?? "",
      orderDate: row[1] ?? "",
      supplierId: row[2] ?? "",
      caseId: "",
      caseNameSnapshot: "",
      supplierSnapshot,
      subtotal: toNumber(row[4]),
      shippingFee: toNumber(row[5]),
      taxAmount: toNumber(row[6]),
      totalAmount: toNumber(row[7]),
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
    subtotal: toNumber(row[6]),
    shippingFee: toNumber(row[7]),
    taxAmount: toNumber(row[8]),
    totalAmount: toNumber(row[9]),
    notes: row[10] ?? "",
    status: (row[11] as PurchaseOrderStatus) ?? "draft",
    deliveryAddress: row[12] ?? "",
    expectedDeliveryDate: row[13] ?? "",
    createdAt: row[14] ?? "",
    updatedAt: row[15] ?? "",
  };
}

function orderToRow(order: PurchaseOrder): string[] {
  return [
    order.orderId,
    order.orderDate,
    order.supplierId,
    order.caseId,
    order.caseNameSnapshot,
    JSON.stringify(order.supplierSnapshot ?? {}),
    String(order.subtotal),
    String(order.shippingFee),
    String(order.taxAmount),
    String(order.totalAmount),
    order.notes,
    order.status,
    order.deliveryAddress,
    order.expectedDeliveryDate,
    order.createdAt,
    order.updatedAt,
  ];
}

function rowToItem(row: string[]): PurchaseOrderItem {
  const isLegacyItemRow = row.length <= 9;
  let productSnapshot: PurchaseOrderItem["productSnapshot"] = {
    productCode: "",
    productName: "",
    specification: "",
    unit: "碼",
  };

  try {
    if (row[4]) {
      productSnapshot = { ...productSnapshot, ...JSON.parse(row[4]) };
    }
  } catch {
    productSnapshot = { ...productSnapshot };
  }

  return {
    itemId: row[0] ?? "",
    orderId: row[1] ?? "",
    sortOrder: toNumber(row[2]),
    productId: row[3] ?? "",
    productSnapshot,
    quantity: toNumber(row[5]),
    receivedQuantity: isLegacyItemRow ? 0 : toNumber(row[6]),
    unitPrice: toNumber(row[isLegacyItemRow ? 6 : 7]),
    amount: toNumber(row[isLegacyItemRow ? 7 : 8]),
    notes: row[isLegacyItemRow ? 8 : 9] ?? "",
  };
}

function itemToRow(item: PurchaseOrderItem): string[] {
  return [
    item.itemId,
    item.orderId,
    String(item.sortOrder),
    item.productId,
    JSON.stringify(item.productSnapshot ?? {}),
    String(item.quantity),
    String(item.receivedQuantity),
    String(item.unitPrice),
    String(item.amount),
    item.notes,
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

function transactionToRow(transaction: InventoryTransaction): string[] {
  return [
    transaction.transactionId,
    transaction.inventoryId,
    transaction.productId,
    transaction.supplierId,
    transaction.orderId,
    transaction.orderItemId,
    transaction.transactionType,
    String(transaction.quantityDelta),
    transaction.unit,
    String(transaction.unitCost),
    transaction.occurredAt,
    transaction.referenceNumber,
    transaction.notes,
    transaction.createdAt,
    transaction.updatedAt,
  ];
}

function buildInventoryId(productId: string): string {
  return `INV-${productId}`;
}

function buildInventorySnapshot(
  item: PurchaseOrderItem,
  product: PurchaseProduct | null,
): InventorySummary["productSnapshot"] {
  return {
    productCode: item.productSnapshot.productCode,
    productName: item.productSnapshot.productName,
    specification: item.productSnapshot.specification,
    category: product?.category ?? ("其他" as PurchaseProductCategory),
    unit: product?.unit ?? item.productSnapshot.unit,
  };
}

async function getNextTransactionSequence(
  client: NonNullable<Awaited<ReturnType<typeof getSheetsClient>>>,
  now: Date,
): Promise<{ prefix: string; nextSeq: number }> {
  const dateToken = now.toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `INVTX-${dateToken}-`;
  const response = await client.sheets.spreadsheets.values.get({
    spreadsheetId: client.spreadsheetId,
    range: TRANSACTION_ID_RANGE,
  });
  const ids = (response.data.values ?? []).flat() as string[];
  const maxSeq = ids
    .filter((id) => id.startsWith(prefix))
    .reduce((max, id) => {
      const seq = Number(id.slice(prefix.length));
      return Number.isFinite(seq) ? Math.max(max, seq) : max;
    }, 0);
  return { prefix, nextSeq: maxSeq + 1 };
}

function deriveOrderStatus(items: PurchaseOrderItem[], currentStatus: PurchaseOrderStatus): PurchaseOrderStatus {
  if (items.length > 0 && items.every((item) => item.receivedQuantity >= item.quantity)) {
    return "received";
  }

  if (items.some((item) => item.receivedQuantity > 0) && currentStatus !== "cancelled") {
    return "confirmed";
  }

  return currentStatus;
}

export async function POST(request: Request, context: RouteContext) {
  const { orderId } = await context.params;
  const body = (await request.json()) as { items: ReceiveItemInput[] };
  const requestedItems = body.items ?? [];

  if (requestedItems.length === 0) {
    return NextResponse.json({ ok: false, error: "items are required" }, { status: 400 });
  }

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const [orderRes, itemRes, inventoryRes, productRes] = await Promise.all([
      client.sheets.spreadsheets.values.get({
        spreadsheetId: client.spreadsheetId,
        range: ORDER_RANGE_DATA,
      }),
      client.sheets.spreadsheets.values.get({
        spreadsheetId: client.spreadsheetId,
        range: ITEM_RANGE_DATA,
      }),
      client.sheets.spreadsheets.values.get({
        spreadsheetId: client.spreadsheetId,
        range: INVENTORY_RANGE_DATA,
      }),
      client.sheets.spreadsheets.values.get({
        spreadsheetId: client.spreadsheetId,
        range: PRODUCT_RANGE_DATA,
      }),
    ]);

    const orderRows = orderRes.data.values ?? [];
    const orderRowIndex = orderRows.findIndex((row) => (row[0] ?? "") === orderId);
    if (orderRowIndex === -1) {
      return NextResponse.json({ ok: false, error: "order not found" }, { status: 404 });
    }

    const order = rowToOrder(orderRows[orderRowIndex] ?? []);
    if (order.status === "cancelled") {
      return NextResponse.json({ ok: false, error: "cannot receive a cancelled order" }, { status: 400 });
    }

    const itemRows = itemRes.data.values ?? [];
    const orderItemsWithRows = itemRows
      .map((row, index) => ({ row, index, item: rowToItem(row) }))
      .filter((entry) => entry.item.orderId === orderId)
      .sort((a, b) => a.item.sortOrder - b.item.sortOrder);

    const itemMap = new Map(orderItemsWithRows.map((entry) => [entry.item.itemId, entry]));
    const inventoryRows = inventoryRes.data.values ?? [];
    const productMap = new Map(
      (productRes.data.values ?? [])
        .map(rowToPurchaseProduct)
        .filter((product) => product.id)
        .map((product) => [product.id, product]),
    );
    const inventoryMap = new Map(
      inventoryRows
        .map((row, index) => ({ index, summary: rowToInventorySummary(row) }))
        .filter((entry) => entry.summary.inventoryId)
        .map((entry) => [entry.summary.inventoryId, entry]),
    );

    const updatedItemsById = new Map<string, PurchaseOrderItem>();
    const inventoryUpserts = new Map<string, InventorySummary>();
    const transactions: InventoryTransaction[] = [];
    const now = new Date();
    const transactionSequence = await getNextTransactionSequence(client, now);

    for (const requested of requestedItems) {
      const entry = itemMap.get(requested.itemId);
      if (!entry) {
        return NextResponse.json({ ok: false, error: `item not found: ${requested.itemId}` }, { status: 404 });
      }

      const delta = toNumber(requested.receivedQuantity);
      if (delta <= 0) {
        return NextResponse.json({ ok: false, error: `receivedQuantity must be > 0 for ${requested.itemId}` }, { status: 400 });
      }

      const baseItem = updatedItemsById.get(entry.item.itemId) ?? entry.item;
      if (!baseItem.productId) {
        return NextResponse.json(
          { ok: false, error: `item has no linked purchase product: ${requested.itemId}` },
          { status: 400 },
        );
      }

      const remaining = baseItem.quantity - baseItem.receivedQuantity;
      if (delta > remaining) {
        return NextResponse.json(
          { ok: false, error: `receivedQuantity exceeds remaining quantity for ${requested.itemId}` },
          { status: 400 },
        );
      }

      const occurredAt = requested.occurredAt?.trim() || now.toISOString();
      const nextItem: PurchaseOrderItem = {
        ...baseItem,
        receivedQuantity: baseItem.receivedQuantity + delta,
      };
      updatedItemsById.set(nextItem.itemId, nextItem);

      const inventoryId = buildInventoryId(nextItem.productId);
      const purchaseProduct = productMap.get(nextItem.productId) ?? null;
      const existingInventory =
        inventoryUpserts.get(inventoryId) ?? inventoryMap.get(inventoryId)?.summary ?? null;
      const nextInventory: InventorySummary = {
        inventoryId,
        productId: nextItem.productId,
        supplierId: order.supplierId,
        productSnapshot:
          existingInventory?.productSnapshot ?? buildInventorySnapshot(nextItem, purchaseProduct),
        quantityOnHand: (existingInventory?.quantityOnHand ?? 0) + delta,
        lastUnitCost: nextItem.unitPrice,
        lastReceivedAt: occurredAt,
        lastTransactionAt: occurredAt,
        notes: existingInventory?.notes ?? "",
        createdAt: existingInventory?.createdAt || now.toISOString(),
        updatedAt: now.toISOString(),
      };
      inventoryUpserts.set(inventoryId, nextInventory);

      transactions.push({
        transactionId: `${transactionSequence.prefix}${String(transactionSequence.nextSeq).padStart(3, "0")}`,
        inventoryId,
        productId: nextItem.productId,
        supplierId: order.supplierId,
        orderId,
        orderItemId: nextItem.itemId,
        transactionType: "purchase_receipt" as InventoryTransactionType,
        quantityDelta: delta,
        unit: nextItem.productSnapshot.unit,
        unitCost: nextItem.unitPrice,
        occurredAt,
        referenceNumber: requested.referenceNumber?.trim() ?? "",
        notes: requested.notes?.trim() ?? "",
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        lotId: "",
      });
      transactionSequence.nextSeq += 1;
    }

    for (const entry of orderItemsWithRows) {
      if (!updatedItemsById.has(entry.item.itemId)) {
        updatedItemsById.set(entry.item.itemId, entry.item);
      }
    }

    const updatedItems = Array.from(updatedItemsById.values()).sort((a, b) => a.sortOrder - b.sortOrder);
    const nextOrder: PurchaseOrder = {
      ...order,
      status: deriveOrderStatus(updatedItems, order.status),
      updatedAt: now.toISOString(),
    };

    await client.sheets.spreadsheets.values.update({
      spreadsheetId: client.spreadsheetId,
      range: `${ORDER_SHEET}!A${orderRowIndex + 2}:P${orderRowIndex + 2}`,
      valueInputOption: "RAW",
      requestBody: { values: [orderToRow(nextOrder)] },
    });

    for (const entry of orderItemsWithRows) {
      const updatedItem = updatedItemsById.get(entry.item.itemId);
      if (!updatedItem) continue;
      const sheetRow = entry.index + 2;
      await client.sheets.spreadsheets.values.update({
        spreadsheetId: client.spreadsheetId,
        range: `${ITEM_SHEET}!A${sheetRow}:J${sheetRow}`,
        valueInputOption: "RAW",
        requestBody: { values: [itemToRow(updatedItem)] },
      });
    }

    for (const [inventoryId, summary] of inventoryUpserts.entries()) {
      const existing = inventoryMap.get(inventoryId);
      if (existing) {
        const sheetRow = existing.index + 2;
        await client.sheets.spreadsheets.values.update({
          spreadsheetId: client.spreadsheetId,
          range: `${INVENTORY_SHEET}!A${sheetRow}:K${sheetRow}`,
          valueInputOption: "RAW",
          requestBody: { values: [inventorySummaryToRow(summary)] },
        });
      } else {
        await client.sheets.spreadsheets.values.append({
          spreadsheetId: client.spreadsheetId,
          range: `${INVENTORY_SHEET}!A:K`,
          valueInputOption: "RAW",
          requestBody: { values: [inventorySummaryToRow(summary)] },
        });
      }
    }

    if (transactions.length > 0) {
      await client.sheets.spreadsheets.values.append({
        spreadsheetId: client.spreadsheetId,
        range: `${TRANSACTION_SHEET}!A:O`,
        valueInputOption: "RAW",
        requestBody: { values: transactions.map(transactionToRow) },
      });
    }

    return NextResponse.json({ ok: true, order: nextOrder, items: updatedItems, transactions });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
