import type { ARRecord } from "@/lib/types";

/**
 * 訂單上要顯示的收款摘要。
 *
 * 老闆 2026-11-14：客戶自取帶現金到現場問尾款剩多少，手機上查不到——訂單卡片一個金額
 * 都沒有、訂單詳情頁完全沒有收款資訊，桌機「收款」欄也只有一顆燈號沒有數字。
 * 要開三個畫面、搜尋兩次才問得出答案。
 *
 * 🔴 合併請款（一張應收涵蓋多張訂單）不可以把未收金額講成「這張訂單的尾款」。
 *    那個數字是整批的，當著客人的面報出去會錯。這種情況只說是合併請款，要看明細。
 */

export type PaymentTone = "paid" | "due" | "merged" | "none";

export interface PaymentSummary {
  tone: PaymentTone;
  total: number;
  received: number;
  outstanding: number;
  /** 一行字，直接顯示在卡片上 */
  label: string;
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

export function summarizePayment(
  ar: ARRecord | null | undefined,
  merged = false,
): PaymentSummary {
  if (!ar) {
    return { tone: "none", total: 0, received: 0, outstanding: 0, label: "未建應收" };
  }

  const total = ar.totalAmount ?? 0;
  const received = ar.receivedAmount ?? 0;
  const outstanding = ar.outstandingAmount ?? 0;

  if (outstanding <= 0) {
    return { tone: "paid", total, received, outstanding: 0, label: "已收清" };
  }
  if (merged) {
    // 數字屬於整張合併應收，不是這一張訂單
    return {
      tone: "merged",
      total,
      received,
      outstanding,
      label: `合併請款 · 整批尾款 ${money(outstanding)}`,
    };
  }
  return {
    tone: "due",
    total,
    received,
    outstanding,
    label: received > 0 ? `已收 ${money(received)}　尾款 ${money(outstanding)}` : `尾款 ${money(outstanding)}`,
  };
}

/** 卡片上的顏色：要收錢的才醒目 */
export function paymentToneClass(tone: PaymentTone): string {
  switch (tone) {
    case "due":
      return "text-amber-600 dark:text-amber-500 font-medium";
    case "merged":
      return "text-sky-600 dark:text-sky-400";
    case "paid":
      return "text-green-600 dark:text-green-500";
    default:
      return "text-[var(--text-tertiary)]";
  }
}

/**
 * 找出一張訂單對應的應收帳款。
 *
 * 三條路，順序不能換：
 *   1. versionId 直接對上 → 就是這張訂單自己的 AR
 *   2. versionId 被併進月結 AR → 合併請款
 *   3. AR 的 relatedOrderIds 含這張訂單 → 合併請款（無報價 B2B 合併請款）
 *
 * 已取消的 AR 不算。原本這段只寫在訂單列表裡，詳情頁要用就得複製一份——
 * 兩份遲早會走鐘，所以抽到這裡共用（老闆 2026-11-14 要在訂單上看到尾款）。
 */
export function findArForOrder(
  order: { versionId?: string; orderId: string },
  ars: readonly ARRecord[],
  versionToConsolidated?: ReadonlyMap<string, string>,
): { ar: ARRecord; merged: boolean } | null {
  const live = ars.filter((a) => a.arStatus !== "cancelled");

  if (order.versionId) {
    const direct = live.find((a) => a.versionId === order.versionId);
    if (direct) return { ar: direct, merged: false };

    const consolidatedId = versionToConsolidated?.get(order.versionId);
    if (consolidatedId) {
      const viaMonthly = live.find((a) => a.arId === consolidatedId);
      if (viaMonthly) return { ar: viaMonthly, merged: true };
    }
  }

  const viaOrders = live.find((a) => (a.relatedOrderIds ?? []).includes(order.orderId));
  return viaOrders ? { ar: viaOrders, merged: true } : null;
}
