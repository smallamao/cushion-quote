import crypto from "node:crypto";

import { NextResponse } from "next/server";

import {
  RANGE_DATA,
  SHEET,
  CACHE_KEY,
  productToRow,
  rowToProduct,
} from "@/lib/purchase-products-sheet";
import { cacheInvalidate } from "@/lib/sheets-cache";
import { getSheetsClient } from "@/lib/sheets-client";
import type { PurchaseProduct } from "@/lib/types";

import { authorizeSchedulerRequest } from "../../purchases/_catalog";

export const dynamic = "force-dynamic";

/**
 * 排程系統建立採購商品（需求 E，2026-09-01）：
 *   POST /api/sheets/products/from-agent
 *   Header: x-api-key（SCHEDULER_API_KEY）
 *
 * 為什麼要這條：目錄缺色號時，唯一能自動建檔的路徑是 from-paste 的 autoCreateMissing，
 * 但那是「開採購單時順便建」——想單純補目錄就會生出不需要的採購單，而且範本由系統挑，
 * 挑錯系列就會把品名與單價整包抄錯（老闆 2026-09-01 SC533-92 案例）。
 *
 * 設計重點：
 * 1. **copyFrom 明確指定範本**：呼叫端說「複製 SC53395」，未指定的欄位（單價／幅寬／
 *    品牌／系列／分類／供應商）一律沿用那一筆 → 不會出現半套資料。
 * 2. **只新增不覆蓋**：同商品編號＋同廠商已存在就回 409，除非明確帶 allowUpdate。
 * 3. **寫完讀回**：回傳的是「重新從表裡讀出來」的資料，不是送進去的 payload
 *    （API 回應常常只是 echo，不代表真的落地——老闆吃過這個虧）。
 * 4. dryRun：只算不寫，先對帳。
 *
 * Body:
 * {
 *   "dryRun": false,
 *   "allowUpdate": false,
 *   "products": [
 *     { "copyFrom": "SC53395", "productCode": "SC53392",
 *       "specification": "533-92 迷霧藍", "colorCode": "533-92",
 *       "colorName": "迷霧藍", "imageUrl": "http://..." }
 *   ]
 * }
 */

const MAX_ITEMS = 50;

interface AgentProductInput {
  copyFrom?: string;
  productCode?: string;
  supplierProductCode?: string;
  productName?: string;
  specification?: string;
  category?: string;
  unit?: string;
  supplierId?: string;
  supplierName?: string;
  widthCm?: number;
  unitPrice?: number;
  listPricePerCai?: number;
  brand?: string;
  series?: string;
  colorCode?: string;
  colorName?: string;
  imageUrl?: string;
  notes?: string;
  isActive?: boolean;
}

/** 忽略大小寫與分隔符號比對商品編號（目錄裡 SC53392 vs 貼上的 SC533-92）。 */
function normalizeCode(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9一-鿿]/g, "");
}

function findByCode(catalog: PurchaseProduct[], code: string): PurchaseProduct | undefined {
  const target = normalizeCode(code);
  if (!target) return undefined;
  return catalog.find((p) => normalizeCode(p.productCode) === target);
}

/** 把呼叫端給的欄位疊到範本上。沒給的欄位沿用範本，缺範本就用安全預設。 */
function buildProduct(
  input: AgentProductInput,
  template: PurchaseProduct | undefined,
  today: string,
): PurchaseProduct {
  const base: PurchaseProduct = template
    ? { ...template }
    : ({
        id: "",
        productCode: "",
        supplierProductCode: "",
        productName: "",
        specification: "",
        category: "其他",
        unit: "碼",
        supplierId: "",
        supplierName: "",
        widthCm: undefined,
        unitPrice: 0,
        costPerCai: 0,
        listPricePerCai: undefined,
        brand: "",
        series: "",
        colorCode: "",
        colorName: "",
        imageUrl: "",
        notes: "",
        isActive: true,
        createdAt: today,
        updatedAt: today,
      } as PurchaseProduct);

  const merged: PurchaseProduct = {
    ...base,
    id: crypto.randomUUID(),
    productCode: input.productCode ?? base.productCode,
    supplierProductCode: input.supplierProductCode ?? input.productCode ?? base.supplierProductCode,
    productName: input.productName ?? base.productName,
    specification: input.specification ?? base.specification,
    category: (input.category ?? base.category) as PurchaseProduct["category"],
    unit: (input.unit ?? base.unit) as PurchaseProduct["unit"],
    supplierId: input.supplierId ?? base.supplierId,
    supplierName: input.supplierName ?? base.supplierName,
    widthCm: input.widthCm ?? base.widthCm,
    unitPrice: input.unitPrice ?? base.unitPrice,
    listPricePerCai: input.listPricePerCai ?? base.listPricePerCai,
    brand: input.brand ?? base.brand,
    series: input.series ?? base.series,
    colorCode: input.colorCode ?? base.colorCode,
    colorName: input.colorName ?? base.colorName,
    imageUrl: input.imageUrl ?? base.imageUrl,
    notes: input.notes ?? (template ? `由 ${template.productCode} 複製建立（排程系統）` : ""),
    isActive: input.isActive ?? true,
    createdAt: today,
    updatedAt: today,
  };
  return merged;
}

export async function POST(request: Request) {
  const denied = authorizeSchedulerRequest(request);
  if (denied) {
    return NextResponse.json({ ok: false, error: denied.error }, { status: denied.status });
  }

  let body: { products?: unknown; dryRun?: unknown; allowUpdate?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "body 不是合法 JSON" }, { status: 400 });
  }

  const inputs = Array.isArray(body.products) ? (body.products as AgentProductInput[]) : [];
  if (inputs.length === 0) {
    return NextResponse.json({ ok: false, error: "products 為必填（陣列）" }, { status: 400 });
  }
  if (inputs.length > MAX_ITEMS) {
    return NextResponse.json({ ok: false, error: `一次最多 ${MAX_ITEMS} 筆` }, { status: 400 });
  }
  const dryRun = body.dryRun === true;
  const allowUpdate = body.allowUpdate === true;

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  const today = new Date().toISOString().slice(0, 10);

  try {
    const res = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: RANGE_DATA,
    });
    const rows = res.data.values ?? [];
    const catalog = rows.map(rowToProduct).filter((p) => p.id);

    const errors: string[] = [];
    const toAppend: PurchaseProduct[] = [];
    const toUpdate: { rowNumber: number; product: PurchaseProduct }[] = [];
    const seen = new Set<string>();

    inputs.forEach((input, idx) => {
      const label = input.productCode || `第 ${idx + 1} 筆`;
      if (!input.productCode?.trim()) {
        errors.push(`${label}：productCode 為必填`);
        return;
      }
      const key = normalizeCode(input.productCode);
      if (seen.has(key)) {
        errors.push(`${label}：同一次請求裡重複出現`);
        return;
      }
      seen.add(key);

      let template: PurchaseProduct | undefined;
      if (input.copyFrom) {
        template = findByCode(catalog, input.copyFrom);
        if (!template) {
          // 指定的範本不存在就停手——不要退而求其次挑一個，那正是抄錯品名單價的來源
          errors.push(`${label}：指定的範本 ${input.copyFrom} 不在目錄中`);
          return;
        }
      }

      const existingIdx = catalog.findIndex(
        (p) => normalizeCode(p.productCode) === key,
      );
      if (existingIdx >= 0 && !allowUpdate) {
        errors.push(`${label}：商品編號已存在（要覆蓋請帶 allowUpdate: true）`);
        return;
      }

      if (existingIdx >= 0) {
        const current = catalog[existingIdx];
        const merged = buildProduct(input, current, today);
        merged.id = current.id;                    // 更新不換 ID
        merged.createdAt = current.createdAt || today;
        toUpdate.push({ rowNumber: existingIdx + 2, product: merged }); // +2：表頭 + 1-indexed
        return;
      }

      if (!template && !input.supplierId) {
        errors.push(`${label}：沒有 copyFrom 就必須給 supplierId`);
        return;
      }
      toAppend.push(buildProduct(input, template, today));
    });

    if (errors.length > 0) {
      return NextResponse.json({ ok: false, errors }, { status: 400 });
    }

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        wouldCreate: toAppend,
        wouldUpdate: toUpdate.map((u) => u.product),
      });
    }

    if (toAppend.length > 0) {
      const startRow = rows.length + 2;
      await client.sheets.spreadsheets.values.update({
        spreadsheetId: client.spreadsheetId,
        range: `${SHEET}!A${startRow}:Y${startRow + toAppend.length - 1}`,
        valueInputOption: "RAW",
        requestBody: { values: toAppend.map(productToRow) },
      });
    }
    for (const { rowNumber, product } of toUpdate) {
      await client.sheets.spreadsheets.values.update({
        spreadsheetId: client.spreadsheetId,
        range: `${SHEET}!A${rowNumber}:Y${rowNumber}`,
        valueInputOption: "RAW",
        requestBody: { values: [productToRow(product)] },
      });
    }
    cacheInvalidate(CACHE_KEY);

    // 🔴 寫完重新讀一次表，回傳「表裡真正長什麼樣」而不是 echo 送進來的 payload。
    const verifyRes = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: RANGE_DATA,
    });
    const after = (verifyRes.data.values ?? []).map(rowToProduct).filter((p) => p.id);
    const wanted = [...toAppend, ...toUpdate.map((u) => u.product)];
    const saved = wanted.map((w) => {
      const found = after.find((p) => p.id === w.id);
      return { productCode: w.productCode, persisted: Boolean(found), product: found ?? null };
    });
    const failed = saved.filter((s) => !s.persisted).map((s) => s.productCode);

    return NextResponse.json(
      {
        ok: failed.length === 0,
        created: toAppend.length,
        updated: toUpdate.length,
        notPersisted: failed,
        saved,
      },
      { status: failed.length === 0 ? 201 : 500 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
