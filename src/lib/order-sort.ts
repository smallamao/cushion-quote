import type { CustomOrder, OrderStatus } from "@/lib/types";

// 訂製訂單清單排序（對齊 Notion 訂製訂單看板的順序，操作起來最直覺）：
//   1. 狀態：排程/生產中 → 待出貨 → 完成 → 取消（進行中在上、結案在下）
//   2. 安裝/出貨日：無日期者排最前（尚未排期，浮上來提醒處理）→ 有日期新 → 舊
//   3. 下單日：新 → 舊（無日期者排最後）
//   4. 建立時間：舊 → 新（前面全平手時的穩定排序）
const STATUS_RANK: Record<OrderStatus, number> = {
  production: 0,
  waiting: 1,
  completed: 2,
  cancelled: 3,
};

/** 日期字串（YYYY-MM-DD）由新到舊排序；空值一律排最後。 */
export function cmpDateDesc(a: string | undefined, b: string | undefined): number {
  const av = a || "";
  const bv = b || "";
  if (!av && !bv) return 0;
  if (!av) return 1;
  if (!bv) return -1;
  return bv.localeCompare(av);
}

/**
 * 安裝/出貨日專用排序：尚未填日期者排最前（浮上來提醒排期），
 * 其餘由新到舊。與 cmpDateDesc 的差別只在空值方向。
 */
export function cmpInstallDate(a: string | undefined, b: string | undefined): number {
  const av = a || "";
  const bv = b || "";
  if (!av && !bv) return 0;
  if (!av) return -1;
  if (!bv) return 1;
  return bv.localeCompare(av);
}

/** 比較兩筆訂單的顯示順序（供 Array.prototype.sort 使用）。 */
export function compareOrders(a: CustomOrder, b: CustomOrder): number {
  const rank = (STATUS_RANK[a.status] ?? 99) - (STATUS_RANK[b.status] ?? 99);
  if (rank !== 0) return rank;
  const byInstall = cmpInstallDate(a.installDate, b.installDate);
  if (byInstall !== 0) return byInstall;
  const byOrderDate = cmpDateDesc(a.orderDate, b.orderDate);
  if (byOrderDate !== 0) return byOrderDate;
  return (a.createdAt || "").localeCompare(b.createdAt || "");
}
