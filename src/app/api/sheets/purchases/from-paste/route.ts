import crypto from "node:crypto";

import { NextResponse } from "next/server";

import {
  buildPurchaseGroupsFromPaste,
  cloneProductAsNew,
  createProductWithSupplier,
  findBestTemplate,
  lookupOverride,
  resolveSupplierByName,
  UNMATCHED_REASON,
} from "@/lib/purchase-from-paste";
import type {
  AutoCreatedEntry,
  CatalogMismatch,
  FromPasteGroup,
  SupplierOverrides,
} from "@/lib/purchase-from-paste";
import { renderPurchaseOrderPdfBuffer } from "@/lib/purchase-order-pdf-server";
import { loadSystemSettings } from "@/lib/settings-sheet";
import { getSheetsClient } from "@/lib/sheets-client";
import type { PurchaseOrder, PurchaseOrderItem, PurchaseProduct, Supplier } from "@/lib/types";

import { sortSheetRows } from "../../_v2-utils";
import {
  authorizeSchedulerRequest,
  loadCatalogAndSuppliers,
  productToRow,
  PRODUCT_RANGE_FULL,
} from "../_catalog";

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
type SheetsClient = NonNullable<Awaited<ReturnType<typeof getSheetsClient>>>;

interface FromPasteBody {
  pasteText?: unknown;
  purchaseDate?: unknown;
  groupBySupplier?: unknown;
  returnJpg?: unknown;
  source?: unknown;
  dryRun?: unknown;
  autoCreateMissing?: unknown;
  /** 需求 A：色號 → 供應商名稱，指定的色號一律開給該廠商 */
  supplierOverrides?: unknown;
  /** 需求 B：缺件建檔時供應商用 supplierOverrides 指定的值，不從範本繼承 */
  createMissingWithSupplier?: unknown;
}

function parseSupplierOverrides(value: unknown): SupplierOverrides | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const out: SupplierOverrides = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (k.trim() && typeof v === "string" && v.trim()) out[k.trim()] = v.trim();
  }
  return Object.keys(out).length ? out : undefined;
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
  deliveryAddress: string,
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
    deliveryAddress,
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
    quantity: it.qty,
    unit: it.unit,
    caseRef: it.caseRef,
    orderNo: it.caseRef.replace(/^#/, ""),
    matched: true as const,
    supplierUsed: it.supplierUsed,
    supplierFromCatalog: it.supplierFromCatalog,
    supplierSource: it.supplierSource,
  }));
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
  const denied = authorizeSchedulerRequest(request);
  if (denied) {
    return NextResponse.json({ success: false, error: denied.error }, { status: denied.status });
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
  // 排程系統 2026-08-28 擴充：三個欄位全部選填，不傳時行為與過去完全相同。
  const supplierOverrides = parseSupplierOverrides(body.supplierOverrides);
  const createMissingWithSupplier = body.createMissingWithSupplier === true;
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
    // 讀取實際系統設定（公司電話 / 統編 / 工廠交貨地址）。先前此流程對 PDF footer 與交貨地址
    // 都硬塞 DEFAULT_SETTINGS，導致採購單電話永遠印預設值、改設定不跟（統編恰等於預設值故看似正常）。
    const { settings } = await loadSystemSettings();

    // 4) 解析 → 比對 → 依供應商分組（初次）。
    const initial = buildPurchaseGroupsFromPaste(pasteText, catalog, suppliers, { supplierOverrides });
    let groups = initial.groups;
    let unmatched = initial.unmatched;
    const warnings = initial.warnings;
    let catalogMismatch: CatalogMismatch[] = initial.catalogMismatch;

    // 5) 自動補建缺漏商品（autoCreateMissing=true）。
    //    找同前綴範本 → 複製 → 更新 in-memory 目錄 → 重新分組。
    //    dryRun=true 時只預覽（不寫 Sheet）。
    const autoCreated: AutoCreatedEntry[] = [];
    if (autoCreateMissing && unmatched.length > 0) {
      const nowDay = purchaseDate; // YYYY-MM-DD
      const seenCodes = new Set<string>();
      const toCreate: PurchaseProduct[] = [];

      for (const um of unmatched) {
        if (um.reason !== UNMATCHED_REASON) continue; // 指定廠商不存在等原因 → 不建檔
        if (seenCodes.has(um.productCode)) continue; // (b) 同批同碼只建一次
        seenCodes.add(um.productCode);

        const template = findBestTemplate(um.productCode, catalog);
        const overrideName = lookupOverride(um.productCode, supplierOverrides);

        // 需求 B：呼叫端指定供應商建檔，不從範本繼承（S6934 開到金揚五金那類）。
        if (createMissingWithSupplier && overrideName) {
          const overrideSupplier = resolveSupplierByName(overrideName, suppliers);
          if (!overrideSupplier) {
            warnings.push(`supplierOverrides 指定的供應商『${overrideName}』不存在，${um.productCode} 未建檔`);
            continue; // 寧可留在 unmatched，也不用錯的供應商建檔
          }
          toCreate.push(
            createProductWithSupplier(um.productCode, overrideSupplier, template, nowDay, crypto.randomUUID()),
          );
          autoCreated.push({
            productCode: um.productCode,
            copiedFrom: template?.productCode ?? "",
            supplier: overrideSupplier.shortName || overrideSupplier.name,
            supplierSource: "override",
          });
          continue;
        }

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
          supplierSource: "template",
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
        const reResolved = buildPurchaseGroupsFromPaste(pasteText, extendedCatalog, suppliers, {
          supplierOverrides,
          autoCreatedCodes: new Set(toCreate.map((p) => p.productCode)),
        });
        groups = reResolved.groups;
        unmatched = reResolved.unmatched;
        catalogMismatch = reResolved.catalogMismatch;
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
        catalogMismatch,
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
        settings.factoryAddress,
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
            settings,
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
      catalogMismatch,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
