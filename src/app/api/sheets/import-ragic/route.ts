import { promises as fs } from "fs";
import path from "path";

import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import {
  parsePurchaseOrderItemsCsv,
  parsePurchaseOrdersCsv,
  parsePurchaseProductsCsv,
  parseSuppliersCsv,
} from "@/lib/ragic-csv";
import type {
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseProduct,
  Supplier,
} from "@/lib/types";

/**
 * Ragic CSV bulk import.
 *
 * GET  → preview (row counts + first 3 samples per table)
 * POST → execute import into Google Sheets (idempotent by unique id)
 *
 * Source files live in /sample/*.csv at repo root.
 */

const SAMPLE_DIR = path.join(process.cwd(), "sample");
const FILES = {
  suppliers: "廠商.csv",
  products: "採購商品.csv",
  prices: "商品廠商價格.csv",
  orders: "採購單.csv",
  items: "採購細項.csv",
} as const;

const SHEETS = {
  suppliers: { name: "廠商", range: "廠商!A:P", idRange: "廠商!A2:A" },
  products: {
    name: "採購商品",
    range: "採購商品!A:M",
    idRange: "採購商品!A2:A",
  },
  orders: { name: "採購單", range: "採購單!A:P", idRange: "採購單!A2:A" },
  items: {
    name: "採購單明細",
    range: "採購單明細!A:I",
    idRange: "採購單明細!A2:A",
  },
};

async function readSample(file: string): Promise<string> {
  return fs.readFile(path.join(SAMPLE_DIR, file), "utf-8");
}

async function parseAll(): Promise<{
  suppliers: Supplier[];
  products: PurchaseProduct[];
  orders: PurchaseOrder[];
  items: PurchaseOrderItem[];
}> {
  const [suppliersCsv, productsCsv, pricesCsv, ordersCsv, itemsCsv] =
    await Promise.all([
      readSample(FILES.suppliers),
      readSample(FILES.products),
      readSample(FILES.prices),
      readSample(FILES.orders),
      readSample(FILES.items),
    ]);

  return {
    suppliers: parseSuppliersCsv(suppliersCsv),
    products: parsePurchaseProductsCsv(productsCsv, pricesCsv),
    orders: parsePurchaseOrdersCsv(ordersCsv),
    items: parsePurchaseOrderItemsCsv(itemsCsv),
  };
}

function supplierToRow(s: Supplier): string[] {
  return [
    s.supplierId,
    s.name,
    s.shortName,
    s.contactPerson,
    s.phone,
    s.mobile,
    s.fax,
    s.email,
    s.taxId,
    s.address,
    s.paymentMethod,
    s.paymentTerms,
    s.notes,
    s.isActive ? "TRUE" : "FALSE",
    s.createdAt,
    s.updatedAt,
  ];
}

function productToRow(p: PurchaseProduct): string[] {
  return [
    p.id,
    p.productCode,
    p.productName,
    p.specification,
    p.category,
    p.unit,
    p.supplierId,
    String(p.unitPrice),
    p.imageUrl,
    p.notes,
    p.isActive ? "TRUE" : "FALSE",
    p.createdAt,
    p.updatedAt,
  ];
}

function orderToRow(o: PurchaseOrder): string[] {
  return [
    o.orderId,
    o.orderDate,
    o.supplierId,
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

function itemToRow(i: PurchaseOrderItem): string[] {
  return [
    i.itemId,
    i.orderId,
    String(i.sortOrder),
    i.productId,
    JSON.stringify(i.productSnapshot ?? {}),
    String(i.quantity),
    String(i.unitPrice),
    String(i.amount),
    i.notes,
  ];
}

export async function GET() {
  try {
    const parsed = await parseAll();
    return NextResponse.json({
      ok: true,
      mode: "preview",
      counts: {
        suppliers: parsed.suppliers.length,
        products: parsed.products.length,
        orders: parsed.orders.length,
        items: parsed.items.length,
      },
      samples: {
        suppliers: parsed.suppliers.slice(0, 3),
        products: parsed.products.slice(0, 3),
        orders: parsed.orders.slice(0, 3),
        items: parsed.items.slice(0, 3),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json(
      { ok: false, error: "Google Sheets 未設定" },
      { status: 503 }
    );
  }

  const url = new URL(request.url);
  const resetParam = url.searchParams.get("reset") ?? "";
  const resetTargets = new Set(
    resetParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );

  try {
    const parsed = await parseAll();

    // Optional: clear targeted sheets (data rows only, keep header)
    // so re-import refreshes stale snapshots with new parser logic.
    const clearSheet = async (sheetName: string, dataRange: string) => {
      await client.sheets.spreadsheets.values.clear({
        spreadsheetId: client.spreadsheetId,
        range: `${sheetName}!${dataRange}`,
      });
    };

    if (resetTargets.has("suppliers")) {
      await clearSheet(SHEETS.suppliers.name, "A2:P");
    }
    if (resetTargets.has("products")) {
      await clearSheet(SHEETS.products.name, "A2:M");
    }
    if (resetTargets.has("orders")) {
  await clearSheet(SHEETS.orders.name, "A2:P");
    }
    if (resetTargets.has("items")) {
      await clearSheet(SHEETS.items.name, "A2:I");
    }

    // 1. Fetch existing IDs for each sheet to avoid duplicates
    const [existingSuppliersRes, existingProductsRes, existingOrdersRes, existingItemsRes] =
      await Promise.all([
        client.sheets.spreadsheets.values.get({
          spreadsheetId: client.spreadsheetId,
          range: SHEETS.suppliers.idRange,
        }),
        client.sheets.spreadsheets.values.get({
          spreadsheetId: client.spreadsheetId,
          range: SHEETS.products.idRange,
        }),
        client.sheets.spreadsheets.values.get({
          spreadsheetId: client.spreadsheetId,
          range: SHEETS.orders.idRange,
        }),
        client.sheets.spreadsheets.values.get({
          spreadsheetId: client.spreadsheetId,
          range: SHEETS.items.idRange,
        }),
      ]);

    const existingSupplierIds = new Set(
      (existingSuppliersRes.data.values ?? []).flat() as string[]
    );
    const existingProductIds = new Set(
      (existingProductsRes.data.values ?? []).flat() as string[]
    );
    const existingOrderIds = new Set(
      (existingOrdersRes.data.values ?? []).flat() as string[]
    );
    const existingItemIds = new Set(
      (existingItemsRes.data.values ?? []).flat() as string[]
    );

    // 2. Filter out existing records (idempotency)
    const newSuppliers = parsed.suppliers.filter(
      (s) => !existingSupplierIds.has(s.supplierId)
    );
    const newProducts = parsed.products.filter((p) => !existingProductIds.has(p.id));
    const newOrders = parsed.orders.filter((o) => !existingOrderIds.has(o.orderId));
    const newItems = parsed.items.filter((i) => !existingItemIds.has(i.itemId));

    // 3. Append (batched) — Google Sheets API handles ~5000 rows per call fine
    const appendIfNonEmpty = async (range: string, rows: string[][]) => {
      if (rows.length === 0) return;
      await client.sheets.spreadsheets.values.append({
        spreadsheetId: client.spreadsheetId,
        range,
        valueInputOption: "RAW",
        requestBody: { values: rows },
      });
    };

    await appendIfNonEmpty(
      SHEETS.suppliers.range,
      newSuppliers.map(supplierToRow)
    );
    await appendIfNonEmpty(
      SHEETS.products.range,
      newProducts.map(productToRow)
    );
    await appendIfNonEmpty(SHEETS.orders.range, newOrders.map(orderToRow));
    await appendIfNonEmpty(SHEETS.items.range, newItems.map(itemToRow));

    return NextResponse.json({
      ok: true,
      mode: "imported",
      imported: {
        suppliers: newSuppliers.length,
        products: newProducts.length,
        orders: newOrders.length,
        items: newItems.length,
      },
      skipped: {
        suppliers: parsed.suppliers.length - newSuppliers.length,
        products: parsed.products.length - newProducts.length,
        orders: parsed.orders.length - newOrders.length,
        items: parsed.items.length - newItems.length,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
