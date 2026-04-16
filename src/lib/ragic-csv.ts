import type {
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderStatus,
  PurchaseProduct,
  PurchaseProductCategory,
  PurchaseUnit,
  Supplier,
} from "@/lib/types";

/**
 * Minimal RFC-4180 style CSV parser:
 *  - strips BOM
 *  - handles quoted fields with embedded commas / newlines / "" escapes
 *  - returns string[][] (header + data rows)
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  if (text.charCodeAt(0) === 0xfeff) i = 1;

  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i += 1;
        }
      } else {
        field += c;
        i += 1;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      i += 1;
    } else if (c === ",") {
      row.push(field);
      field = "";
      i += 1;
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 1;
    } else if (c === "\r") {
      i += 1;
    } else {
      field += c;
      i += 1;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f !== ""));
}

/**
 * Convert string[][] into array of objects keyed by header row.
 */
export function rowsToObjects(rows: string[][]): Record<string, string>[] {
  if (rows.length === 0) return [];
  const [header, ...data] = rows;
  return data.map((r) => {
    const obj: Record<string, string> = {};
    header.forEach((key, idx) => {
      obj[key] = (r[idx] ?? "").trim();
    });
    return obj;
  });
}

function normalizeDate(raw: string): string {
  if (!raw) return "";
  // Ragic exports "2026/04/09" — convert to ISO-ish "2026-04-09"
  const m = raw.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return raw;
}

function toNumber(raw: string): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/,/g, "").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function mapCategory(raw: string): PurchaseProductCategory {
  const allowed: PurchaseProductCategory[] = [
    "面料",
    "椅腳",
    "泡棉",
    "木料",
    "皮革",
    "五金",
    "其他",
  ];
  if (allowed.includes(raw as PurchaseProductCategory)) {
    return raw as PurchaseProductCategory;
  }
  if (raw === "木材" || raw === "木架") return "木料";
  return "其他";
}

function mapUnit(raw: string): PurchaseUnit {
  const allowed: PurchaseUnit[] = ["碼", "才", "米", "只", "片", "件", "組", "包", "個"];
  if (allowed.includes(raw as PurchaseUnit)) return raw as PurchaseUnit;
  return "碼";
}

/**
 * Pick the most meaningful product name from Ragic's fields.
 *
 * Ragic data for fabrics typically has:
 *   商品名稱 = color code (e.g. "9110", "7624") — often identical to 規格
 *   敘述     = meaningful description (e.g. "LY91 厚質極致涼感布")
 *
 * Strategy:
 *   1. If 敘述 exists and is longer/more descriptive → use 敘述
 *   2. Else fall back to 商品名稱
 *   3. Else fall back to 規格
 */
function pickProductName(
  productName: string,
  specification: string,
  description: string
): string {
  const name = (productName ?? "").trim();
  const spec = (specification ?? "").trim();
  const desc = (description ?? "").trim();

  // If description looks meaningful (not purely numeric, longer than a code)
  // and differs from the code → prefer it
  const descLooksMeaningful =
    desc.length >= 3 && !/^\d+$/.test(desc) && desc !== name && desc !== spec;

  // If productName is empty, numeric-only, or identical to spec → prefer description
  const nameLooksLikeCode =
    !name || /^\d+$/.test(name) || (spec && name === spec);

  if (descLooksMeaningful && nameLooksLikeCode) return desc;
  if (descLooksMeaningful && !name) return desc;
  if (name) return name;
  if (desc) return desc;
  return spec;
}

// ---------------------------------------------------------------------------
// 廠商 — Supplier parser
// ---------------------------------------------------------------------------

export function parseSuppliersCsv(text: string): Supplier[] {
  const rows = parseCsv(text);
  const objs = rowsToObjects(rows);
  const now = new Date().toISOString().slice(0, 10);

  return objs
    .filter((o) => o["廠商編號"])
    .map((o) => ({
      supplierId: o["廠商編號"] ?? "",
      name: o["名稱"] ?? "",
      shortName: o["簡稱"] ?? "",
      contactPerson: o["聯絡窗口"] ?? "",
      phone: o["電話號碼"] ?? "",
      mobile: o["窗口手機"] ?? "",
      fax: o["傳真號碼"] ?? "",
      email: o["窗口E-mail"] ?? "",
      taxId: o["統一編號"] ?? "",
      address: o["完整帳單地址"] ?? "",
      paymentMethod: o["付款方式"] ?? "",
      paymentTerms: o["付款條件"] ?? "",
      notes: o["備註"] ?? "",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    }));
}

// ---------------------------------------------------------------------------
// 採購商品 — merge 採購商品.csv × 商品廠商價格.csv → PurchaseProduct[]
// Strategy:
//   - Base info (name, spec, category, unit) from 採購商品.csv (keyed by 商品編號)
//   - Supplier + price from 商品廠商價格.csv (keyed by 採購編號 = {商品編號}-{廠商編號})
//   - Produce one PurchaseProduct per (商品編號, 廠商編號) combination
//   - Fallback: products without any supplier price → one entry with empty supplier
// ---------------------------------------------------------------------------

export function parsePurchaseProductsCsv(
  productsText: string,
  pricesText: string
): PurchaseProduct[] {
  const productObjs = rowsToObjects(parseCsv(productsText));
  const priceObjs = rowsToObjects(parseCsv(pricesText));
  const now = new Date().toISOString().slice(0, 10);

  // Build product lookup: 商品編號 → base info
  const productBase: Record<
    string,
    {
      productCode: string;
      productName: string;
      specification: string;
      category: PurchaseProductCategory;
      unit: PurchaseUnit;
      imageUrl: string;
      notes: string;
    }
  > = {};
  for (const p of productObjs) {
    const code = p["商品編號"];
    if (!code) continue;
    productBase[code] = {
      productCode: code,
      productName: pickProductName(
        p["商品名稱"] ?? "",
        p["規格"] ?? "",
        p["敘述"] ?? ""
      ),
      specification: p["規格"] ?? "",
      category: mapCategory(p["種類"] ?? ""),
      unit: mapUnit(p["單位"] ?? ""),
      imageUrl: p["圖片"] ?? "",
      notes: p["敘述"] ?? "",
    };
  }

  const result: PurchaseProduct[] = [];
  const seenIds = new Set<string>();

  // 1. Entries with supplier price
  for (const pr of priceObjs) {
    const id = pr["採購編號"];
    if (!id || seenIds.has(id)) continue;
    seenIds.add(id);

    const productCode = pr["商品編號"] ?? "";
    const supplierId = pr["廠商編號"] ?? "";
    const base = productBase[productCode];

    result.push({
      id,
      productCode,
      supplierProductCode: "",
      productName: base?.productName || pr["商品名稱"] || "",
      specification: base?.specification || pr["規格"] || "",
      category: base?.category ?? mapCategory(pr["種類"] ?? ""),
      unit: base?.unit ?? mapUnit(pr["單位"] ?? ""),
      supplierId,
      unitPrice: toNumber(pr["商品價格"] ?? ""),
      imageUrl: base?.imageUrl ?? "",
      notes: base?.notes ?? "",
      isActive: true,
      createdAt: normalizeDate(pr["日期"] ?? "") || now,
      updatedAt: now,
    });
  }

  // 2. Products without any supplier price → fallback entry
  const pricedCodes = new Set(priceObjs.map((p) => p["商品編號"]));
  for (const code of Object.keys(productBase)) {
    if (pricedCodes.has(code)) continue;
    const base = productBase[code];
    const id = code; // no supplier suffix
    if (seenIds.has(id)) continue;
    result.push({
      id,
      productCode: code,
      supplierProductCode: "",
      productName: base.productName,
      specification: base.specification,
      category: base.category,
      unit: base.unit,
      supplierId: "",
      unitPrice: 0,
      imageUrl: base.imageUrl,
      notes: base.notes,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// 採購單 — PurchaseOrder parser
// ---------------------------------------------------------------------------

function mapOrderStatus(raw: string): PurchaseOrderStatus {
  // Historical Ragic orders are mostly completed; default to "received"
  // If 簽核狀態 == "Y" treat as confirmed, otherwise received (delivered historically)
  if (raw === "Y") return "confirmed";
  return "received";
}

export function parsePurchaseOrdersCsv(text: string): PurchaseOrder[] {
  const objs = rowsToObjects(parseCsv(text));
  const now = new Date().toISOString();

  return objs
    .filter((o) => o["採購單號"])
    .map((o) => ({
      orderId: o["採購單號"] ?? "",
      orderDate: normalizeDate(o["採購日期"] ?? ""),
      supplierId: o["廠商編號"] ?? "",
      caseId: "",
      caseNameSnapshot: "",
      supplierSnapshot: {
        name: o["廠商名稱"] ?? "",
        shortName: "",
        contactPerson: o["聯絡人"] ?? "",
        phone: o["電話"] ?? "",
        fax: o["傳真"] ?? "",
        email: o["E-mail"] ?? "",
        taxId: o["統一編號"] ?? "",
        address: o["地址"] ?? "",
        paymentMethod: o["付款方式"] ?? "",
        paymentTerms: o["付款條件"] ?? "",
      },
      subtotal: toNumber(o["小計"] ?? ""),
      shippingFee: toNumber(o["運費"] ?? ""),
      taxAmount: toNumber(o["稅額"] ?? ""),
      totalAmount: toNumber(o["合計金額"] ?? ""),
      notes: o["附註"] ?? "",
      status: mapOrderStatus(o["簽核狀態"] ?? ""),
      deliveryAddress: o["交貨地址"] ?? "",
      expectedDeliveryDate: normalizeDate(o["到貨日期"] ?? ""),
      createdAt: now,
      updatedAt: now,
    }));
}

// ---------------------------------------------------------------------------
// 採購細項 — PurchaseOrderItem parser
// Needs line numbering per orderId (Ragic CSV doesn't export 項次)
// ---------------------------------------------------------------------------

export function parsePurchaseOrderItemsCsv(text: string): PurchaseOrderItem[] {
  const objs = rowsToObjects(parseCsv(text));
  const counters: Record<string, number> = {};

  return objs
    .filter((o) => o["採購單號"])
    .map((o) => {
      const orderId = o["採購單號"] ?? "";
      counters[orderId] = (counters[orderId] ?? 0) + 1;
      const sortOrder = counters[orderId];
      return {
        itemId: `${orderId}-${String(sortOrder).padStart(3, "0")}`,
        orderId,
        sortOrder,
        productId: o["商品採購編號"] ?? "",
        productSnapshot: {
          productCode: o["商品編號*"] ?? "",
          productName: o["商品名稱"] ?? "",
          specification: o["規格"] ?? "",
          unit: mapUnit(o["單位*"] ?? ""),
        },
        quantity: toNumber(o["數量"] ?? ""),
        receivedQuantity: toNumber(o["數量"] ?? ""),
        unitPrice: toNumber(o["單價"] ?? ""),
        amount: toNumber(o["金額"] ?? ""),
        notes: "",
      };
    });
}
