import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import type { PurchaseOrder, PurchaseOrderItem, PurchaseOrderStatus, PurchaseUnit } from "@/lib/types";

import {
  caseRowToRecord,
  getCaseRows,
  getQuoteRows,
  getVersionRows,
  quoteRowToRecord,
  versionRowToRecord,
} from "../../_v2-utils";

const PURCHASE_ORDER_SHEET = "採購單";
const PURCHASE_ITEM_SHEET = "採購單明細";
const SUPPLIER_SHEET = "廠商";

interface CasePurchaseSummary {
  orderCount: number;
  itemCount: number;
  totalItemAmount: number;
  totalOrderAmount: number;
}

interface CasePurchaseOrderDetail {
  order: PurchaseOrder;
  items: PurchaseOrderItem[];
  supplierName: string;
  itemSubtotal: number;
}

function toNumber(value: string | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function purchaseOrderRowToRecord(row: string[]): PurchaseOrder {
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
    if (row[5]) {
      supplierSnapshot = { ...supplierSnapshot, ...JSON.parse(row[5]) };
    }
  } catch {
    supplierSnapshot = { ...supplierSnapshot };
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

function purchaseItemRowToRecord(row: string[]): PurchaseOrderItem {
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
    productSnapshot = { ...productSnapshot };
  }

  return {
    itemId: row[0] ?? "",
    orderId: row[1] ?? "",
    sortOrder: toNumber(row[2]),
    productId: row[3] ?? "",
    productSnapshot,
    quantity: toNumber(row[5]),
    receivedQuantity: toNumber(row[6]),
    unitPrice: toNumber(row[7]),
    amount: toNumber(row[8]),
    notes: row[9] ?? "",
  };
}

function supplierNameFromRow(row: string[]): string {
  return row[1] ?? row[0] ?? "";
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const { caseId } = await params;

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const [caseRows, quoteRows, versionRows, purchaseOrderRes, purchaseItemRes, supplierRes] = await Promise.all([
      getCaseRows(client),
      getQuoteRows(client),
      getVersionRows(client),
      client.sheets.spreadsheets.values.get({
        spreadsheetId: client.spreadsheetId,
        range: `${PURCHASE_ORDER_SHEET}!A2:P`,
      }),
      client.sheets.spreadsheets.values.get({
        spreadsheetId: client.spreadsheetId,
        range: `${PURCHASE_ITEM_SHEET}!A2:J`,
      }),
      client.sheets.spreadsheets.values.get({
        spreadsheetId: client.spreadsheetId,
        range: `${SUPPLIER_SHEET}!A2:P`,
      }),
    ]);

    const foundCase = caseRows.map(caseRowToRecord).find((record) => record.caseId === caseId);
    if (!foundCase) {
      return NextResponse.json({ ok: false, error: "case not found" }, { status: 404 });
    }

    const quotes = quoteRows
      .map(quoteRowToRecord)
      .filter((quote) => quote.caseId === caseId);
    const versions = versionRows
      .map(versionRowToRecord)
      .filter((version) => version.caseId === caseId);
    const orders = (purchaseOrderRes.data.values ?? [])
      .map(purchaseOrderRowToRecord)
      .filter((order) => order.caseId === caseId)
      .sort((a, b) => b.orderDate.localeCompare(a.orderDate) || b.createdAt.localeCompare(a.createdAt));
    const orderIds = new Set(orders.map((order) => order.orderId));
    const itemsByOrder = new Map<string, PurchaseOrderItem[]>();

    for (const item of (purchaseItemRes.data.values ?? []).map(purchaseItemRowToRecord)) {
      if (!orderIds.has(item.orderId)) continue;
      const existing = itemsByOrder.get(item.orderId) ?? [];
      existing.push(item);
      itemsByOrder.set(item.orderId, existing);
    }

    for (const entry of itemsByOrder.values()) {
      entry.sort((a, b) => a.sortOrder - b.sortOrder);
    }

    const supplierNameMap = new Map(
      (supplierRes.data.values ?? [])
        .map((row) => [row[0] ?? "", supplierNameFromRow(row)] as const)
        .filter(([supplierId]) => Boolean(supplierId)),
    );

    const purchases: CasePurchaseOrderDetail[] = orders.map((order) => {
      const items = itemsByOrder.get(order.orderId) ?? [];
      return {
        order,
        items,
        supplierName:
          order.supplierSnapshot.shortName ||
          order.supplierSnapshot.name ||
          supplierNameMap.get(order.supplierId) ||
          order.supplierId,
        itemSubtotal: items.reduce((sum, item) => sum + item.amount, 0),
      };
    });

    const purchaseSummary: CasePurchaseSummary = {
      orderCount: purchases.length,
      itemCount: purchases.reduce((sum, purchase) => sum + purchase.items.length, 0),
      totalItemAmount: purchases.reduce((sum, purchase) => sum + purchase.itemSubtotal, 0),
      totalOrderAmount: purchases.reduce((sum, purchase) => sum + purchase.order.totalAmount, 0),
    };

    return NextResponse.json({
      case: foundCase,
      quotes: quotes.map((quote) => ({
        quote,
        versions: versions.filter((version) => version.quoteId === quote.quoteId),
      })),
      purchaseSummary,
      purchases,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
