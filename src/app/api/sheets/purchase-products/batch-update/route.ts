import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import type { PurchaseProduct } from "@/lib/types";
import {
  calculateAdjustedPrice,
  validateAdjustedPrice,
  validatePriceAdjustment,
} from "@/lib/purchase-product-price";

const PURCHASE_PRODUCT_SHEET = "採購商品";

const UPDATED_AT_COLUMN = "M";

interface BatchUpdateRequest {
  productIds: string[];
  selectedProducts?: Array<{
    id: string;
    productCode: string;
    productName: string;
    specification: string;
    supplierId: string;
    unitPrice: number;
    createdAt: string;
    updatedAt: string;
  }>;
  adjustment: {
    mode: "fixed" | "percentage" | "absolute";
    value: number;
    isIncrease?: boolean; // only for fixed/percentage
  };
}

interface UpdateResult {
  productId: string;
  productCode: string;
  oldPrice: number;
  newPrice: number;
}

function matchesSelectedProduct(
  product: PurchaseProduct,
  selectedProduct: NonNullable<BatchUpdateRequest["selectedProducts"]>[number],
): boolean {
  return (
    product.id === selectedProduct.id &&
    product.productCode === selectedProduct.productCode &&
    product.productName === selectedProduct.productName &&
    product.specification === selectedProduct.specification &&
    product.supplierId === selectedProduct.supplierId &&
    product.unitPrice === selectedProduct.unitPrice &&
    product.createdAt === selectedProduct.createdAt &&
    product.updatedAt === selectedProduct.updatedAt
  );
}

function rowToProduct(row: string[], rowIndex: number): PurchaseProduct & { rowIndex: number } {
  return {
    rowIndex,
    id: row[0] ?? "",
    productCode: row[1] ?? "",
    supplierProductCode: row[13] ?? "",
    productName: row[2] ?? "",
    specification: row[3] ?? "",
    category: (row[4] as PurchaseProduct["category"]) ?? "面料",
    unit: (row[5] as PurchaseProduct["unit"]) ?? "碼",
    supplierId: row[6] ?? "",
    unitPrice: Number(row[7]) || 0,
    imageUrl: row[8] ?? "",
    notes: row[9] ?? "",
    isActive: row[10] !== "FALSE",
    createdAt: row[11] ?? "",
    updatedAt: row[12] ?? "",
  };
}

/**
 * POST /api/sheets/purchase-products/batch-update
 *
 * Batch update unit prices for multiple products
 */
export async function POST(request: Request) {
  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json(
      { ok: false, error: "Google Sheets 未設定" },
      { status: 503 }
    );
  }

  try {
    const body = (await request.json()) as BatchUpdateRequest;
    const productIds = Array.from(new Set(body.productIds ?? []));
    const selectedProducts = body.selectedProducts ?? [];
    const adjustment = body.adjustment;

    // Validation
    if (!productIds || productIds.length === 0) {
      return NextResponse.json(
        { ok: false, error: "未選擇任何商品" },
        { status: 400 }
      );
    }

    if (productIds.length > 100) {
      return NextResponse.json(
        { ok: false, error: "單次最多更新 100 筆商品" },
        { status: 400 }
      );
    }

    if (!adjustment || !adjustment.mode || adjustment.value === undefined) {
      return NextResponse.json(
        { ok: false, error: "調整參數無效" },
        { status: 400 }
      );
    }

    const adjustmentError = validatePriceAdjustment(adjustment);
    if (adjustmentError) {
      return NextResponse.json(
        { ok: false, error: adjustmentError },
        { status: 400 },
      );
    }

    if (
      (adjustment.mode === "fixed" || adjustment.mode === "percentage") &&
      adjustment.isIncrease === undefined
    ) {
      return NextResponse.json(
        { ok: false, error: "請提供漲價或降價方向" },
        { status: 400 },
      );
    }

    // Fetch all products
    const response = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: `${PURCHASE_PRODUCT_SHEET}!A2:M`,
    });

    const rows = response.data.values ?? [];
    const allProducts = rows.map((row, idx) => rowToProduct(row, idx + 2)).filter((product) => product.id);

    // Filter products to update
    const productsToUpdate = selectedProducts.length > 0
      ? allProducts.filter((product) =>
          selectedProducts.some((selectedProduct) => matchesSelectedProduct(product, selectedProduct)),
        )
      : allProducts.filter((product) => productIds.includes(product.id));

    if (productsToUpdate.length === 0) {
      return NextResponse.json(
        { ok: false, error: "找不到符合的商品" },
        { status: 404 }
      );
    }

    const expectedMatchCount = selectedProducts.length > 0 ? selectedProducts.length : productIds.length;

    if (productsToUpdate.length !== expectedMatchCount) {
      const missingProducts = selectedProducts.length > 0
        ? selectedProducts.filter(
            (selectedProduct) =>
              !productsToUpdate.some((product) => matchesSelectedProduct(product, selectedProduct)),
          )
        : productIds
            .filter((productId) => !productsToUpdate.some((product) => product.id === productId))
            .map((productId) => ({ id: productId }));

      return NextResponse.json(
        {
          ok: false,
          error: `找不到部分商品：${missingProducts.map((product) => product.id).join(", ")}`,
        },
        { status: 404 },
      );
    }

    // Calculate new prices
    const now = new Date().toISOString().slice(0, 10);
    const updates: Array<{ rowIndex: number; newPrice: number }> = [];
    const results: UpdateResult[] = [];

    for (const product of productsToUpdate) {
      const currentPrice = product.unitPrice ?? 0;
      const newPrice = calculateAdjustedPrice(currentPrice, adjustment);

      // Validate new price
      const priceError = validateAdjustedPrice(newPrice);
      if (priceError) {
        return NextResponse.json(
          { ok: false, error: `商品 ${product.productCode}${priceError}` },
          { status: 400 },
        );
      }

      updates.push({
        rowIndex: product.rowIndex,
        newPrice,
      });

      results.push({
        productId: product.id,
        productCode: product.productCode,
        oldPrice: currentPrice,
        newPrice,
      });
    }

    // Batch update Google Sheets (column H = index 7, unitPrice)
    const batchData = updates.map((u) => ({
      range: `${PURCHASE_PRODUCT_SHEET}!H${u.rowIndex}`,
      values: [[u.newPrice]],
    }));

    const updatedAtBatchData = updates.map((u) => ({
      range: `${PURCHASE_PRODUCT_SHEET}!${UPDATED_AT_COLUMN}${u.rowIndex}`,
      values: [[now]],
    }));

    await client.sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: client.spreadsheetId,
      requestBody: {
        data: [...batchData, ...updatedAtBatchData],
        valueInputOption: "RAW",
      },
    });

    return NextResponse.json({
      ok: true,
      updatedCount: updates.length,
      results,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "批量更新失敗";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
