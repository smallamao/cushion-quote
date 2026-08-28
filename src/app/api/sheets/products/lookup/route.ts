import { NextResponse } from "next/server";

import { findBestTemplate } from "@/lib/purchase-from-paste";
import { getSheetsClient } from "@/lib/sheets-client";
import type { PurchaseProduct, Supplier } from "@/lib/types";

import { authorizeSchedulerRequest, loadCatalogAndSuppliers } from "../../purchases/_catalog";

export const dynamic = "force-dynamic";

/**
 * 排程系統建單前的唯讀查詢（需求 C）：
 *   GET /api/sheets/products/lookup?codes=2200A21,GC31606,ABU1038A-102
 *   Header: x-api-key（SCHEDULER_API_KEY）
 *
 * 每個色號回：目錄有沒有、掛哪個供應商、若查無時 autoCreateMissing 會複製哪個範本／繼承誰。
 * 呼叫端拿這個跟自己的「正確對照表」比，送單前就能發現目錄掛錯或會繼承錯廠商。
 */

const MAX_CODES = 200;

function supplierDisplay(supplierId: string, supplierById: Map<string, Supplier>, fallback = ""): string {
  const s = supplierById.get(supplierId);
  return s ? s.shortName || s.name || supplierId : fallback || supplierId;
}

/** 與 from-paste 同一組識別欄位：productCode / colorCode / supplierProductCode / specification（不分大小寫） */
function findExact(code: string, catalog: PurchaseProduct[]): { product: PurchaseProduct; matchedBy: string } | null {
  const target = code.trim().toUpperCase();
  const fields: Array<[keyof PurchaseProduct, string]> = [
    ["productCode", "productCode"],
    ["colorCode", "colorCode"],
    ["supplierProductCode", "supplierProductCode"],
    ["specification", "specification"],
  ];
  for (const [field, label] of fields) {
    const hit = catalog.find((p) => String(p[field] ?? "").trim().toUpperCase() === target);
    if (hit) return { product: hit, matchedBy: label };
  }
  return null;
}

export async function GET(request: Request) {
  const denied = authorizeSchedulerRequest(request);
  if (denied) return NextResponse.json({ success: false, error: denied.error }, { status: denied.status });

  const url = new URL(request.url);
  const codes = (url.searchParams.get("codes") ?? "")
    .split(/[,\s]+/)
    .map((c) => c.trim())
    .filter(Boolean);
  if (codes.length === 0) {
    return NextResponse.json({ success: false, error: "codes 為必填（逗號分隔）" }, { status: 400 });
  }
  if (codes.length > MAX_CODES) {
    return NextResponse.json({ success: false, error: `一次最多 ${MAX_CODES} 個色號` }, { status: 400 });
  }

  const client = await getSheetsClient();
  if (!client) return NextResponse.json({ success: false, error: "Google Sheets 未設定" }, { status: 503 });

  try {
    const { catalog, suppliers } = await loadCatalogAndSuppliers(client, { includeInactive: true });
    const active = catalog.filter((p) => p.isActive);
    const supplierById = new Map(suppliers.map((s) => [s.supplierId, s]));

    const products = codes.map((code) => {
      const activeHit = findExact(code, active);
      if (activeHit) {
        const p = activeHit.product;
        return {
          code,
          exists: true,
          productId: p.id,
          productCode: p.productCode,
          productName: p.productName,
          unit: p.unit,
          supplierId: p.supplierId || null,
          supplierName: p.supplierId ? supplierDisplay(p.supplierId, supplierById, p.supplierName) : null,
          supplierFullName: supplierById.get(p.supplierId)?.name ?? null,
          matchedBy: activeHit.matchedBy,
          inactiveMatch: false,
          template: null,
        };
      }
      const inactiveHit = findExact(code, catalog);
      const template = findBestTemplate(code, active);
      return {
        code,
        exists: false,
        productId: null,
        productCode: null,
        productName: null,
        unit: null,
        supplierId: null,
        supplierName: null,
        supplierFullName: null,
        matchedBy: null,
        /** 目錄有但已停用（from-paste 會當查無） */
        inactiveMatch: Boolean(inactiveHit),
        /** autoCreateMissing 會複製的範本與「會繼承」的供應商；null＝建不了檔 */
        template: template
          ? {
              productCode: template.productCode,
              supplierId: template.supplierId || null,
              supplierName: template.supplierId ? supplierDisplay(template.supplierId, supplierById, template.supplierName) : null,
            }
          : null,
      };
    });

    return NextResponse.json({
      success: true,
      products,
      suppliers: suppliers
        .filter((s) => s.isActive !== false)
        .map((s) => ({ supplierId: s.supplierId, name: s.name, shortName: s.shortName })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
