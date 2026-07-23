import crypto from "node:crypto";

import { NextResponse } from "next/server";

import { DEFAULT_SETTINGS } from "@/lib/constants";
import {
  buildPurchaseGroupsFromPaste,
  cloneProductAsNew,
  findBestTemplate,
} from "@/lib/purchase-from-paste";
import type { AutoCreatedEntry, FromPasteGroup } from "@/lib/purchase-from-paste";
import { renderPurchaseOrderPdfBuffer } from "@/lib/purchase-order-pdf-server";
import { getSheetsClient } from "@/lib/sheets-client";
import type {
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseProduct,
  PurchaseProductCategory,
  PurchaseUnit,
  Supplier,
} from "@/lib/types";

import { sortSheetRows } from "../../_v2-utils";

// 需要 Node runtime：node:crypto（金鑰比對）、fs（PDF 字型/logo）、react-pdf renderToBuffer。
export const runtime = "nodejs";
export const maxDuration = 60;

const ORDER_SHEET = "採購單";
const ITEM_SHEET = "採購單明細";
// 欄位範圍必須與 /api/sheets/purchases 一致：採購單 A:Q(17)、採購單明細 A:J(10)。
const ORDER_RANGE_FULL = `${ORDER_SHEET}!A:Q`;
const ORDER_RANGE_DATA = `${ORDER_SHEET}!A2:Q`;
const ORDER_ID_RANGE = `${ORDER_SHEET}!A2:A`;
const ITEM_RANGE_FULL = `${ITEM_SHEET}!A:J`;
const PRODUCT_RANGE = "採購商品!A2:Y";
const PRODUCT_RANGE_FULL = "採購商品!A:Y"; // append 用（25 欄，與 /api/sheets/purchase-products 一致）
const SUPPLIER_RANGE = "廠商!A2:P";

type SheetsClient = NonNullable<Awaited<ReturnType<typeof getSheetsClient>>>;

interface FromPasteBody {
  pasteText?: unknown;
  purchaseDate?: unknown;
  groupBySupplier?: unknown;
  returnJpg?: unknown;
  source?: unknown;
  dryRun?: unknown;
  autoCreateMissing?: unknown;
}

// ---------------------------------------------------------------------------
// Auth（server-to-server，無瀏覽器 cookie）
// ---------------------------------------------------------------------------

function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf-8");
  const bb = Buffer.from(b, "utf-8");
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// ---------------------------------------------------------------------------
// Sheet 讀取（欄位對照鏡射自 /api/sheets/purchase-products 與 /api/sheets/suppliers）
// ---------------------------------------------------------------------------

function safeNumber(v: string | undefined): number | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function rowToProduct(row: string[]): PurchaseProduct {
  const unitPrice = safeNumber(row[10]) ?? 0;
  return {
    id: row[0] ?? "",
    productCode: row[1] ?? "",
    supplierProductCode: row[2] ?? "",
    productName: row[3] ?? "",
    specification: row[4] ?? "",
    category: (row[5] as PurchaseProductCategory) ?? "其他",
    unit: (row[6] as PurchaseUnit) ?? "碼",
    supplierId: row[7] ?? "",
    supplierName: row[8] ?? "",
    widthCm: safeNumber(row[9]),
    unitPrice,
    listPricePerCai: safeNumber(row[11]),
    brand: row[12] ?? "",
    series: row[13] ?? "",
    colorCode: row[14] ?? "",
    colorName: row[15] ?? "",
    imageUrl: row[16] ?? "",
    notes: row[17] ?? "",
    isActive: (row[21] ?? "TRUE") !== "FALSE",
    createdAt: row[22] ?? "",
    updatedAt: row[23] ?? "",
  };
}

/**
 * 商品 → Sheet 列（25 欄，A:Y）。
 * 鏡射自 /api/sheets/purchase-products 的 productToRow，切勿擅自改欄數。
 */
function productToRow(p: PurchaseProduct): string[] {
  return [
    p.id,                                                        // A
    p.productCode,                                               // B
    p.supplierProductCode || p.productCode,                      // C — fallback
    p.productName,                                               // D
    p.specification,                                             // E
    p.category,                                                  // F
    p.unit,                                                      // G
    p.supplierId,                                                // H
    p.supplierName ?? "",                                        // I
    p.widthCm != null ? String(p.widthCm) : "",                  // J
    String(p.unitPrice ?? 0),                                    // K (進價)
    p.listPricePerCai != null ? String(p.listPricePerCai) : "",  // L (牌價)
    p.brand ?? "",                                               // M
    p.series ?? "",                                              // N
    p.colorCode ?? "",                                           // O
    p.colorName ?? "",                                           // P
    p.imageUrl ?? "",                                            // Q
    p.notes ?? "",                                               // R
    "",                                                          // S 最小訂量
    "",                                                          // T 交期
    "",                                                          // U 庫存狀態
    p.isActive ? "TRUE" : "FALSE",                               // V
    p.createdAt,                                                 // W
    p.updatedAt,                                                 // X
    p.updatedAt,                                                 // Y (mirror)
  ];
}

function rowToSupplier(row: string[]): Supplier {
  return {
    supplierId: row[0] ?? "",
    name: row[1] ?? "",
    shortName: row[2] ?? "",
    contactPerson: row[3] ?? "",
    phone: row[4] ?? "",
    mobile: row[5] ?? "",
    fax: row[6] ?? "",
    email: row[7] ?? "",
    taxId: row[8] ?? "",
    address: row[9] ?? "",
    paymentMethod: row[10] ?? "",
    paymentTerms: row[11] ?? "",
    notes: row[12] ?? "",
    isActive: row[13] !== "FALSE",
    createdAt: row[14] ?? "",
    updatedAt: row[15] ?? "",
  };
}

// ---------------------------------------------------------------------------
// Sheet 寫入（欄位對照鏡射自 /api/sheets/purchases，切勿改變欄數）
// ---------------------------------------------------------------------------

function orderToRow(o: PurchaseOrder): string[] {
  return [
    o.orderId,
    o.orderDate,
    o.supplierId,
    o.caseId,
    o.caseNameSnapshot,
    JSON.stringify(o.supplierSnapshot ?? {}),
    String(o.subtotal),
    String(o.shippingFee),
    String(o.taxAmount),
    String(o.totalAmount),
    o.notes,
    o.status,
    o.deliveryAddress,
    o.expectedDeliveryDate,
    o.createdAt,
    o.updatedAt,
    o.relatedOrderId,
  ];
}

function itemToRow(i: PurchaseOrderItem): string[] {
  return [
    i.itemId,
    i.orderId,
    String(i.sortOrder),
    i.productId,
    JSON.stringify(i.productSnapshot ?? {}),
    String(i.quantity),
    String(i.receivedQuantity),
    String(i.unitPrice),
    String(i.amount),
    i.notes,
  ];
}

function buildSupplierSnapshot(
  supplier: Supplier | undefined,
): PurchaseOrder["supplierSnapshot"] {
  return {
    name: supplier?.name ?? "",
    shortName: supplier?.shortName ?? "",
    contactPerson: supplier?.contactPerson ?? "",
    phone: supplier?.phone ?? "",
    fax: supplier?.fax ?? "",
    email: supplier?.email ?? "",
    taxId: supplier?.taxId ?? "",
    address: supplier?.address ?? "",
    paymentMethod: supplier?.paymentMethod ?? "",
    paymentTerms: supplier?.paymentTerms ?? "",
  };
}

function buildOrderNotes(caseRefs: string[], source: string): string {
  const lines: string[] = [];
  const refs = caseRefs.join(", ");
  if (refs) lines.push(refs);
  if (source) lines.push(`來源：${source}`);
  return lines.join("\n");
}

interface BuiltOrder {
  group: FromPasteGroup;
  order: PurchaseOrder;
  items: PurchaseOrderItem[];
}

function buildOrder(
  group: FromPasteGroup,
  orderId: string,
  purchaseDate: string,
  source: string,
  supplierById: Map<string, Supplier>,
  nowIso: string,
): BuiltOrder {
  const subtotal =
    Math.round(group.items.reduce((sum, it) => sum + it.amount, 0) * 100) / 100;

  const order: PurchaseOrder = {
    orderId,
    orderDate: purchaseDate,
    supplierId: group.supplierId,
    relatedOrderId: "",
    caseId: "",
    caseNameSnapshot: "",
    supplierSnapshot: buildSupplierSnapshot(supplierById.get(group.supplierId)),
    subtotal,
    shippingFee: 0,
    taxAmount: 0,
    totalAmount: subtotal,
    notes: buildOrderNotes(group.caseRefs, source),
    status: "draft",
    deliveryAddress: DEFAULT_SETTINGS.factoryAddress,
    expectedDeliveryDate: "",
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const items: PurchaseOrderItem[] = group.items.map((it, idx) => ({
    itemId: `${orderId}-${String(idx + 1).padStart(3, "0")}`,
    orderId,
    sortOrder: idx + 1,
    productId: it.productId,
    productSnapshot: {
      productCode: it.productCode,
      productName: it.productName,
      specification: it.specification,
      unit: it.unit,
    },
    quantity: it.qty,
    receivedQuantity: 0,
    unitPrice: it.unitPrice,
    amount: it.amount,
    notes: it.caseRef,
  }));

  return { group, order, items };
}

function toResponseItems(group: FromPasteGroup) {
  return group.items.map((it) => ({
    productCode: it.productCode,
    productName: it.productName,
    qty: it.qty,
    unit: it.unit,
    caseRef: it.caseRef,
    matched: true as const,
  }));
}

async function loadCatalogAndSuppliers(
  client: SheetsClient,
): Promise<{ catalog: PurchaseProduct[]; suppliers: Supplier[] }> {
  const [productRes, supplierRes] = await Promise.all([
    client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: PRODUCT_RANGE,
    }),
    client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: SUPPLIER_RANGE,
    }),
  ]);

  const catalog = (productRes.data.values ?? [])
    .map(rowToProduct)
    .filter((p) => p.id && p.isActive);
  const suppliers = (supplierRes.data.values ?? [])
    .map(rowToSupplier)
    .filter((s) => s.supplierId);

  return { catalog, suppliers };
}

async function nextOrderSeq(
  client: SheetsClient,
  prefix: string,
): Promise<number> {
  const res = await client.sheets.spreadsheets.values.get({
    spreadsheetId: client.spreadsheetId,
    range: ORDER_ID_RANGE,
  });
  const ids = (res.data.values ?? []).flat() as string[];
  return ids
    .filter((id) => id.startsWith(prefix))
    .reduce((max, id) => {
      const seq = Number(id.slice(prefix.length));
      return Number.isFinite(seq) && seq > max ? seq : max;
    }, 0);
}

export async function POST(request: Request) {
  // 1) 認證：SCHEDULER_API_KEY 未設定 → 503（fail safe，而非放行）。
  const configuredKey = process.env.SCHEDULER_API_KEY?.trim();
  if (!configuredKey) {
    return NextResponse.json(
      { success: false, error: "SCHEDULER_API_KEY 未設定，端點停用" },
      { status: 503 },
    );
  }
  const providedKey = request.headers.get("x-api-key")?.trim() ?? "";
  if (!providedKey || !timingSafeEqualStr(providedKey, configuredKey)) {
    return NextResponse.json(
      { success: false, error: "unauthorized" },
      { status: 401 },
    );
  }

  // 2) 解析並驗證 body。
  let body: FromPasteBody;
  try {
    body = (await request.json()) as FromPasteBody;
  } catch {
    return NextResponse.json(
      { success: false, error: "invalid JSON body" },
      { status: 400 },
    );
  }

  const pasteText = typeof body.pasteText === "string" ? body.pasteText : "";
  if (!pasteText.trim()) {
    return NextResponse.json(
      { success: false, error: "pasteText 為必填" },
      { status: 400 },
    );
  }

  const purchaseDate =
    typeof body.purchaseDate === "string" && body.purchaseDate.trim()
      ? body.purchaseDate.trim()
      : new Date().toISOString().slice(0, 10);
  const source = typeof body.source === "string" ? body.source.trim() : "";
  const returnJpg = body.returnJpg === true;
  const dryRun = body.dryRun === true;
  const autoCreateMissing = body.autoCreateMissing === true;
  // groupBySupplier 預設 true；目前僅支援依供應商分組（=false 亦視同分組）。
  // 保留欄位以符合規格；未來若要「單張採購單」可在此擴充。

  // 3) 讀取商品目錄與廠商。
  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json(
      { success: false, error: "Google Sheets 未設定" },
      { status: 503 },
    );
  }

  try {
    const { catalog, suppliers } = await loadCatalogAndSuppliers(client);
    const supplierById = new Map(suppliers.map((s) => [s.supplierId, s]));

    // 4) 解析 → 比對 → 依供應商分組（初次）。
    const initial = buildPurchaseGroupsFromPaste(pasteText, catalog, suppliers);
    let groups = initial.groups;
    let unmatched = initial.unmatched;
    const warnings = initial.warnings;

    // 5) 自動補建缺漏商品（autoCreateMissing=true）。
    //    找同前綴範本 → 複製 → 更新 in-memory 目錄 → 重新分組。
    //    dryRun=true 時只預覽（不寫 Sheet）。
    const autoCreated: AutoCreatedEntry[] = [];
    if (autoCreateMissing && unmatched.length > 0) {
      const nowDay = purchaseDate; // YYYY-MM-DD
      const seenCodes = new Set<string>();
      const toCreate: PurchaseProduct[] = [];

      for (const um of unmatched) {
        if (seenCodes.has(um.productCode)) continue; // (b) 同批同碼只建一次
        seenCodes.add(um.productCode);

        const template = findBestTemplate(um.productCode, catalog);
        if (!template) continue; // (3) 無同前綴範本 → 維持 unmatched

        const newProduct = cloneProductAsNew(
          template,
          um.productCode,
          nowDay,
          crypto.randomUUID(),
        );
        toCreate.push(newProduct);
        autoCreated.push({
          productCode: um.productCode,
          copiedFrom: template.productCode,
          supplier: template.supplierName || template.supplierId,
        });
      }

      if (toCreate.length > 0) {
        if (!dryRun) {
          // 實際寫入採購商品 Sheet（A:Y / 25 欄），沿用 productToRow。
          await client.sheets.spreadsheets.values.append({
            spreadsheetId: client.spreadsheetId,
            range: PRODUCT_RANGE_FULL,
            valueInputOption: "RAW",
            requestBody: { values: toCreate.map(productToRow) },
          });
        }

        // (c) 加進 in-memory 目錄後重新分組（dryRun 也需要，以預覽正確分組）。
        const extendedCatalog = [...catalog, ...toCreate];
        const reResolved = buildPurchaseGroupsFromPaste(
          pasteText,
          extendedCatalog,
          suppliers,
        );
        groups = reResolved.groups;
        unmatched = reResolved.unmatched;
        // 合併 warnings，避免重複
        for (const w of reResolved.warnings) {
          if (!warnings.includes(w)) warnings.push(w);
        }
      }
    }

    // 6) dryRun：只回傳解析結果，不寫任何資料、不產 PDF。
    if (dryRun) {
      return NextResponse.json({
        success: true,
        purchaseOrders: groups.map((group) => ({
          supplier: group.supplier,
          supplierId: group.supplierId,
          orderId: null,
          items: toResponseItems(group),
          jpgBase64: null,
          pdfBase64: null,
          jpgUrl: null,
        })),
        unmatched,
        autoCreated,
        warnings,
      });
    }

    // 8) 建單：跨供應商連續編號 PS-YYYYMMDD-NN。
    const nowIso = new Date().toISOString();
    const dateStr = purchaseDate.replace(/-/g, "").slice(0, 8);
    const prefix = `PS-${dateStr}-`;
    const baseSeq = await nextOrderSeq(client, prefix);

    const built: BuiltOrder[] = groups.map((group, idx) =>
      buildOrder(
        group,
        `${prefix}${String(baseSeq + idx + 1).padStart(2, "0")}`,
        purchaseDate,
        source,
        supplierById,
        nowIso,
      ),
    );

    if (built.length > 0) {
      await client.sheets.spreadsheets.values.append({
        spreadsheetId: client.spreadsheetId,
        range: ORDER_RANGE_FULL,
        valueInputOption: "RAW",
        requestBody: { values: built.map((b) => orderToRow(b.order)) },
      });

      const allItemRows = built.flatMap((b) => b.items.map(itemToRow));
      if (allItemRows.length > 0) {
        await client.sheets.spreadsheets.values.append({
          spreadsheetId: client.spreadsheetId,
          range: ITEM_RANGE_FULL,
          valueInputOption: "RAW",
          requestBody: { values: allItemRows },
        });
      }

      await sortSheetRows(client, {
        sheetName: ORDER_SHEET,
        dataRange: ORDER_RANGE_DATA,
        // 採購單為 17 欄（A:Q，含 relatedOrderId）；排序範圍須涵蓋全部欄，
        // 否則第 17 欄不隨列移動會與其他欄錯位。
        totalColumnCount: 17,
        primarySortColumnIndex: 14,
        secondarySortColumnIndex: 0,
      });
    }

    // 9) JPG / PDF：伺服器端無法產生 JPG（需瀏覽器 canvas / node-canvas，
    // 非現有相依）。因此改以 renderToBuffer 產生 PDF base64，jpgBase64 固定為
    // null 並附上 warning，讓核心建單流程不被 JPG 阻擋。
    const pdfWarnings: string[] = [];
    const purchaseOrders = [];
    for (const b of built) {
      let pdfBase64: string | null = null;
      if (returnJpg) {
        try {
          const buffer = await renderPurchaseOrderPdfBuffer({
            order: b.order,
            items: b.items,
            settings: DEFAULT_SETTINGS,
          });
          pdfBase64 = `data:application/pdf;base64,${buffer.toString("base64")}`;
        } catch (err) {
          const message = err instanceof Error ? err.message : "unknown";
          pdfWarnings.push(`採購單 ${b.order.orderId} PDF 產生失敗：${message}`);
        }
      }
      purchaseOrders.push({
        supplier: b.group.supplier,
        supplierId: b.order.supplierId,
        orderId: b.order.orderId,
        items: toResponseItems(b.group),
        jpgBase64: null,
        pdfBase64,
        jpgUrl: null,
      });
    }

    const responseWarnings = [...warnings];
    if (returnJpg) {
      responseWarnings.push(
        "採購單 JPG 無法在伺服器端產生（需瀏覽器 canvas），已改回傳 PDF base64（pdfBase64）",
      );
      responseWarnings.push(...pdfWarnings);
    }

    return NextResponse.json({
      success: true,
      purchaseOrders,
      unmatched,
      autoCreated,
      warnings: responseWarnings,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
