/**
 * 採購單／採購單明細「Sheet 列 → 物件」的**唯讀**解析器（共用來源）。
 *
 * 欄位對照鏡射自 /api/sheets/purchases 與 /api/sheets/purchases/[orderId]：
 *   採購單     A:Q（17 欄，含 relatedOrderId）
 *   採購單明細 A:J（10 欄）
 * 需要讀這兩張表的新端點一律 import 這裡，避免又抄一份對照表造成漂移
 * （加欄位時只改一處讀取邏輯；寫入端各自維護 orderToRow/itemToRow）。
 */
import type {
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderStatus,
  PurchaseUnit,
} from "@/lib/types";

export function rowToOrder(row: string[]): PurchaseOrder {
  const isLegacyOrderRow = row.length <= 14 || (row[3] ?? "").trim().startsWith("{");
  let supplierSnapshot: PurchaseOrder["supplierSnapshot"] = {
    name: "",
    shortName: "",
    contactPerson: "",
    phone: "",
    fax: "",
    email: "",
    taxId: "",
    address: "",
    paymentMethod: "",
    paymentTerms: "",
  };
  try {
    const snapshotRaw = isLegacyOrderRow ? row[3] : row[5];
    if (snapshotRaw) supplierSnapshot = { ...supplierSnapshot, ...JSON.parse(snapshotRaw) };
  } catch {
    /* ignore snapshot parse errors */
  }

  if (isLegacyOrderRow) {
    return {
      orderId: row[0] ?? "",
      orderDate: row[1] ?? "",
      supplierId: row[2] ?? "",
      relatedOrderId: "",
      caseId: "",
      caseNameSnapshot: "",
      supplierSnapshot,
      subtotal: Number(row[4] ?? 0) || 0,
      shippingFee: Number(row[5] ?? 0) || 0,
      taxAmount: Number(row[6] ?? 0) || 0,
      totalAmount: Number(row[7] ?? 0) || 0,
      notes: row[8] ?? "",
      status: (row[9] as PurchaseOrderStatus) || "draft",
      deliveryAddress: row[10] ?? "",
      expectedDeliveryDate: row[11] ?? "",
      createdAt: row[12] ?? "",
      updatedAt: row[13] ?? "",
    };
  }

  return {
    orderId: row[0] ?? "",
    orderDate: row[1] ?? "",
    supplierId: row[2] ?? "",
    caseId: row[3] ?? "",
    caseNameSnapshot: row[4] ?? "",
    supplierSnapshot,
    subtotal: Number(row[6] ?? 0),
    shippingFee: Number(row[7] ?? 0),
    taxAmount: Number(row[8] ?? 0),
    totalAmount: Number(row[9] ?? 0),
    notes: row[10] ?? "",
    status: (row[11] as PurchaseOrderStatus) ?? "draft",
    deliveryAddress: row[12] ?? "",
    expectedDeliveryDate: row[13] ?? "",
    createdAt: row[14] ?? "",
    updatedAt: row[15] ?? "",
    relatedOrderId: row[16] ?? "",
  };
}

export function rowToItem(row: string[]): PurchaseOrderItem {
  const isLegacyItemRow = row.length <= 9;
  let productSnapshot: PurchaseOrderItem["productSnapshot"] = {
    productCode: "",
    productName: "",
    specification: "",
    unit: "碼" as PurchaseUnit,
  };
  try {
    if (row[4]) productSnapshot = { ...productSnapshot, ...JSON.parse(row[4]) };
  } catch {
    /* ignore */
  }

  return {
    itemId: row[0] ?? "",
    orderId: row[1] ?? "",
    sortOrder: Number(row[2] ?? 0),
    productId: row[3] ?? "",
    productSnapshot,
    quantity: Number(row[5] ?? 0),
    receivedQuantity: isLegacyItemRow ? 0 : Number(row[6] ?? 0),
    unitPrice: Number(row[isLegacyItemRow ? 6 : 7] ?? 0),
    amount: Number(row[isLegacyItemRow ? 7 : 8] ?? 0),
    notes: row[isLegacyItemRow ? 8 : 9] ?? "",
  };
}
