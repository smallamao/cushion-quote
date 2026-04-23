import type { PurchaseProduct, Supplier } from "@/lib/types";

/**
 * Supplier detector
 *
 * 從一組商品編號 (parser 解析出來的) 推斷它們最可能屬於哪個廠商,
 * 透過比對既有商品庫的編號前綴 + 既有編號精確匹配。
 *
 * 策略:
 *   1. 若 productCode 在商品庫已有完全匹配 → 直接用該商品的 supplierId (高信心)
 *   2. 若沒精確匹配,取前綴 (數字之前的英文字母+數字組合的「字根」),
 *      找商品庫裡同前綴的商品,看它們屬於哪個廠商
 *   3. 多筆編號各自投票,得票最高者為偵測結果
 *   4. 若有衝突 (>= 2 個 supplier 都有票),回傳 conflict + 多數那一個
 */

export interface DetectedSupplier {
  supplierId: string;
  /** 該 supplier 收到的票數 */
  votes: number;
  /** 總共有效投票數 (有對應到任何 supplier 的編號數) */
  totalVotes: number;
  /** 是否有衝突 (>=2 個 supplier 都有票) */
  conflict: boolean;
  /** 衝突時其他 supplier 的票數分布 */
  conflictDetail?: Array<{ supplierId: string; votes: number }>;
}

export interface DetectionResult {
  /** 偵測到的廠商 (信心最高的);若完全沒匹配則為 null */
  detected: DetectedSupplier | null;
  /** 完全沒匹配到任何 supplier 的編號 */
  unmatchedCodes: string[];
}

/**
 * 把編號正規化成 prefix。
 * "LY9805"   → "LY"
 * "LY3139-5" → "LY"
 * "ABU100009" → "ABU"
 * "勝3925"    → "勝"
 * "彩虹皮8852" → "彩虹皮"
 * "S6901"    → "S"
 *
 * 規則:取最前面連續的非數字字元 (含中英文)。
 */
function extractPrefix(code: string): string {
  const trimmed = code.trim();
  if (!trimmed) return "";
  // 取最前面的非數字字元 (Unicode 屬性);若整串都是數字則回傳整串
  const m = trimmed.match(/^[^\d]+/u);
  return (m?.[0] ?? trimmed).toLowerCase();
}

/**
 * Extract the alphabetic "stem" from a productCode, including CJK.
 * Used to compare paste prefix against a supplier's shortName / name.
 * Goes further than extractPrefix: strips trailing digits/punctuation too.
 *
 *   "JR5832"   → "jr"
 *   "勝598-85" → "勝"
 *   "SC59885"  → "sc"
 */
function extractAlphabeticStem(code: string): string {
  return code.trim().toLowerCase().replace(/[\d\W_]+/gu, "").slice(0, 8);
}

/**
 * 主偵測函式。
 *
 * @param codes     paste 解析出來的商品編號清單
 * @param catalog   現有商品庫
 * @param suppliers 現有廠商清單 (可選)。若提供,當商品庫找不到對應前綴時,
 *                  會嘗試以廠商 shortName / name 做前綴比對 — 解決「廠商剛建好、
 *                  尚未建立任何商品」導致偵測失敗的情境。
 */
export function detectSupplierFromCodes(
  codes: readonly string[],
  catalog: readonly PurchaseProduct[],
  suppliers: readonly Supplier[] = [],
): DetectionResult {
  if (codes.length === 0) {
    return { detected: null, unmatchedCodes: [] };
  }

  // 預先建索引
  const exactByCode = new Map<string, PurchaseProduct>();
  const prefixToSuppliers = new Map<string, Map<string, number>>(); // prefix → supplierId → count

  for (const p of catalog) {
    if (!p.isActive) continue;
    exactByCode.set(p.productCode.toLowerCase(), p);

    const prefix = extractPrefix(p.productCode);
    if (!prefix) continue;
    if (!prefixToSuppliers.has(prefix)) {
      prefixToSuppliers.set(prefix, new Map());
    }
    const counts = prefixToSuppliers.get(prefix)!;
    counts.set(p.supplierId, (counts.get(p.supplierId) ?? 0) + 1);
  }

  // Secondary: 廠商 shortName / name 索引 (用來處理「新廠商、沒商品」情境)
  const activeSuppliers = suppliers.filter((s) => s.isActive);

  function findSupplierByName(prefixLower: string): Supplier | null {
    if (!prefixLower) return null;
    for (const s of activeSuppliers) {
      const shortLower = (s.shortName ?? "").toLowerCase();
      const nameLower = (s.name ?? "").toLowerCase();
      if (!shortLower && !nameLower) continue;
      if (
        (shortLower && (shortLower === prefixLower ||
          shortLower.startsWith(prefixLower) ||
          prefixLower.startsWith(shortLower))) ||
        (nameLower && nameLower.includes(prefixLower))
      ) {
        return s;
      }
    }
    return null;
  }

  // 逐筆編號投票
  const supplierVotes = new Map<string, number>();
  const unmatchedCodes: string[] = [];

  for (const rawCode of codes) {
    const code = rawCode.trim();
    if (!code) continue;

    // 1. 精確匹配 (最高信心,給 2 票)
    const exact = exactByCode.get(code.toLowerCase());
    if (exact) {
      supplierVotes.set(exact.supplierId, (supplierVotes.get(exact.supplierId) ?? 0) + 2);
      continue;
    }

    // 2. 商品庫同前綴匹配
    const prefix = extractPrefix(code);
    if (!prefix) {
      unmatchedCodes.push(code);
      continue;
    }
    const candidates = prefixToSuppliers.get(prefix);
    if (candidates && candidates.size > 0) {
      // 該前綴最多商品的 supplier 拿到一票
      let bestSupplier = "";
      let bestCount = 0;
      for (const [sId, cnt] of candidates) {
        if (cnt > bestCount) {
          bestCount = cnt;
          bestSupplier = sId;
        }
      }
      if (bestSupplier) {
        supplierVotes.set(bestSupplier, (supplierVotes.get(bestSupplier) ?? 0) + 1);
        continue;
      }
    }

    // 3. Fallback: 用廠商 shortName / name 比對
    //    (當商品庫沒有此前綴,但已建好對應廠商如「JR鍵榮」)
    const stem = extractAlphabeticStem(code) || prefix;
    const byName = findSupplierByName(stem);
    if (byName) {
      supplierVotes.set(
        byName.supplierId,
        (supplierVotes.get(byName.supplierId) ?? 0) + 1,
      );
      continue;
    }

    unmatchedCodes.push(code);
  }

  if (supplierVotes.size === 0) {
    return { detected: null, unmatchedCodes };
  }

  // 排序找出多數
  const sorted = Array.from(supplierVotes.entries()).sort((a, b) => b[1] - a[1]);
  const totalVotes = sorted.reduce((acc, [, v]) => acc + v, 0);
  const [[topId, topVotes]] = sorted;
  const conflict = sorted.length > 1 && (sorted[1]?.[1] ?? 0) > 0;

  return {
    detected: {
      supplierId: topId,
      votes: topVotes,
      totalVotes,
      conflict,
      conflictDetail: conflict
        ? sorted.map(([sId, v]) => ({ supplierId: sId, votes: v }))
        : undefined,
    },
    unmatchedCodes,
  };
}
