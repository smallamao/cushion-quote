import type { PurchaseProduct, PurchaseUnit } from "@/lib/types";

/**
 * Purchase order paste parser.
 *
 * Supports lines in the form:
 *   {productCode} {qty}{unit} #{caseRef}
 *   {productCode} {qty}{unit}+{qty}{unit} #{caseRef}
 *
 * Examples:
 *   LY9802 15y #P5999
 *   LY3139-5 6.5y #P6005
 *   彩虹皮8852 2Y #S847
 *   勝3925 7.5y #P6000
 *   S6901 3件+10y #P6002
 *
 * Unit aliases:
 *   y / Y / 碼          -> 碼
 *   件 / 片 / pc / pcs  -> 件
 *   只                  -> 只
 *
 * The case ref (after `#`) becomes a per-line note and is also collected
 * into the order-level notes summary.
 */

export interface ParsedSubItem {
  qty: number;
  unit: PurchaseUnit;
}

export interface ParsedPasteLine {
  raw: string;
  productCode: string;
  caseRef: string;
  subItems: ParsedSubItem[];
  warning?: string;
}

const UNIT_PATTERNS: Array<{ regex: RegExp; unit: PurchaseUnit }> = [
  { regex: /^([0-9]*\.?[0-9]+)\s*(?:y|Y|碼)$/u, unit: "碼" },
  { regex: /^([0-9]*\.?[0-9]+)\s*(?:件|片|pc|pcs|PC|PCS)$/u, unit: "件" },
  { regex: /^([0-9]*\.?[0-9]+)\s*只$/u, unit: "只" },
  { regex: /^([0-9]*\.?[0-9]+)\s*才$/u, unit: "才" },
  { regex: /^([0-9]*\.?[0-9]+)\s*米$/u, unit: "米" },
  { regex: /^([0-9]*\.?[0-9]+)\s*組$/u, unit: "組" },
  { regex: /^([0-9]*\.?[0-9]+)\s*包$/u, unit: "包" },
  { regex: /^([0-9]*\.?[0-9]+)\s*個$/u, unit: "個" },
];

function parseQtyUnit(token: string): ParsedSubItem | null {
  for (const { regex, unit } of UNIT_PATTERNS) {
    const m = token.match(regex);
    if (m) {
      const qty = Number(m[1]);
      if (Number.isFinite(qty) && qty > 0) {
        return { qty, unit };
      }
    }
  }
  return null;
}

export function parsePurchasePasteLine(line: string): ParsedPasteLine | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // Extract case ref (#XXX, #P5999, #S847, #展示間 etc.)
  let caseRef = "";
  let withoutRef = trimmed;
  const refMatch = trimmed.match(/#(\S+)/);
  if (refMatch) {
    caseRef = refMatch[1];
    withoutRef = trimmed.replace(/#\S+/, "").trim();
  }

  // Tokens separated by whitespace
  // First token is product code, the rest contain qty+unit (joined by +)
  const tokens = withoutRef.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) {
    return {
      raw: trimmed,
      productCode: tokens[0] ?? "",
      caseRef,
      subItems: [],
      warning: "缺少數量",
    };
  }

  const productCode = tokens[0];
  // Join remaining tokens to handle "3 件 + 10 y" with spaces, then split by +
  const qtyExpr = tokens.slice(1).join("");
  const qtyParts = qtyExpr.split("+").map((p) => p.trim()).filter(Boolean);

  const subItems: ParsedSubItem[] = [];
  const failed: string[] = [];
  for (const part of qtyParts) {
    const parsed = parseQtyUnit(part);
    if (parsed) {
      subItems.push(parsed);
    } else {
      failed.push(part);
    }
  }

  return {
    raw: trimmed,
    productCode,
    caseRef,
    subItems,
    warning: failed.length > 0 ? `無法解析: ${failed.join(", ")}` : undefined,
  };
}

export function parsePurchasePasteText(text: string): ParsedPasteLine[] {
  return text
    .split(/\r?\n/)
    .map(parsePurchasePasteLine)
    .filter((line): line is ParsedPasteLine => line !== null);
}

// ---------------------------------------------------------------------------
// Match parsed lines against a supplier's product catalog
// ---------------------------------------------------------------------------

export interface ResolvedItem {
  productId: string;
  productCode: string;
  productName: string;
  specification: string;
  unit: PurchaseUnit;
  quantity: number;
  unitPrice: number;
  amount: number;
  notes: string;
  matched: boolean;
  warning?: string;
}

/**
 * Resolve parsed paste lines against a product catalog (already filtered by
 * the chosen supplier). Each parsed sub-item becomes one resolved item.
 *
 * Lookup strategy:
 *   1. Exact match on productCode
 *   2. Case-insensitive contains match on productCode
 *   3. Contains match on productName or specification
 *
 * Unmatched items are still returned with matched=false so the user can
 * fix them manually.
 */
/**
 * Normalize a product code for fuzzy comparison.
 *  - Lowercase
 *  - Strip everything except a-z and 0-9 (removes CJK prefixes like「勝」,
 *    hyphens, dots, whitespace, dashes, underscores, etc.)
 *
 *   "勝598-85"  → "59885"
 *   "SC59885"   → "sc59885"
 *   "SC-598.85" → "sc59885"
 *   "勝 598 85" → "59885"
 */
function normalizeCode(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function digitsOf(s: string): string {
  return s.replace(/\D/g, "");
}

export function resolveParsedLines(
  lines: ParsedPasteLine[],
  catalog: PurchaseProduct[]
): ResolvedItem[] {
  // Pre-build multiple indexes for layered matching
  const byCode = new Map<string, PurchaseProduct>();
  const byNorm = new Map<string, PurchaseProduct[]>();
  const byDigits = new Map<string, PurchaseProduct[]>();

  for (const p of catalog) {
    const pcode = p.productCode.trim().toLowerCase();
    if (!pcode) continue;
    byCode.set(pcode, p);

    const norm = normalizeCode(p.productCode);
    if (norm) {
      (byNorm.get(norm) ?? byNorm.set(norm, []).get(norm)!).push(p);
    }

    // Also index on specification's normalized form (helps when paste uses
    // just the color portion like「598-85」to match a product whose
    // productCode is「SC59885」and specification is「598-85 湛雪藍」)
    const specNorm = normalizeCode(p.specification);
    if (specNorm && specNorm !== norm) {
      (byNorm.get(specNorm) ?? byNorm.set(specNorm, []).get(specNorm)!).push(p);
    }

    const digits = digitsOf(p.productCode);
    if (digits.length >= 4) {
      (byDigits.get(digits) ?? byDigits.set(digits, []).get(digits)!).push(p);
    }
    const specDigits = digitsOf(p.specification);
    if (specDigits.length >= 4 && specDigits !== digits) {
      (byDigits.get(specDigits) ?? byDigits.set(specDigits, []).get(specDigits)!).push(p);
    }
  }

  /**
   * Try progressively looser strategies to find the best catalog match.
   * Order matters — stricter strategies win so we don't over-match.
   */
  function findMatch(rawCode: string): PurchaseProduct | undefined {
    if (!rawCode) return undefined;
    const codeLower = rawCode.trim().toLowerCase();
    if (!codeLower) return undefined;

    // 1. Exact productCode (case-insensitive)
    const exact = byCode.get(codeLower);
    if (exact) return exact;

    // 2. Normalized exact (strip CJK / punctuation / whitespace both sides)
    const codeNorm = normalizeCode(rawCode);
    if (codeNorm.length >= 3) {
      const hits = byNorm.get(codeNorm);
      if (hits?.length === 1) return hits[0];
      if (hits && hits.length > 1) {
        // prefer shorter productCode (usually the cleaner canonical one)
        return hits.slice().sort(
          (a, b) => a.productCode.length - b.productCode.length,
        )[0];
      }
    }

    // 3. Normalized suffix / prefix match
    //    e.g. paste "59885" → catalog "SC59885" (sc59885 endsWith 59885)
    //    e.g. paste "勝SC59885" (norm: "sc59885") → catalog "SC59885" (norm equals)
    if (codeNorm.length >= 4) {
      const suffixHits: PurchaseProduct[] = [];
      for (const [norm, products] of byNorm) {
        if (norm === codeNorm) continue; // already handled above
        if (norm.endsWith(codeNorm) || codeNorm.endsWith(norm)) {
          suffixHits.push(...products);
        }
      }
      const unique = Array.from(new Set(suffixHits));
      if (unique.length === 1) return unique[0];
      if (unique.length > 1) {
        // prefer the one whose normalized length is closest to codeNorm
        return unique.slice().sort((a, b) => {
          const la = normalizeCode(a.productCode).length;
          const lb = normalizeCode(b.productCode).length;
          return Math.abs(la - codeNorm.length) - Math.abs(lb - codeNorm.length);
        })[0];
      }
    }

    // 4. Digit-signature match (strips ALL letters; last-resort for cases
    //    where paste uses digits only or entirely different alphabetic prefix)
    const codeDigits = digitsOf(rawCode);
    if (codeDigits.length >= 4) {
      const hits = byDigits.get(codeDigits);
      if (hits?.length === 1) return hits[0];
    }

    // 5. Substring match on productCode / spec / name (existing behaviour)
    const hit = catalog.find((p) => {
      const pCode = p.productCode.trim().toLowerCase();
      const pSpec = p.specification.trim().toLowerCase();
      const pName = p.productName.trim().toLowerCase();
      return (
        (pCode.length > 0 &&
          (pCode.includes(codeLower) || codeLower.includes(pCode))) ||
        (pSpec.length >= 3 && pSpec.includes(codeLower)) ||
        (pName.length >= 3 && pName.includes(codeLower))
      );
    });
    return hit;
  }

  const result: ResolvedItem[] = [];
  for (const line of lines) {
    const code = line.productCode;
    const match = findMatch(code);

    if (line.subItems.length === 0) {
      result.push({
        productId: match?.id ?? "",
        productCode: code,
        productName: match?.productName ?? "",
        specification: match?.specification ?? "",
        unit: match?.unit ?? "碼",
        quantity: 0,
        unitPrice: match?.unitPrice ?? 0,
        amount: 0,
        notes: line.caseRef,
        matched: Boolean(match),
        warning: line.warning ?? "缺少數量",
      });
      continue;
    }

    for (const sub of line.subItems) {
      const qty = sub.qty;
      const price = match?.unitPrice ?? 0;
      result.push({
        productId: match?.id ?? "",
        productCode: code,
        productName: match?.productName ?? "",
        specification: match?.specification ?? "",
        unit: sub.unit,
        quantity: qty,
        unitPrice: price,
        amount: Math.round(qty * price * 100) / 100,
        notes: line.caseRef,
        matched: Boolean(match),
        warning: !match ? "查無此商品" : line.warning,
      });
    }
  }

  return result;
}

export function summarizeCaseRefs(lines: ParsedPasteLine[]): string {
  const refs = lines
    .map((l) => l.caseRef)
    .filter(Boolean);
  return Array.from(new Set(refs)).join(", ");
}

/**
 * Detects the primary case ID from parsed lines.
 * Returns the most frequently occurring case ref, or the first one if tied.
 * Returns null if no case refs found.
 */
export function detectPrimaryCaseId(lines: ParsedPasteLine[]): string | null {
  const refs = lines
    .map((l) => l.caseRef)
    .filter(Boolean);

  if (refs.length === 0) return null;

  // Count frequency
  const freq = new Map<string, number>();
  for (const ref of refs) {
    freq.set(ref, (freq.get(ref) ?? 0) + 1);
  }

  // Find most common (or first if tied)
  let maxCount = 0;
  let primaryRef: string | null = null;
  for (const [ref, count] of freq) {
    if (count > maxCount) {
      maxCount = count;
      primaryRef = ref;
    }
  }

  return primaryRef;
}
