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
export function resolveParsedLines(
  lines: ParsedPasteLine[],
  catalog: PurchaseProduct[]
): ResolvedItem[] {
  const byCode = new Map<string, PurchaseProduct>();
  for (const p of catalog) {
    // 跳過空 productCode 的髒資料,避免 "".includes() 造成全比對命中
    const pcode = p.productCode.trim().toLowerCase();
    if (!pcode) continue;
    byCode.set(pcode, p);
  }

  const result: ResolvedItem[] = [];
  for (const line of lines) {
    const code = line.productCode;
    const codeLower = code.toLowerCase();

    let match = byCode.get(codeLower);
    if (!match && codeLower.length > 0) {
      // 模糊比對,但兩邊字串都必須非空 (避免空字串 includes 永遠 true 的陷阱)
      match = catalog.find((p) => {
        const pCode = p.productCode.trim().toLowerCase();
        const pSpec = p.specification.trim().toLowerCase();
        const pName = p.productName.trim().toLowerCase();
        return (
          (pCode.length > 0 &&
            (pCode.includes(codeLower) || codeLower.includes(pCode))) ||
          (pSpec.length > 0 && pSpec.includes(codeLower)) ||
          (pName.length > 0 && pName.includes(codeLower))
        );
      });
    }

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
