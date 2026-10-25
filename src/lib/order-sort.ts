import type { CustomOrder, OrderStatus } from "@/lib/types";

// 訂製訂單清單排序：
//   1. 狀態：待建立內容 → 待出貨 → 排程/生產中 → 完成 → 取消
//      待建立內容＝客人已簽核、訂單自動開出來了，但交期與排程還沒填。
//      擺最前面是為了避免人工遺落（老闆 2026-10-12）：沒填完就不該混進生產中的單裡。
//      待出貨排在排程/生產中之前（老闆 2026-10-25）：快要出貨的最需要盯，
//      生產中的還有時間。原本是對齊 Notion 看板的順序，這裡刻意不再對齊。
//   2. 安裝/出貨日：無日期者排最前（尚未排期，浮上來提醒處理）→ 有日期新 → 舊
//   3. 下單日：新 → 舊（無日期者排最後）
//   4. 建立時間：舊 → 新（前面全平手時的穩定排序）
const STATUS_RANK: Record<OrderStatus, number> = {
  pending_setup: 0,
  waiting: 1,
  production: 2,
  completed: 3,
  cancelled: 4,
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
