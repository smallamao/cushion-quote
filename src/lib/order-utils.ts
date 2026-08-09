import type { CustomOrder, MaterialPurchase, OrderItem, OrderNote, WorkOrderPhotoLayoutItem } from "@/lib/types";

export const ORDER_SHEET = "訂製訂單";
export const ORDER_RANGE_FULL = `${ORDER_SHEET}!A:AV`;
export const ORDER_RANGE_DATA = `${ORDER_SHEET}!A2:AV10000`;
export const ORDER_RANGE_IDS = `${ORDER_SHEET}!A2:A10000`;
export const ORDER_ROW_RANGE = (sheetRow: number) =>
  `${ORDER_SHEET}!A${sheetRow}:AV${sheetRow}`;

function toNumber(value: string | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function toBoolean(value: string | undefined): boolean {
  return value === "TRUE" || value === "true" || value === "1";
}

// fontScale：1 = 預設（PDF 基準字級已含 130% 放大）
// 舊資料為絕對倍率（>1.2，當時預設 1.3）→ 讀取時換算回相對值，下次儲存即自動更正
function migrateFontScale(v: number): number {
  if (!v) return 1;
  return v > 1.2 ? Math.round((v / 1.3) * 100) / 100 : v;
}

function parseJsonSafe<T>(value: string | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function isoNow(): string {
  return new Date().toISOString();
}

export function todayDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// 33 columns A (index 0) through AG (index 32)
export function orderRowToRecord(row: string[]): CustomOrder {
  const record: CustomOrder = {
    orderId: row[0] ?? "",
    caseId: row[1] ?? "",
    versionId: row[2] ?? "",
    clientName: row[3] ?? "",
    orderNumber: row[4] ?? "",
    orderTitle: row[5] ?? "",
    itemCategory: (row[6] ?? "") as CustomOrder["itemCategory"],
    deliveryMethod: (row[7] ?? "") as CustomOrder["deliveryMethod"],
    status: (row[8] as CustomOrder["status"]) || "production",
    sourceType: (row[9] as CustomOrder["sourceType"]) || "direct",
    orderDate: row[10] ?? "",
    supplierOrderDate: row[11] ?? "",
    productionDueDate: row[12] ?? "",
    installDate: row[13] ?? "",
    completedDate: row[14] ?? "",
    quotedAmount: toNumber(row[15]),
    materialCost: toNumber(row[16]),
    laborCost: toNumber(row[17]),
    shippingCost: toNumber(row[18]),
    otherCost: toNumber(row[19]),
    materialName: row[20] ?? "",
    materialCode: row[21] ?? "",
    materialImageUrl: row[22] ?? "",
    materialImageScale: toNumber(row[34]) || 1,
    photoLayout: parseJsonSafe<WorkOrderPhotoLayoutItem[]>(row[35], []),
    fontScale: migrateFontScale(toNumber(row[36])),
    workOrderPdfUrl: row[37] ?? "",
    workOrderPdfUpdatedAt: row[38] ?? "",
    paidDate: row[39] ?? "",
    clientId: row[40] ?? "",
    shipDate: row[41] ?? "",
    extraInstallDates: parseJsonSafe<string[]>(row[42], []),
    installAssignedTo: row[43] ?? "",
    installAddress: row[44] ?? "",
    installContactName: row[45] ?? "",
    installContactPhone: row[46] ?? "",
    deadline: row[23] ?? "",
    items: parseJsonSafe<OrderItem[]>(row[24], []),
    notes: parseJsonSafe<OrderNote[]>(row[25], []),
    photos: parseJsonSafe<string[]>(row[26], []),
    invoiceStatus: (row[27] as CustomOrder["invoiceStatus"]) || "pending",
    isArchived: toBoolean(row[28]),
    internalNotes: row[29] ?? "",
    createdAt: row[30] ?? "",
    updatedAt: row[31] ?? "",
    createdBy: row[32] ?? "",
    materialPurchases: parseJsonSafe<MaterialPurchase[]>(row[33], []),
    notionPageId: row[47] ?? "",
  };

  // Migrate legacy imageUrl → photos[0] for each item
  record.items = record.items.map((item: OrderItem) => {
    if (item.imageUrl && !item.photos?.length) {
      return { ...item, photos: [item.imageUrl] };
    }
    return item;
  });

  return record;
}

export function orderRecordToRow(r: CustomOrder): string[] {
  return [
    r.orderId,
    r.caseId,
    r.versionId,
    r.clientName,
    r.orderNumber,
    r.orderTitle,
    r.itemCategory,
    r.deliveryMethod,
    r.status,
    r.sourceType,
    r.orderDate,
    r.supplierOrderDate,
    r.productionDueDate,
    r.installDate,
    r.completedDate,
    String(r.quotedAmount),
    String(r.materialCost),
    String(r.laborCost),
    String(r.shippingCost),
    String(r.otherCost),
    r.materialName,
    r.materialCode,
    r.materialImageUrl,
    r.deadline,
    JSON.stringify(r.items),
    JSON.stringify(r.notes),
    JSON.stringify(r.photos),
    r.invoiceStatus,
    r.isArchived ? "TRUE" : "FALSE",
    r.internalNotes,
    r.createdAt,
    r.updatedAt,
    r.createdBy,
    JSON.stringify(r.materialPurchases ?? []),
    String(r.materialImageScale ?? 1),
    JSON.stringify(r.photoLayout ?? []),
    String(r.fontScale ?? 1),
    r.workOrderPdfUrl ?? "",
    r.workOrderPdfUpdatedAt ?? "",
    r.paidDate ?? "",
    r.clientId ?? "",
    r.shipDate ?? "",
    JSON.stringify(r.extraInstallDates ?? []),
    r.installAssignedTo ?? "",
    r.installAddress ?? "",
    r.installContactName ?? "",
    r.installContactPhone ?? "",
    r.notionPageId ?? "",
  ];
}

export interface OrderFinancials {
  totalCost: number;
  netProfit: number;
  marginRate: number;
}

export function calcOrderFinancials(order: CustomOrder): OrderFinancials {
  const totalCost =
    order.materialCost + order.laborCost + order.shippingCost + order.otherCost;
  const netProfit = order.quotedAmount - totalCost;
  const marginRate =
    order.quotedAmount > 0 ? (netProfit / order.quotedAmount) * 100 : 0;
  return { totalCost, netProfit, marginRate };
}

export function generateOrderId(
  existingIds: string[],
  yearMonth: string,
): string {
  const prefix = `ORD-${yearMonth}-`;
  const existing = existingIds
    .filter((id) => id.startsWith(prefix))
    .map((id) => parseInt(id.slice(prefix.length), 10))
    .filter(Number.isFinite);
  const next = existing.length > 0 ? Math.max(...existing) + 1 : 1;
  return `${prefix}${String(next).padStart(3, "0")}`;
}
