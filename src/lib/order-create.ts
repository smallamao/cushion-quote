import "server-only";

import type { SheetsClient } from "@/lib/sheets-client";
import {
  ORDER_RANGE_DATA,
  ORDER_RANGE_FULL,
  ORDER_RANGE_IDS,
  generateOrderId,
  isoNow,
  todayDateStr,
  orderRecordToRow,
} from "@/lib/order-utils";
import { lineRowToRecord } from "@/app/api/sheets/_v2-utils";
import { classifyOrderCategory, inferDeliveryMethod } from "@/lib/order-category";
import { versionLinesToOrderItems } from "@/lib/quote-mappers";
import type { CustomOrder, OrderItemCategory, OrderDeliveryMethod } from "@/lib/types";

/**
 * 建立訂製訂單的共用邏輯。
 *
 * 抽出來的原因：客人線上簽署完成後要「自動開單」，而簽署是公開端點、
 * 不能走需要登入的 API 路由，內部再打一次 HTTP 也不可靠（絕對網址、冷啟動）。
 * 由 POST /api/sheets/orders 與 POST /api/public/sign/[token] 共用同一份實作，
 * 兩邊行為一定一致。
 */

export type CreateOrderInput =
  | { sourceType: "quote"; versionId: string }
  | {
      sourceType: "direct";
      clientName: string;
      orderNumber: string;
      itemCategory?: string;
      clientId?: string;
    };

export interface CreateOrderResult {
  orderId: string;
  /** 該報價版本已經開過單：回傳既有訂單編號，不重複建立。 */
  alreadyExists: boolean;
}

/** 帶 HTTP 狀態碼的錯誤，讓 API 路由能直接映射回應。 */
export class OrderCreateError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "OrderCreateError";
    this.status = status;
  }
}

export async function createOrder(
  client: SheetsClient,
  input: CreateOrderInput,
): Promise<CreateOrderResult> {
  // 同一個報價版本只開一張單（簽署自動開單與人工按鈕可能同時發生）
  if (input.sourceType === "quote" && input.versionId) {
    const checkRes = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: ORDER_RANGE_DATA,
    });
    const existingRows = (checkRes.data.values ?? []) as string[][];
    const existingOrder = existingRows.find((r) => r[2] === input.versionId);
    if (existingOrder) {
      return { orderId: existingOrder[0], alreadyExists: true };
    }
  }

  const idRes = await client.sheets.spreadsheets.values.get({
    spreadsheetId: client.spreadsheetId,
    range: ORDER_RANGE_IDS,
  });
  const existingIds = ((idRes.data.values ?? []) as string[][])
    .map((r) => r[0] ?? "")
    .filter(Boolean);

  const now = isoNow();
  const yearMonth = todayDateStr().slice(0, 7);
  const orderId = generateOrderId(existingIds, yearMonth);

  let clientName = "";
  let orderNumber = "";
  let orderTitle = "";
  let caseId = "";
  let versionId = "";
  let quotedAmount = 0;
  let versionTaxRate = 0;
  let directItemCategory = "";
  let quoteItemCategory: OrderItemCategory | "" = "";
  let quoteDeliveryMethod: OrderDeliveryMethod | "" = "";
  let clientId = "";
  let installAddress = "";
  let installContactName = "";
  let installContactPhone = "";
  let materialName = "";
  let materialCode = "";
  const materialImageUrl = "";
  let initialNotes: CustomOrder["notes"] = [];
  let orderItems: CustomOrder["items"] = [];

  if (input.sourceType === "quote") {
    if (!input.versionId) {
      throw new OrderCreateError("versionId is required for sourceType=quote", 400);
    }
    versionId = input.versionId;

    // 1. Find the version row
    const versionRes = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: "報價版本!A2:AW2000",
    });
    const versionRows = (versionRes.data.values ?? []) as string[][];
    const versionRow = versionRows.find((r) => r[0] === versionId);
    if (!versionRow) {
      throw new OrderCreateError("version not found", 404);
    }
    // col[2]=caseId, col[16]=稅率, col[18]=含稅總額, col[24]=對外說明, col[29]=clientNameSnapshot
    caseId = versionRow[2] ?? "";
    quotedAmount = parseFloat(versionRow[18] ?? "0") || 0;
    versionTaxRate = parseFloat(versionRow[16] ?? "0") || 0;
    const scopeDescription = versionRow[24] ?? "";
    initialNotes = scopeDescription
      .split("\n")
      .map((line: string) => line.trim())
      .filter((line: string) => line.length > 0)
      .map((text: string, i: number) => ({
        id: `note-${i + 1}`,
        text,
        color: "black" as const,
        isWarning: false,
      }));
    // 散客的「客戶名稱」欄一律是空的，S 編號與姓名存在「聯絡人」欄（col30）。
    // 不退回的話轉出來的訂單客戶是空白（2026-09-22 老闆反映）。
    clientName = (versionRow[29] || versionRow[30]) ?? "";

    // 2. Find the case for caseName → orderTitle
    const caseRes = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: "案件!A2:Z2000",
    });
    const caseRows = (caseRes.data.values ?? []) as string[][];
    const caseRow = caseRows.find((r) => r[0] === caseId);
    orderNumber = caseId;
    // 訂製內容取案件名稱；散客依慣例不填案件名稱，退回方案名稱（col42），
    // 否則訂單的「訂製內容」是空白，工單開起來看不出要做什麼。
    orderTitle = (caseRow?.[1] || versionRow[42]) ?? "";
    clientId = caseRow?.[2] ?? "";
    // 訂貨人／現場資訊帶入：
    // 只有「客人有線上簽署」(signedBack col43=TRUE) 時，才優先取簽署時回寫於
    // 報價版本的訂貨人快照（col30 聯絡人 / col31 電話 / col33 地址）；
    // 否則一律讀「當前案件」現場資訊（col4/5/6），避免用到凍結的舊快照或
    // 未修復的舊格式欄位（legacy 欄位位移）。→ 給出貨與師傅派工用。
    const versionSigned = String(versionRow[43] ?? "").toUpperCase() === "TRUE";
    if (versionSigned) {
      installContactName = versionRow[30] || (caseRow?.[4] ?? "");
      installContactPhone = versionRow[31] || (caseRow?.[5] ?? "");
      installAddress = versionRow[33] || (caseRow?.[6] ?? "");
    } else {
      installContactName = caseRow?.[4] ?? "";
      installContactPhone = caseRow?.[5] ?? "";
      installAddress = caseRow?.[6] ?? "";
    }

    // 3. 讀本版本所有明細（帶入訂單品項用）
    const lineRes = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: "報價版本明細!A2:AJ2000",
    });
    const lineRecords = ((lineRes.data.values ?? []) as string[][])
      .filter((r) => r[1] === versionId)
      .map(lineRowToRecord);

    // 4. 讀材質資料庫，建 id→{name, code} 對照（給訂單主布料＋各品項色號）
    const materialNameById = new Map<string, string>();
    const materialCodeById = new Map<string, string>();
    const neededMaterialIds = new Set(
      lineRecords.map((l) => l.materialId).filter(Boolean),
    );
    if (neededMaterialIds.size > 0) {
      const matRes = await client.sheets.spreadsheets.values.get({
        spreadsheetId: client.spreadsheetId,
        range: "材質資料庫!A2:R2000",
      });
      const matRows = (matRes.data.values ?? []) as string[][];
      for (const r of matRows) {
        const id = r[0];
        if (!id || !neededMaterialIds.has(id)) continue;
        const brand = r[1] ?? "";
        const series = r[2] ?? "";
        const code = r[3] ?? "";
        materialNameById.set(id, `${brand} ${series} ${code}`.trim());
        materialCodeById.set(id, code);
      }
    }

    // 訂單主布料：取第一筆（依 lineNo）有材質的明細
    const firstWithMaterial = lineRecords
      .slice()
      .sort((a, b) => a.lineNo - b.lineNo)
      .find((l) => l.materialId && materialNameById.has(l.materialId));
    if (firstWithMaterial) {
      materialName = materialNameById.get(firstWithMaterial.materialId) ?? "";
      materialCode = materialCodeById.get(firstWithMaterial.materialId) ?? "";
    }

    // 5. 報價明細 → 訂單品項（含名稱、尺寸規格、數量、色號、備註）
    orderItems = versionLinesToOrderItems(lineRecords, materialCodeById);

    // 6. 由品項名稱推「品項分類」與「配送方式」，省掉開單後逐欄補打。
    //    判不出來就留空交人工選，不硬塞。
    const visibleNames = lineRecords
      .slice()
      .sort((a, b) => a.lineNo - b.lineNo)
      .filter((l) => !l.isCostItem && l.showOnQuote)
      .map((l) => l.itemName ?? "");
    quoteItemCategory = classifyOrderCategory(
      visibleNames[0] ?? "",
      [versionRow[42] ?? "", ...visibleNames].filter(Boolean).join(" "),
    );
    quoteDeliveryMethod = inferDeliveryMethod(
      lineRecords.map((l) => `${l.itemName ?? ""} ${l.spec ?? ""}`),
    );
  } else {
    clientName = input.clientName ?? "";
    orderNumber = input.orderNumber ?? "";
    directItemCategory = input.itemCategory ?? "";
    clientId = input.clientId ?? "";
  }

  // 免開票判定：未稅報價（稅率 0）本身即代表不開發票；或已列入電子發票不開清單
  let invoiceStatus: CustomOrder["invoiceStatus"] = "pending";
  if (versionId && versionTaxRate === 0) invoiceStatus = "exempt";
  if (versionId && invoiceStatus === "pending") {
    try {
      const optOutRes = await client.sheets.spreadsheets.values.get({
        spreadsheetId: client.spreadsheetId,
        range: "電子發票不開清單!A:A",
      });
      const optOutIds = ((optOutRes.data.values ?? []) as string[][]).map((r) => r[0]);
      if (optOutIds.includes(versionId)) invoiceStatus = "exempt";
    } catch {
      // 清單讀取失敗時維持 pending，不擋建單
    }
  }

  const newOrder: CustomOrder = {
    orderId,
    caseId,
    versionId,
    clientName,
    orderNumber,
    orderTitle,
    itemCategory: (directItemCategory as OrderItemCategory) || quoteItemCategory,
    deliveryMethod: quoteDeliveryMethod,
    status: "production",
    sourceType: input.sourceType,
    orderDate: now.slice(0, 10),
    supplierOrderDate: "",
    productionDueDate: "",
    installDate: "",
    completedDate: "",
    quotedAmount,
    materialCost: 0,
    laborCost: 0,
    shippingCost: 0,
    otherCost: 0,
    materialName,
    materialCode,
    materialImageUrl,
    deadline: "",
    items: orderItems,
    notes: initialNotes,
    photos: [],
    invoiceStatus,
    isArchived: false,
    internalNotes: "",
    createdAt: now,
    updatedAt: now,
    createdBy: "",
    materialPurchases: [],
    clientId,
    installAddress,
    installContactName,
    installContactPhone,
  };

  await client.sheets.spreadsheets.values.append({
    spreadsheetId: client.spreadsheetId,
    range: ORDER_RANGE_FULL,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [orderRecordToRow(newOrder)] },
  });

  return { orderId, alreadyExists: false };
}
