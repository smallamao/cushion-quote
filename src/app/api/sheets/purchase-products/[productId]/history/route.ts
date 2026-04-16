import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import type {
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseProduct,
  PurchaseProductHistoryItem,
  PurchaseProductHistoryResponse,
  PurchaseProductHistorySummary,
} from "@/lib/types";

const PURCHASE_PRODUCT_SHEET = "採購商品";
const PURCHASE_ORDER_SHEET = "採購單";
const PURCHASE_ITEM_SHEET = "採購單明細";
const SUPPLIER_SHEET = "廠商";

function toNumber(value: string | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function productFromRow(row: string[]): PurchaseProduct {
  return {
    id: row[0] ?? "",
    productCode: row[1] ?? "",
    supplierProductCode: row[13] ?? "",
    productName: row[2] ?? "",
    specification: row[3] ?? "",
    category: (row[4] as PurchaseProduct["category"]) ?? "面料",
    unit: (row[5] as PurchaseProduct["unit"]) ?? "碼",
    supplierId: row[6] ?? "",
    unitPrice: toNumber(row[7]),
    imageUrl: row[8] ?? "",
    notes: row[9] ?? "",
    isActive: row[10] !== "FALSE",
    createdAt: row[11] ?? "",
    updatedAt: row[12] ?? "",
  };
}

function supplierNameFromRow(row: string[]): string {
  return row[2] ?? row[1] ?? row[0] ?? "";
}

function orderFromRow(row: string[]): PurchaseOrder {
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
    status: (row[11] as PurchaseOrder["status"]) ?? "draft",
    deliveryAddress: row[12] ?? "",
    expectedDeliveryDate: row[13] ?? "",
    createdAt: row[14] ?? "",
    updatedAt: row[15] ?? "",
  };
}

function itemFromRow(row: string[]): PurchaseOrderItem {
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
    receivedQuantity: toNumber(row[6]),
    unitPrice: toNumber(row[7]),
    amount: toNumber(row[8]),
    notes: row[9] ?? "",
  };
}

/**
 * GET /api/sheets/purchase-products/[productId]/history
 *
 * Returns purchase history for a specific product
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ productId: string }> }
) {
  const { productId } = await params;

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json(
      { ok: false, error: "Google Sheets 未設定" },
      { status: 503 }
    );
  }

  try {
    // Fetch all required sheets in parallel
    const [productRes, orderRes, itemRes, supplierRes] = await Promise.all([
      client.sheets.spreadsheets.values.get({
        spreadsheetId: client.spreadsheetId,
        range: `${PURCHASE_PRODUCT_SHEET}!A2:M`,
      }),
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

    // Find the product
    const productRows = productRes.data.values ?? [];
    const products = productRows.map(productFromRow);
    const product = products.find((p) => p.id === productId);

    if (!product) {
      return NextResponse.json(
        { ok: false, error: "商品不存在" },
        { status: 404 }
      );
    }

    // Get supplier name
    const supplierRows = supplierRes.data.values ?? [];
    const supplierMap = new Map(
      supplierRows.map((row) => [
        row[0] ?? "",
        supplierNameFromRow(row),
      ])
    );
    const supplierName = supplierMap.get(product.supplierId) || product.supplierId;

    // Find all items for this product
    const itemRows = itemRes.data.values ?? [];
    const allItems = itemRows.map(itemFromRow);
    const productItems = allItems.filter((item) => item.productId === productId);

    if (productItems.length === 0) {
      // No purchase history
        return NextResponse.json<PurchaseProductHistoryResponse>({
          ok: true,
          product: {
            productId: product.id,
          productCode: product.productCode,
          productName: product.productName,
          specification: product.specification,
          unit: product.unit,
          supplierId: product.supplierId,
          supplierName,
        },
        summary: {
          totalPurchases: 0,
          totalQuantity: 0,
          averagePrice: 0,
          lastPurchaseDate: "",
          minPrice: 0,
          maxPrice: 0,
        },
        history: [],
      });
    }

    // Get order details for each item
    const orderRows = orderRes.data.values ?? [];
    const allOrders = orderRows.map(orderFromRow);
    const orderMap = new Map(allOrders.map((o) => [o.orderId, o]));

    // Build history
    const history: PurchaseProductHistoryItem[] = productItems
      .map((item) => {
        const order = orderMap.get(item.orderId);
        if (!order) return null;

        return {
          orderDate: order.orderDate,
          orderId: item.orderId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          amount: item.amount,
          caseId: order.caseId || "",
          caseName: order.caseNameSnapshot || "",
        };
      })
      .filter((h): h is PurchaseProductHistoryItem => h !== null)
      .sort((a, b) => b.orderDate.localeCompare(a.orderDate)); // Sort by date descending

    // Calculate summary
    const totalPurchases = history.length;
    const totalQuantity = history.reduce((sum, h) => sum + h.quantity, 0);
    const prices = history.map((h) => h.unitPrice).filter((p) => p > 0);
    const averagePrice =
      prices.length > 0
        ? Math.round(prices.reduce((sum, p) => sum + p, 0) / prices.length)
        : 0;
    const lastPurchaseDate = history[0]?.orderDate || "";
    const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
    const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;

    const summary: PurchaseProductHistorySummary = {
      totalPurchases,
      totalQuantity,
      averagePrice,
      lastPurchaseDate,
      minPrice,
      maxPrice,
    };

    return NextResponse.json<PurchaseProductHistoryResponse>({
      ok: true,
      product: {
        productId: product.id,
        productCode: product.productCode,
        productName: product.productName,
        specification: product.specification,
        unit: product.unit,
        supplierId: product.supplierId,
        supplierName,
      },
      summary,
      history,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "查詢失敗";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
