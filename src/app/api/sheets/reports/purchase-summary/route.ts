import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import type { PurchaseProductCategory } from "@/lib/types";

const ORDER_SHEET = "採購單";
const ITEM_SHEET = "採購單明細";
const PRODUCT_SHEET = "採購商品";
const ORDER_RANGE = `${ORDER_SHEET}!A2:P`;
const ITEM_RANGE = `${ITEM_SHEET}!A2:J`;
const PRODUCT_RANGE = `${PRODUCT_SHEET}!A2:O`;

interface ProductSummary {
  productId: string;
  productCode: string;
  supplierProductCode: string;
  productName: string;
  specification: string;
  category: PurchaseProductCategory | "其他";
  unit: string;
  supplierId: string;
  supplierName: string;
  totalQuantity: number;
  totalAmount: number;
  orderCount: number;
  avgUnitPrice: number;
}

interface PurchaseSummaryResponse {
  ok: boolean;
  from: string;
  to: string;
  totalAmount: number;
  totalQuantity: number;
  orderCount: number;
  products: ProductSummary[];
  byCategory: Array<{ category: string; totalAmount: number; totalQuantity: number }>;
  bySupplier: Array<{ supplierId: string; supplierName: string; totalAmount: number; orderCount: number }>;
}

/**
 * 正規化日期: 把 2026/04/14, 2026-4-14 等格式統一成 YYYY-MM-DD
 */
function normalizeDate(raw: string): string {
  if (!raw) return "";
  const m = raw
    .trim()
    .replaceAll("/", "-")
    .match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return "";
  const [, y, mo, d] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function monthBounds(yyyymm: string): { from: string; to: string } {
  const [y, m] = yyyymm.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const last = new Date(Date.UTC(y, m, 0));
  const pad = (n: number) => n.toString().padStart(2, "0");
  return {
    from: `${first.getUTCFullYear()}-${pad(first.getUTCMonth() + 1)}-${pad(first.getUTCDate())}`,
    to: `${last.getUTCFullYear()}-${pad(last.getUTCMonth() + 1)}-${pad(last.getUTCDate())}`,
  };
}

function yearBounds(year: string): { from: string; to: string } {
  return {
    from: `${year}-01-01`,
    to: `${year}-12-31`,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const monthParam = searchParams.get("month"); // YYYY-MM
  const yearParam = searchParams.get("year");
  let from = searchParams.get("from") ?? "";
  let to = searchParams.get("to") ?? "";

  if (monthParam) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam)) {
      return NextResponse.json(
        { ok: false, error: "month 格式錯誤，需為 YYYY-MM" },
        { status: 400 },
      );
    }

    const bounds = monthBounds(monthParam);
    from = bounds.from;
    to = bounds.to;
  } else if (yearParam) {
    if (!/^\d{4}$/.test(yearParam)) {
      return NextResponse.json(
        { ok: false, error: "year 格式錯誤，需為 YYYY" },
        { status: 400 },
      );
    }

    const bounds = yearBounds(yearParam);
    from = bounds.from;
    to = bounds.to;
  }

  if (!from || !to) {
    // 預設本月
    const now = new Date();
    const yyyymm = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, "0")}`;
    const bounds = monthBounds(yyyymm);
    from = bounds.from;
    to = bounds.to;
  }

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json(
      { ok: false, error: "Google Sheets 未設定" },
      { status: 503 },
    );
  }

  try {
    const [orderRes, itemRes, productRes] = await Promise.all([
      client.sheets.spreadsheets.values.get({
        spreadsheetId: client.spreadsheetId,
        range: ORDER_RANGE,
      }),
      client.sheets.spreadsheets.values.get({
        spreadsheetId: client.spreadsheetId,
        range: ITEM_RANGE,
      }),
      client.sheets.spreadsheets.values.get({
        spreadsheetId: client.spreadsheetId,
        range: PRODUCT_RANGE,
      }),
    ]);

    const orderRows = orderRes.data.values ?? [];
    const itemRows = itemRes.data.values ?? [];
    const productRows = productRes.data.values ?? [];

    // 解析訂單: 取出 orderId → { date, supplierId, status, supplierName }
    // 欄位: A訂單號 B日期 C廠商 D案件 E案件名 F廠商快照 G-J金額 K附註 L狀態 ...
    interface OrderMeta {
      orderId: string;
      date: string;
      supplierId: string;
      supplierName: string;
      status: string;
    }
    const orderMetaById = new Map<string, OrderMeta>();
    for (const row of orderRows) {
      const isLegacy = row.length <= 14 || (row[3] ?? "").trim().startsWith("{");
      const orderId = row[0] ?? "";
      if (!orderId) continue;
      const date = normalizeDate(row[1] ?? "");
      const supplierId = row[2] ?? "";
      let supplierName = "";
      try {
        const snapshotRaw = isLegacy ? row[3] : row[5];
        if (snapshotRaw) {
          const snap = JSON.parse(snapshotRaw) as { name?: string; shortName?: string };
          supplierName = snap.shortName || snap.name || "";
        }
      } catch {
        /* ignore */
      }
      const status = row[isLegacy ? 9 : 11] ?? "draft";
      orderMetaById.set(orderId, { orderId, date, supplierId, supplierName, status });
    }

    // 解析商品表 (productId → category / productCode / productName / supplierId)
    interface ProductMeta {
      id: string;
      productCode: string;
      supplierProductCode: string;
      productName: string;
      specification: string;
      category: PurchaseProductCategory | "其他";
      unit: string;
      supplierId: string;
    }
    const productMetaById = new Map<string, ProductMeta>();
    for (const row of productRows) {
      const id = row[0] ?? "";
      if (!id) continue;
      productMetaById.set(id, {
        id,
        productCode: row[1] ?? "",
        productName: row[2] ?? "",
        specification: row[3] ?? "",
        category: (row[4] as PurchaseProductCategory) ?? "其他",
        unit: row[5] ?? "碼",
        supplierId: row[6] ?? "",
        supplierProductCode: row[14] ?? "",
      });
    }

    // 聚合: 掃明細,依 productId 匯總 qty/amount
    const acc = new Map<string, ProductSummary>();
    const countedOrderIds = new Set<string>();
    const ordersInRange = new Set<string>();

    for (const row of itemRows) {
      const isLegacy = row.length <= 9;
      const orderId = row[1] ?? "";
      const meta = orderMetaById.get(orderId);
      if (!meta) continue;
      if (meta.status === "cancelled") continue;
      if (!meta.date || meta.date < from || meta.date > to) continue;
      ordersInRange.add(orderId);

      const productId = row[3] ?? "";
      const quantity = Number(row[5] ?? 0) || 0;
      const unitPrice = Number(row[isLegacy ? 6 : 7] ?? 0) || 0;
      const amount = Number(row[isLegacy ? 7 : 8] ?? 0) || quantity * unitPrice;

      // 品項快照 (col E index 4)
      let snap: Partial<ProductMeta> = {};
      try {
        if (row[4]) {
          const parsed = JSON.parse(row[4]) as Partial<ProductMeta>;
          snap = parsed;
        }
      } catch {
        /* ignore */
      }

      // 組合 key: productId 優先,沒 productId 的用 productCode+supplier
      const product = productMetaById.get(productId);
      const key =
        productId ||
        `${snap.productCode ?? ""}-${meta.supplierId}`;
      if (!key.trim()) continue;

      const existing = acc.get(key);
      if (existing) {
        existing.totalQuantity += quantity;
        existing.totalAmount += amount;
        const orderCountKey = `${key}|${orderId}`;
        if (!countedOrderIds.has(orderCountKey)) {
          existing.orderCount += 1;
          countedOrderIds.add(orderCountKey);
        }
      } else {
        acc.set(key, {
          productId: productId,
          productCode: product?.productCode ?? snap.productCode ?? "",
          supplierProductCode: product?.supplierProductCode ?? "",
          productName: product?.productName ?? snap.productName ?? "",
          specification: product?.specification ?? snap.specification ?? "",
          category: product?.category ?? "其他",
          unit: product?.unit ?? snap.unit ?? "碼",
          supplierId: product?.supplierId ?? meta.supplierId,
          supplierName: meta.supplierName,
          totalQuantity: quantity,
          totalAmount: amount,
          orderCount: 1,
          avgUnitPrice: 0,
        });
        countedOrderIds.add(`${key}|${orderId}`);
      }
    }

    // 計算平均單價
    const products: ProductSummary[] = [];
    for (const s of acc.values()) {
      s.avgUnitPrice = s.totalQuantity > 0 ? s.totalAmount / s.totalQuantity : 0;
      products.push(s);
    }
    products.sort((a, b) => b.totalAmount - a.totalAmount);

    // 類別彙總
    const byCategoryMap = new Map<string, { totalAmount: number; totalQuantity: number }>();
    for (const p of products) {
      const existing = byCategoryMap.get(p.category) ?? { totalAmount: 0, totalQuantity: 0 };
      existing.totalAmount += p.totalAmount;
      existing.totalQuantity += p.totalQuantity;
      byCategoryMap.set(p.category, existing);
    }
    const byCategory = Array.from(byCategoryMap.entries())
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.totalAmount - a.totalAmount);

    // 廠商彙總
    const bySupplierMap = new Map<
      string,
      { supplierName: string; totalAmount: number; orderCount: number }
    >();
    for (const orderId of ordersInRange) {
      const meta = orderMetaById.get(orderId);
      if (!meta) continue;
      const existing = bySupplierMap.get(meta.supplierId) ?? {
        supplierName: meta.supplierName || meta.supplierId,
        totalAmount: 0,
        orderCount: 0,
      };
      existing.orderCount += 1;
      bySupplierMap.set(meta.supplierId, existing);
    }
    // 補金額
    for (const p of products) {
      const entry = bySupplierMap.get(p.supplierId);
      if (entry) entry.totalAmount += p.totalAmount;
    }
    const bySupplier = Array.from(bySupplierMap.entries())
      .map(([supplierId, v]) => ({ supplierId, ...v }))
      .sort((a, b) => b.totalAmount - a.totalAmount);

    const response: PurchaseSummaryResponse = {
      ok: true,
      from,
      to,
      totalAmount: products.reduce((s, p) => s + p.totalAmount, 0),
      totalQuantity: products.reduce((s, p) => s + p.totalQuantity, 0),
      orderCount: ordersInRange.size,
      products,
      byCategory,
      bySupplier,
    };

    return NextResponse.json(response);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "產生報表失敗";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
