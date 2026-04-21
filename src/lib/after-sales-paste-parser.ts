/**
 * After-sales (售後服務) paste parser.
 *
 * Designed for the common LINE/email snippet format:
 *
 *   114.07.17
 *   桃園市楊梅區新農街二段239巷9號2F〔和耀新加州/C棟〕
 *   0983335320 黃美宜
 *   0963160081 張家耀
 *
 * Extracts:
 *   - shipmentDate    (ROC 114.07.17 or 西元 2025-07-17 / 2025/7/17)
 *   - deliveryAddress (line with address keywords)
 *   - clientPhone + clientName   (first `09xxxxxxxx <name>` pair)
 *   - clientPhone2 + clientContact2 (second pair if present)
 *   - relatedOrderNo  (P12345 / SO-12345 if present)
 *   - modelCode       (BB-1234 style if present)
 *   - issueDescription (whatever text is left over)
 *
 * Any field the parser can't confidently fill returns "" and the
 * caller should only merge non-empty values into the existing draft.
 */

export interface ParsedAfterSalesPayload {
  shipmentDate: string;
  relatedOrderNo: string;
  clientName: string;
  clientPhone: string;
  clientContact2: string;
  clientPhone2: string;
  deliveryAddress: string;
  modelCode: string;
  issueDescription: string;
  matchedFields: string[];
}

const ROC_DATE_PATTERN = /^(\d{2,3})[.\-/年](\d{1,2})[.\-/月](\d{1,2})/u;
const WEST_DATE_PATTERN = /^(\d{4})[.\-/年](\d{1,2})[.\-/月](\d{1,2})/u;

const ORDER_PATTERNS: RegExp[] = [
  /訂單(?:編號|號)?\s*[:：]?\s*([A-Za-z]+[-_]?\d{3,})/iu,
  /\b(P\d{3,6})\b/u,
  /\b(SO[-_]?\d{3,})\b/iu,
];

const PHONE_LINE_PATTERN =
  /^(?:\+?886[\s-]?)?(0?9\d{2}[\s-]?\d{3}[\s-]?\d{3}|0?\d[\s-]?\d{3,4}[\s-]?\d{3,4})\b(.*)$/u;

const ADDRESS_KEYWORDS = [
  "路",
  "街",
  "巷",
  "弄",
  "段",
  "號",
  "樓",
  "市",
  "縣",
  "區",
  "鄉",
  "鎮",
  "里",
  "大道",
];

const MODEL_LINE_PATTERN = /款式|型號|model/iu;
const MODEL_TOKEN_PATTERN = /\b([A-Z]{2,4}[-_]?\d{2,5}(?:[-_]\w+)?)\b/u;

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function parseRocDate(line: string): string {
  const m = line.match(ROC_DATE_PATTERN);
  if (!m) return "";
  const rocYear = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isFinite(rocYear) || rocYear < 1 || rocYear > 200) return "";
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";
  return `${rocYear + 1911}-${pad2(month)}-${pad2(day)}`;
}

function parseWestDate(line: string): string {
  const m = line.match(WEST_DATE_PATTERN);
  if (!m) return "";
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (year < 1900 || year > 2100) return "";
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function parseDate(line: string): string {
  const trimmed = line.trim();
  return parseRocDate(trimmed) || parseWestDate(trimmed);
}

function normalizePhone(raw: string): string {
  let cleaned = raw.replace(/[\s-]/g, "");
  if (cleaned.startsWith("+886")) cleaned = "0" + cleaned.slice(4);
  else if (cleaned.startsWith("886")) cleaned = "0" + cleaned.slice(3);
  if (!cleaned.startsWith("0") && cleaned.length === 9) {
    cleaned = "0" + cleaned;
  }
  return cleaned;
}

interface PhoneNamePair {
  phone: string;
  name: string;
}

function parsePhoneLine(line: string): PhoneNamePair | null {
  const trimmed = line.trim();
  const m = trimmed.match(PHONE_LINE_PATTERN);
  if (!m) return null;
  const phone = normalizePhone(m[1]);
  if (phone.length < 9 || phone.length > 10) return null;
  const rest = (m[2] ?? "").trim();
  // Strip punctuation and labels at the start: "姓名:", "-", "/", "(", etc.
  const name = rest
    .replace(/^[\s:：\-/,，、(（]+/u, "")
    .replace(/[)）]$/u, "")
    .trim();
  return { phone, name };
}

function isAddressLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 6 || trimmed.length > 200) return false;
  const kwCount = ADDRESS_KEYWORDS.filter((kw) => trimmed.includes(kw)).length;
  return kwCount >= 2;
}

function extractOrderNo(text: string): string {
  for (const pattern of ORDER_PATTERNS) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  return "";
}

function extractModel(text: string): string {
  const lines = text.split(/\r?\n/);
  const prioritized = lines.find((l) => MODEL_LINE_PATTERN.test(l));
  if (prioritized) {
    const m = prioritized.match(MODEL_TOKEN_PATTERN);
    if (m) return m[1];
  }
  for (const l of lines) {
    const m = l.match(MODEL_TOKEN_PATTERN);
    if (m) return m[1];
  }
  return "";
}

function isLikelyModelLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (trimmed.length > 40) return false;
  if (parseDate(trimmed)) return false;
  if (parsePhoneLine(trimmed)) return false;
  if (isAddressLine(trimmed)) return false;
  // Already an order number on its own? skip.
  if (/^(?:P|SO[-_]?)\d{3,}$/iu.test(trimmed)) return false;
  // Accept alphanumeric + CJK mix, reject lines with lots of punctuation.
  if (/^[\p{L}\p{N}\s\-_/+×x.]+$/u.test(trimmed)) return true;
  return false;
}

export function parseAfterSalesText(text: string): ParsedAfterSalesPayload {
  const rawLines = text.split(/\r?\n/);
  const lines = rawLines.map((l) => l.trim()).filter((l) => l.length > 0);

  let shipmentDate = "";
  let deliveryAddress = "";
  const phonePairs: PhoneNamePair[] = [];

  // Used to mark which raw lines were consumed so the remainder becomes
  // issue description.
  const consumed = new Set<number>();

  lines.forEach((line, idx) => {
    if (!shipmentDate) {
      const d = parseDate(line);
      if (d) {
        shipmentDate = d;
        consumed.add(idx);
        return;
      }
    }
    const phoneLine = parsePhoneLine(line);
    if (phoneLine && phonePairs.length < 2) {
      phonePairs.push(phoneLine);
      consumed.add(idx);
      return;
    }
    if (!deliveryAddress && isAddressLine(line)) {
      deliveryAddress = line
        .replace(/^(?:地址|住址|送貨地址|送貨|收件地址)\s*[:：]?\s*/u, "")
        .trim();
      consumed.add(idx);
      return;
    }
  });

  const orderNo = extractOrderNo(text);

  // Mark the order-number line as consumed so it doesn't leak into
  // issueDescription.
  if (orderNo) {
    const orderLineIdx = lines.findIndex((l) => l === orderNo);
    if (orderLineIdx >= 0) consumed.add(orderLineIdx);
  }

  // Pick the model code from the first short non-consumed line.
  // Handles both coded tokens (BB-1234) and plain names (JIMMY, Mule).
  // The selected value goes to modelCode; the equipment catalog on the
  // editor side will translate that into a Chinese modelNameSnapshot
  // automatically when the code matches.
  let modelCode = "";
  for (let i = 0; i < lines.length; i++) {
    if (consumed.has(i)) continue;
    if (isLikelyModelLine(lines[i])) {
      modelCode = lines[i]
        .replace(/^(?:款式|型號|model)\s*[:：]?\s*/iu, "")
        .trim();
      consumed.add(i);
      break;
    }
  }

  // Fallback: if nothing matched the heuristic, try the tighter coded
  // token regex (BB-1234) anywhere in the text.
  if (!modelCode) {
    modelCode = extractModel(text);
  }

  const issueDescription = lines
    .filter((_, idx) => !consumed.has(idx))
    .map((line) => line.trim())
    .filter((line) => {
      if (/^(?:電話|手機|地址|住址|訂單|款式|型號)\s*[:：]/u.test(line)) return false;
      if (orderNo && line === orderNo) return false;
      if (modelCode && line === modelCode) return false;
      return true;
    })
    .join("\n")
    .trim();

  const matchedFields: string[] = [];
  if (shipmentDate) matchedFields.push("出貨日期");
  if (deliveryAddress) matchedFields.push("送貨地址");
  if (phonePairs[0]) matchedFields.push("主要聯絡人");
  if (phonePairs[1]) matchedFields.push("次要聯絡人");
  if (orderNo) matchedFields.push("訂單編號");
  if (modelCode) matchedFields.push("款式編號");

  return {
    shipmentDate,
    relatedOrderNo: orderNo,
    clientName: phonePairs[0]?.name ?? "",
    clientPhone: phonePairs[0]?.phone ?? "",
    clientContact2: phonePairs[1]?.name ?? "",
    clientPhone2: phonePairs[1]?.phone ?? "",
    deliveryAddress,
    modelCode,
    issueDescription,
    matchedFields,
  };
}
