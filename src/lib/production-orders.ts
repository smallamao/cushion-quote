import type { CustomOrder, OrderItem, OrderNote, OrderStatus } from "@/lib/types";

// 工廠師傅（craftsman）看的「生產訂單」。
//
// 師傅只需要「做什麼、做多大、用什麼料、什麼時候要好」。客戶是誰、住哪、電話、
// 賣多少錢、成本多少，一個都不該離開伺服器。所以這裡用**白名單**挑欄位：
// CustomOrder 以後加了新欄位（不管多敏感），預設都不會跑到師傅手機上。
// 不要改成 `{ ...order, clientName: undefined }` 這種黑名單寫法。

/** 生產訂單裡的品項（只留製作需要的欄位） */
export interface ProductionOrderItemView {
  id: string;
  name: string;
  dimensions: string;
  quantity: string;
  foamSpec: string;
  foamColor: OrderItem["foamColor"];
  itemType: "normal" | "header";
  colorCode: string;
  subNote: string;
  photos: string[];
}

export type ProductionOrderNoteView = Pick<OrderNote, "id" | "text" | "color" | "isWarning">;

/** 給師傅看的訂單投影。欄位清單即是全部——沒列的一律不出伺服器。 */
export interface ProductionOrderView {
  orderId: string;
  orderNumber: string;
  itemCategory: CustomOrder["itemCategory"];
  deliveryMethod: CustomOrder["deliveryMethod"];
  status: OrderStatus;
  productionDueDate: string;
  deadline: string;
  shipDate: string;
  installDate: string;
  completedDate: string;
  materialName: string;
  materialCode: string;
  materialImageUrl: string;
  materialImageScale: number;
  items: ProductionOrderItemView[];
  notes: ProductionOrderNoteView[];
  photos: string[];
  workOrderPdfUrl: string;
}

function pickItem(item: OrderItem): ProductionOrderItemView {
  return {
    id: item.id,
    name: item.name,
    dimensions: item.dimensions,
    quantity: item.quantity,
    foamSpec: item.foamSpec,
    foamColor: item.foamColor,
    itemType: item.itemType ?? "normal",
    colorCode: item.colorCode ?? "",
    subNote: item.subNote ?? "",
    photos: [...(item.photos ?? [])],
  };
}

function pickNote(note: OrderNote): ProductionOrderNoteView {
  return { id: note.id, text: note.text, color: note.color, isWarning: note.isWarning };
}

/** 白名單投影：只挑製作需要的欄位。 */
export function pickProductionOrderView(order: CustomOrder): ProductionOrderView {
  return {
    orderId: order.orderId,
    orderNumber: order.orderNumber,
    itemCategory: order.itemCategory,
    deliveryMethod: order.deliveryMethod,
    status: order.status,
    productionDueDate: order.productionDueDate,
    deadline: order.deadline,
    shipDate: order.shipDate ?? "",
    installDate: order.installDate,
    completedDate: order.completedDate,
    materialName: order.materialName,
    materialCode: order.materialCode,
    materialImageUrl: order.materialImageUrl,
    materialImageScale: order.materialImageScale ?? 1,
    items: (order.items ?? []).map(pickItem),
    notes: (order.notes ?? []).map(pickNote),
    photos: [...(order.photos ?? [])],
    workOrderPdfUrl: order.workOrderPdfUrl ?? "",
  };
}

/** 已完成的單在生產清單上再留幾天（師傅要回頭看剛做完的單、或改回製作中） */
export const COMPLETED_VISIBLE_DAYS = 7;

/** YYYY-MM-DD 往前推 n 天（UTC 計算，與 order-utils.todayDateStr 同一套基準） */
function shiftDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * 這張單會不會出現在生產清單上（也是師傅能不能改它狀態的前提）。
 *   - 製作中、待出貨：顯示
 *   - 已完成：完成日在最近 7 天內才顯示
 *   - 待建立內容、已取消、已封存：一律不顯示
 */
export function isVisibleOnProductionList(order: CustomOrder, today: string): boolean {
  if (order.isArchived) return false;
  if (order.status === "production" || order.status === "waiting") return true;
  if (order.status === "completed") {
    const done = (order.completedDate ?? "").slice(0, 10);
    if (!done) return false;
    return done >= shiftDate(today, -COMPLETED_VISIBLE_DAYS) && done <= today;
  }
  return false;
}

/** 從生產清單能設定的狀態：製作中、已完成（已完成→製作中＝改正按錯） */
export const PRODUCTION_SETTABLE_STATUSES = ["production", "completed"] as const;
export type ProductionSettableStatus = (typeof PRODUCTION_SETTABLE_STATUSES)[number];

export function isProductionSettableStatus(value: unknown): value is ProductionSettableStatus {
  return (
    typeof value === "string" &&
    (PRODUCTION_SETTABLE_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * 生產清單上的狀態變更規則：目前必須是製作中／待出貨／已完成，目標只能是
 * 製作中或已完成。待建立內容、已取消的單碰不到（那是業務端的決定）。
 */
export function canSetProductionStatus(current: OrderStatus, next: unknown): next is ProductionSettableStatus {
  if (!isProductionSettableStatus(next)) return false;
  return current === "production" || current === "waiting" || current === "completed";
}
