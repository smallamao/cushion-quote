import { NextResponse } from "next/server";

import { findBestTemplate, isExactCatalogMatch } from "@/lib/purchase-from-paste";
import { parsePurchasePasteText, resolveParsedLines } from "@/lib/purchase-paste-parser";
import { getSheetsClient } from "@/lib/sheets-client";
import type { PurchaseProduct, Supplier } from "@/lib/types";

import { authorizeSchedulerRequest, loadCatalogAndSuppliers } from "../../purchases/_catalog";

export const dynamic = "force-dynamic";

/**
 * 排程系統建單前的唯讀查詢（需求 C）：
 *   GET /api/sheets/products/lookup?codes=2200A21,GC31606,ABU1038A-102
 *   Header: x-api-key（SCHEDULER_API_KEY）
 *
 * 比對規則與 from-paste 完全相同（同一個解析器），所以這裡看到什麼，建單就會對到什麼。
 * 每個色號回：有沒有對到、精確還是模糊、對到哪個商品／哪個供應商；查無時 autoCreateMissing
 * 會複製哪個範本、會繼承誰。呼叫端拿這個跟自己的正確對照表比，送單前就能發現問題。
 */

const MAX_CODES = 200;

function supplierDisplay(supplierId: string, supplierById: Map<string, Supplier>, fallback = ""): string {
  const s = supplierById.get(supplierId);
  return s ? s.shortName || s.name || supplierId : fallback || supplierId;
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
    const productById = new Map(active.map((p) => [p.id, p]));

    // 與 from-paste 同一條路：每個色號組成一行「色號 1y」丟給解析器比對
    const parsed = parsePurchasePasteText(codes.map((c) => `${c} 1y`).join("\n"));
    const resolved = resolveParsedLines(parsed, active);

    const products = codes.map((code, idx) => {
      const hit = resolved[idx];
      const product: PurchaseProduct | undefined = hit?.matched ? productById.get(hit.productId) : undefined;
      if (product) {
        const exact = isExactCatalogMatch(code, product);
        return {
          code,
          exists: true,
          /** exact＝色號就在目錄；fuzzy＝解析器數字／規格模糊對到的，跨廠商時請用 supplierOverrides */
          matchType: exact ? "exact" : "fuzzy",
          productId: product.id,
          productCode: product.productCode,
          productName: product.productName,
          specification: product.specification,
          unit: product.unit,
          supplierId: product.supplierId || null,
          supplierName: product.supplierId
            ? supplierDisplay(product.supplierId, supplierById, product.supplierName)
            : null,
          supplierFullName: supplierById.get(product.supplierId)?.name ?? null,
          inactiveMatch: false,
          template: null,
        };
      }
      const inactiveHit = catalog.find((p) => !p.isActive && isExactCatalogMatch(code, p));
      const template = findBestTemplate(code, active);
      return {
        code,
        exists: false,
        matchType: null,
        productId: null,
        productCode: null,
        productName: null,
        specification: null,
        unit: null,
        supplierId: null,
        supplierName: null,
        supplierFullName: null,
        /** 目錄有但已停用（from-paste 會當查無） */
        inactiveMatch: Boolean(inactiveHit),
        /** autoCreateMissing 會複製的範本與「會繼承」的供應商；null＝建不了檔（除非 createMissingWithSupplier） */
        template: template
          ? {
              productCode: template.productCode,
              supplierId: template.supplierId || null,
              supplierName: template.supplierId
                ? supplierDisplay(template.supplierId, supplierById, template.supplierName)
                : null,
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
