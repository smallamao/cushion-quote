"use client";

import Link from "next/link";
import { ExternalLink, Loader2, ShoppingCart } from "lucide-react";

import type { PurchaseOrder, PurchaseOrderItem, PurchaseOrderStatus } from "@/lib/types";
import { attributedPurchaseAmount, type OrderRef } from "@/lib/purchase-order-link";

const STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  draft: "草稿",
  sent: "已送出",
  confirmed: "已確認",
  received: "已到貨",
  cancelled: "已取消",
};

const STATUS_COLOR: Record<PurchaseOrderStatus, string> = {
  draft: "bg-gray-100 text-gray-700",
  sent: "bg-blue-100 text-blue-700",
  confirmed: "bg-amber-100 text-amber-700",
  received: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

function fmtMoney(n: number | null | undefined): string {
  return Number(n ?? 0).toLocaleString("zh-TW", { maximumFractionDigits: 0 });
}

interface Props {
  orderId: string;
  purchases: PurchaseOrder[];
  itemsByOrder: Record<string, PurchaseOrderItem[]>;
  orderRef: OrderRef;
  loading: boolean;
}

// 訂單頁反查：列出關聯到此訂製訂單的採購單（relatedOrderId 相符）。
// 資料由父層 OrderDetailClient 一次抓取後傳入（財務頁計成本亦共用同一份）。
// 金額顯示「歸屬本單」的部分（一張採購單可混採多張訂單的料），與財務頁成本一致。
export function LinkedPurchasesSection({ orderId, purchases, itemsByOrder, orderRef, loading }: Props) {
  const attributedOf = (p: PurchaseOrder): number =>
    attributedPurchaseAmount(p, itemsByOrder[p.orderId], orderRef);
  const total = purchases
    .filter((p) => p.status !== "cancelled")
    .reduce((s, p) => s + attributedOf(p), 0);

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-4 w-4 text-[var(--text-tertiary)]" />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
            關聯採購單
          </h3>
          {!loading && purchases.length > 0 && (
            <span className="text-xs text-[var(--text-tertiary)]">
              （{purchases.length} 張 · 未取消合計 ${fmtMoney(total)}）
            </span>
          )}
        </div>
        <Link
          href={`/purchases/new?fromOrder=${encodeURIComponent(orderId)}`}
          className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2.5 py-1 text-xs hover:bg-[var(--bg-hover)]"
        >
          <ShoppingCart className="h-3 w-3" />
          建立採購單
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-[var(--text-tertiary)]" />
        </div>
      ) : purchases.length === 0 ? (
        <p className="text-sm text-[var(--text-tertiary)]">
          尚無關聯採購單。點右上「建立採購單」以此工單品項開單，會自動帶入建議用量並關聯。
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-[var(--text-tertiary)]">
              <tr className="border-b border-[var(--border)]">
                <th className="py-2 pr-3 text-left">採購單號</th>
                <th className="py-2 pr-3 text-left">廠商</th>
                <th className="py-2 pr-3 text-left">採購日</th>
                <th className="py-2 pr-3 text-right">金額</th>
                <th className="py-2 pr-3 text-left">狀態</th>
                <th className="py-2 text-left">到貨日</th>
              </tr>
            </thead>
            <tbody>
              {purchases
                .slice()
                .sort((a, b) => b.orderId.localeCompare(a.orderId))
                .map((p) => (
                  <tr key={p.orderId} className="border-b border-[var(--border)] last:border-0">
                    <td className="py-2 pr-3">
                      <Link
                        href={`/purchases/${encodeURIComponent(p.orderId)}`}
                        className="inline-flex items-center gap-1 font-mono text-xs text-[var(--accent)] hover:underline"
                      >
                        {p.orderId}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </td>
                    <td className="py-2 pr-3 text-xs">
                      {p.supplierSnapshot?.shortName || p.supplierSnapshot?.name || "—"}
                    </td>
                    <td className="py-2 pr-3 text-xs">{p.orderDate || "—"}</td>
                    <td className="py-2 pr-3 text-right text-xs">
                      ${fmtMoney(attributedOf(p))}
                      {attributedOf(p) !== (p.totalAmount || 0) && (
                        <span className="ml-1 text-[11px] text-[var(--text-tertiary)]">
                          / 全單 ${fmtMoney(p.totalAmount)}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] ${STATUS_COLOR[p.status] ?? STATUS_COLOR.draft}`}>
                        {STATUS_LABEL[p.status] ?? p.status}
                      </span>
                    </td>
                    <td className="py-2 text-xs">{p.expectedDeliveryDate || "—"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
