import {
  parsePurchasePasteText,
  resolveParsedLines,
} from "@/lib/purchase-paste-parser";
import type { PurchaseProduct, PurchaseUnit, Supplier } from "@/lib/types";

/**
 * 「排程系統用布量 → 採購單」串接的純運算層。
 *
 * 職責：把貼上的採購清單解析、比對商品目錄，再依「每個 item 的商品供應商」
 * 分組（同一訂單的不同色可能屬於不同供應商，會落在不同組）。
 *
 * 本模組刻意不碰 Google Sheets / react-pdf / server-only，方便單元測試
 * （可用 mock 目錄直接驗證分組結果，不需連網）。
 */

/** 已比對成功、準備寫進採購單的單一品項。 */
export interface FromPasteGroupItem {
  productId: string;
  productCode: string;
  productName: string;
  specification: string;
  qty: number;
  unit: PurchaseUnit;
  unitPrice: number;
  amount: number;
  /** #案件號（來自貼上行），寫進採購單明細備註。 */
  caseRef: string;
  matched: true;
}

/** 單一供應商的採購分組（對應一張採購單）。 */
export interface FromPasteGroup {
  supplierId: string;
  /** 顯示用：簡稱 || 全名 || supplierId。 */
  supplier: string;
  items: FromPasteGroupItem[];
  /** 該組出現過的不重複 #案件號。 */
  caseRefs: string[];
}

/** 未比對到商品目錄的貼上行。 */
export interface FromPasteUnmatched {
  line: string;
  productCode: string;
  reason: string;
}

export interface FromPasteResult {
  groups: FromPasteGroup[];
  unmatched: FromPasteUnmatched[];
  warnings: string[];
}

const UNMATCHED_REASON = "商品目錄查無此色號";

function supplierLabel(
  supplierId: string,
  supplierById: Map<string, Supplier>,
  fallbackName: string,
): string {
  const supplier = supplierById.get(supplierId);
  if (supplier) {
    return supplier.shortName || supplier.name || supplierId;
  }
  return fallbackName || supplierId || "(未知供應商)";
}

/**
 * 解析 → 比對 → 依供應商分組。
 *
 * @param pasteText 採購清單原文（多行）
 * @param catalog   完整（建議：啟用中）採購商品目錄，供跨供應商比對
 * @param suppliers 廠商清單，供組別顯示名稱
 */
export function buildPurchaseGroupsFromPaste(
  pasteText: string,
  catalog: PurchaseProduct[],
  suppliers: Supplier[],
): FromPasteResult {
  const parsed = parsePurchasePasteText(pasteText);
  // 一次比對整批：resolveParsedLines 對「無數量」行輸出 1 筆、對有數量行
  // 輸出 subItems.length 筆，順序與 parsed 相同，故可用游標對回原行。
  const resolved = resolveParsedLines(parsed, catalog);

  const productById = new Map<string, PurchaseProduct>();
  for (const product of catalog) {
    if (product.id) productById.set(product.id, product);
  }
  const supplierById = new Map<string, Supplier>();
  for (const supplier of suppliers) {
    if (supplier.supplierId) supplierById.set(supplier.supplierId, supplier);
  }

  const groupBySupplier = new Map<string, FromPasteGroup>();
  const unmatched: FromPasteUnmatched[] = [];
  const warnings: string[] = [];

  let cursor = 0;
  for (const line of parsed) {
    const count = line.subItems.length === 0 ? 1 : line.subItems.length;
    const slice = resolved.slice(cursor, cursor + count);
    cursor += count;

    // 缺數量：跳過並記 warning（不視為 unmatched，屬於數量問題）。
    if (line.subItems.length === 0) {
      warnings.push(`「${line.raw}」缺少數量，已略過`);
      continue;
    }

    const head = slice[0];
    if (!head || !head.matched) {
      unmatched.push({
        line: line.raw,
        productCode: line.productCode,
        reason: UNMATCHED_REASON,
      });
      continue;
    }

    const product = productById.get(head.productId);
    const supplierId = product?.supplierId ?? "";
    if (!supplierId) {
      // 比對到商品卻查無供應商（資料異常）：記 warning 並跳過，避免建出無主單。
      warnings.push(`「${line.raw}」比對到商品但查無供應商，已略過`);
      continue;
    }

    let group = groupBySupplier.get(supplierId);
    if (!group) {
      group = {
        supplierId,
        supplier: supplierLabel(supplierId, supplierById, product?.supplierName ?? ""),
        items: [],
        caseRefs: [],
      };
      groupBySupplier.set(supplierId, group);
    }

    for (const item of slice) {
      group.items.push({
        productId: item.productId,
        productCode: item.productCode,
        productName: item.productName,
        specification: item.specification,
        qty: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        amount: item.amount,
        caseRef: item.notes,
        matched: true,
      });
    }

    const caseRef = head.notes;
    if (caseRef && !group.caseRefs.includes(caseRef)) {
      group.caseRefs.push(caseRef);
    }

    if (line.warning) {
      warnings.push(`「${line.raw}」：${line.warning}`);
    }
  }

  return {
    groups: Array.from(groupBySupplier.values()),
    unmatched,
    warnings,
  };
}
