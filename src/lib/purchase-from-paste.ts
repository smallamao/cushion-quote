import {
  parsePurchasePasteText,
  resolveParsedLines,
} from "@/lib/purchase-paste-parser";
import type { PurchaseProduct, PurchaseUnit, Supplier } from "@/lib/types";

// ---------------------------------------------------------------------------
// 前綴提取與範本選取（純函式，供 route 呼叫和單元測試）
// ---------------------------------------------------------------------------

/**
 * 從色號萃取「前綴」，規則：
 * - 有連字號（-）：取第一個 `-` 之前的部分（含前面的字母+數字群）
 *   e.g. BBL5-17 → BBL5
 * - 無連字號：取開頭的 字母/中文字 序列，遇數字即停
 *   e.g. 谷806 → 谷、BG114 → BG、谷PVC806 → 谷PVC
 */
export function extractProductPrefix(code: string): string {
  const hyphenIdx = code.indexOf("-");
  if (hyphenIdx > 0) {
    return code.slice(0, hyphenIdx);
  }
  // No hyphen: take leading letter/CJK sequence (stop at first digit)
  const m = code.match(/^[一-龥a-zA-Z]+/u);
  return m ? m[0] : "";
}

/**
 * 在目錄中找「同前綴且啟用中」的範本商品，優先取最近更新者。
 * 找不到同前綴 → 回傳 null（不應自動建立）。
 */
// 一筆商品的所有識別欄位各自的前綴。
// 必須與 resolveParsedLines 比對貼上色號時所用的欄位一致（productCode /
// colorCode / supplierProductCode / specification），否則會「對得到卻複製不出來」：
// 例如 BBL5 系列的 productCode 其實是內部碼（SC…），BBL5-12 是靠 colorCode 對到的，
// 只看 productCode 抽前綴會得到 SC ≠ BBL5 → 找不到範本。
function productPrefixes(p: PurchaseProduct): string[] {
  return [p.productCode, p.colorCode, p.supplierProductCode, p.specification]
    .filter(Boolean)
    .map((s) => extractProductPrefix(String(s)))
    .filter(Boolean);
}

export function findBestTemplate(
  code: string,
  catalog: PurchaseProduct[],
): PurchaseProduct | null {
  const prefix = extractProductPrefix(code);
  if (!prefix) return null;

  // 連字號前綴（SC598-85 → SC598）找不到範本時，退回字母前綴（SC）再找一次；
  // 否則同廠牌新系列第一色永遠建不了檔（排程系統 2026-08-28 驗收案例 SC598-85）。
  const letterPrefix = prefix.match(/^[一-龥a-zA-Z]+/u)?.[0] ?? "";

  const pickNewest = (candidates: PurchaseProduct[]): PurchaseProduct =>
    // Sort by updatedAt descending; stable fallback to productCode lexicographic
    candidates.slice().sort((a, b) => {
      const cmp = b.updatedAt.localeCompare(a.updatedAt);
      return cmp !== 0 ? cmp : a.productCode.localeCompare(b.productCode);
    })[0];

  // 1) 前綴完全相同
  const exact = catalog.filter((p) => p.isActive && productPrefixes(p).includes(prefix));
  if (exact.length > 0) return pickNewest(exact);

  // 2) 🔴 正規化後的前綴（去分隔符）—— 同一系列在目錄裡常常沒有連字號：
  //    貼上 `SC533-92`（前綴 SC533），目錄卻是 `SC53381`（無連字號 → 前綴只抽到 SC）。
  //    步驟 1 對不上就會直接掉到步驟 3，挑到「最近更新的 SC 商品」＝完全不同系列，
  //    而 cloneProductAsNew 會把範本的 productName 與 unitPrice 整包抄過去 → 品名單價全錯。
  //    isExactCatalogMatch 早就用 normalizeIdentifier 忽略分隔符了，這裡補上同一套。
  //    （排程系統 2026-09-01 P6228：SC533-92 挑到 SC51835，老闆要求改複製同系列 SC533）
  const normPrefix = normalizeIdentifier(prefix);
  if (normPrefix) {
    const nearby = catalog.filter(
      (p) =>
        p.isActive &&
        [p.productCode, p.colorCode, p.supplierProductCode, p.specification]
          .filter(Boolean)
          .some((f) => normalizeIdentifier(String(f)).startsWith(normPrefix)),
    );
    if (nearby.length > 0) return pickNewest(nearby);
  }

  // 3) 最後才退回字母前綴（同廠牌新系列第一色）
  if (letterPrefix && letterPrefix !== prefix) {
    const byLetter = catalog.filter(
      (p) => p.isActive && productPrefixes(p).includes(letterPrefix),
    );
    if (byLetter.length > 0) return pickNewest(byLetter);
  }
  return null;
}

/**
 * 將範本整列複製，把所有「識別代碼」欄位都改成 newCode，
 * 並在 notes 標記來源供審計。供應商/單價/單位/分類/品名等沿用範本。
 *
 * 識別欄位＝productCode / colorCode / specification / supplierProductCode。
 * 因為不同系列把色號存在不同欄（例如 BBL5 系列 productCode 是內部碼 GABBL5XX、
 * 真正色號存在 specification），若只換 productCode/colorCode，規格與廠商產品編號
 * 會殘留範本的值（BBL5-17 的規格顯示成範本的 BBL5-04）。全部同步為 newCode 才乾淨。
 *
 * @param template 範本商品（從同前綴取得）
 * @param newCode  缺少的色號（即自動建立的 productCode）
 * @param now      ISO date string (YYYY-MM-DD)，用於 createdAt/updatedAt
 * @param newId    已在外部產生的唯一 ID
 */
export function cloneProductAsNew(
  template: PurchaseProduct,
  newCode: string,
  now: string,
  newId: string,
): PurchaseProduct {
  return {
    ...template,
    id: newId,
    productCode: newCode,
    colorCode: newCode,
    specification: newCode,
    supplierProductCode: newCode,
    notes: `自動由 ${template.productCode} 複製建立`,
    createdAt: now,
    updatedAt: now,
  };
}

/** 廠商名稱正規化：去空白、小寫，讓「綠都GC」「綠都 gc」都對得到 */
function normalizeSupplierName(name: string): string {
  return name.replace(/\s+/g, "").toLowerCase();
}

/**
 * 依「名稱字串」找廠商主檔：簡稱或全名皆可（呼叫端習慣用簡稱如「米盧」「綠都GC」）。
 * 找不到回 null，由呼叫端決定要警告還是拒絕，不可靜默改用目錄值。
 */
export function resolveSupplierByName(name: string, suppliers: Supplier[]): Supplier | null {
  const key = normalizeSupplierName(name);
  if (!key) return null;
  return (
    suppliers.find((s) => s.isActive !== false && normalizeSupplierName(s.shortName) === key) ??
    suppliers.find((s) => s.isActive !== false && normalizeSupplierName(s.name) === key) ??
    suppliers.find((s) => s.isActive !== false && normalizeSupplierName(s.supplierId) === key) ??
    null
  );
}

/** 呼叫端指定的 色號 → 供應商名稱 對照（key 不分大小寫） */
export type SupplierOverrides = Record<string, string>;

export function lookupOverride(code: string, overrides: SupplierOverrides | undefined): string | undefined {
  if (!overrides) return undefined;
  const target = code.trim().toUpperCase();
  for (const [k, v] of Object.entries(overrides)) {
    if (k.trim().toUpperCase() === target && typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

/**
 * 用「指定的供應商」建立缺件商品（排程系統需求 B）。
 * 有同前綴範本：沿用範本的規格／單位／分類／單價，但供應商一律換成指定的；
 * 沒範本：建最小可用的商品（面料、碼、單價 0），供應商用指定的。
 * 絕不從範本繼承供應商——那正是 S6934 開到金揚五金的原因。
 */
export function createProductWithSupplier(
  newCode: string,
  supplier: Supplier,
  template: PurchaseProduct | null,
  now: string,
  newId: string,
): PurchaseProduct {
  const base: PurchaseProduct = template
    ? cloneProductAsNew(template, newCode, now, newId)
    : {
        id: newId,
        productCode: newCode,
        supplierProductCode: newCode,
        productName: newCode,
        specification: newCode,
        category: "面料",
        unit: "碼",
        supplierId: "",
        supplierName: "",
        unitPrice: 0,
        imageUrl: "",
        notes: "",
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };
  return {
    ...base,
    supplierId: supplier.supplierId,
    supplierName: supplier.shortName || supplier.name,
    notes: template
      ? `自動由 ${template.productCode} 複製建立；供應商依呼叫端指定為 ${supplier.shortName || supplier.name}`
      : `自動建立（無同前綴範本）；供應商依呼叫端指定為 ${supplier.shortName || supplier.name}`,
  };
}

/** 自動建立商品的審計記錄（回傳給呼叫端）。 */
export interface AutoCreatedEntry {
  productCode: string;
  /** 複製自哪個範本；無範本時為空字串 */
  copiedFrom: string;
  supplier: string;
  /** 供應商來源：範本繼承 or 呼叫端指定 */
  supplierSource: "template" | "override";
}

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
  /** 這張單實際開給誰（顯示名） */
  supplierUsed: string;
  /** 目錄原本掛的供應商（顯示名；查無為空字串） */
  supplierFromCatalog: string;
  /** 供應商來源 */
  supplierSource: "override" | "catalog" | "autoCreated";
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

/** 呼叫端指定的供應商與目錄不一致（提醒人修主檔用） */
export interface CatalogMismatch {
  productCode: string;
  catalog: string;
  used: string;
  /** 目錄上實際對到的商品（模糊比對時與貼上色號不同） */
  matchedProductCode?: string;
  /** 補充：例如「模糊比對」 */
  note?: string;
}

export interface FromPasteResult {
  groups: FromPasteGroup[];
  unmatched: FromPasteUnmatched[];
  warnings: string[];
  catalogMismatch: CatalogMismatch[];
}

export const UNMATCHED_REASON = "商品目錄查無此色號";
export const OVERRIDE_SUPPLIER_NOT_FOUND = "supplierOverrides 指定的供應商不存在";
/** 模糊比對到「別家廠商」的商品，且呼叫端指定了供應商 → 視為查無（可依指定供應商建檔） */
export const FUZZY_OTHER_SUPPLIER = "模糊比對到他廠商品";

function normalizeIdentifier(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, "");
}

/**
 * 貼上的色號是否「精確」對到該商品（四個識別欄位任一相等，忽略大小寫與分隔符號）。
 * 解析器另有數字模糊比對（2200A21 會對到數字相同的 2200-21），跨廠商時不可信。
 */
export function isExactCatalogMatch(code: string, product: PurchaseProduct): boolean {
  const target = normalizeIdentifier(code);
  if (!target) return false;
  return [product.productCode, product.colorCode, product.supplierProductCode, product.specification]
    .filter(Boolean)
    .some((field) => normalizeIdentifier(String(field)) === target);
}

/** 可以自動建檔的 unmatched 原因（其他原因如「指定廠商不存在」不建） */
export function isAutoCreatableReason(reason: string): boolean {
  return reason === UNMATCHED_REASON || reason.startsWith(FUZZY_OTHER_SUPPLIER);
}

export interface BuildGroupsOptions {
  /** 色號 → 供應商名稱；有指定的色號一律開給指定廠商，忽略目錄 */
  supplierOverrides?: SupplierOverrides;
  /** 本次自動建檔的色號（標記 supplierSource=autoCreated） */
  autoCreatedCodes?: Set<string>;
}

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
  options: BuildGroupsOptions = {},
): FromPasteResult {
  const autoCreatedCodes = new Set([...(options.autoCreatedCodes ?? [])].map((c) => c.toUpperCase()));
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
  const catalogMismatch: CatalogMismatch[] = [];

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
    const catalogSupplierId = product?.supplierId ?? "";
    const catalogSupplierName = catalogSupplierId
      ? supplierLabel(catalogSupplierId, supplierById, product?.supplierName ?? "")
      : "";

    // 呼叫端指定供應商（需求 A）：有指定就用指定的；指定的廠商不存在 → 不靜默改用目錄，
    // 該行進 unmatched 並附原因＋warning。
    let supplierId = catalogSupplierId;
    let supplierSource: FromPasteGroupItem["supplierSource"] = autoCreatedCodes.has(
      line.productCode.toUpperCase(),
    )
      ? "autoCreated"
      : "catalog";
    const overrideName = lookupOverride(line.productCode, options.supplierOverrides);
    if (overrideName) {
      const overrideSupplier = resolveSupplierByName(overrideName, suppliers);
      if (!overrideSupplier) {
        const reason = `${OVERRIDE_SUPPLIER_NOT_FOUND}『${overrideName}』`;
        warnings.push(`supplierOverrides 指定的供應商『${overrideName}』不存在，「${line.raw}」未建單`);
        unmatched.push({ line: line.raw, productCode: line.productCode, reason });
        continue;
      }
      const exact = product ? isExactCatalogMatch(line.productCode, product) : false;
      const usedLabel = supplierLabel(overrideSupplier.supplierId, supplierById, overrideSupplier.shortName);
      if (product && catalogSupplierId && catalogSupplierId !== overrideSupplier.supplierId && !exact) {
        // 只是數字相同的他廠商品，拿它的品名／單價去開指定廠商的單是錯的資料 →
        // 視為查無；createMissingWithSupplier 會用正確色號＋指定廠商建新商品。
        catalogMismatch.push({
          productCode: line.productCode,
          catalog: catalogSupplierName,
          used: usedLabel,
          matchedProductCode: product.productCode,
          note: "模糊比對（目錄無此色號）",
        });
        unmatched.push({
          line: line.raw,
          productCode: line.productCode,
          reason: `${FUZZY_OTHER_SUPPLIER} ${product.productCode}（${catalogSupplierName}），與指定供應商 ${usedLabel} 不符`,
        });
        continue;
      }
      supplierId = overrideSupplier.supplierId;
      supplierSource = "override";
      if (catalogSupplierId && catalogSupplierId !== overrideSupplier.supplierId) {
        catalogMismatch.push({
          productCode: line.productCode,
          catalog: catalogSupplierName,
          used: usedLabel,
          matchedProductCode: product?.productCode,
        });
      }
    }

    if (!supplierId) {
      // 比對到商品卻查無供應商（資料異常）：記 warning 並跳過，避免建出無主單。
      warnings.push(`「${line.raw}」比對到商品但查無供應商，已略過`);
      continue;
    }
    const supplierUsed = supplierLabel(supplierId, supplierById, product?.supplierName ?? "");

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
        supplierUsed,
        supplierFromCatalog: catalogSupplierName,
        supplierSource,
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
    catalogMismatch,
  };
}
