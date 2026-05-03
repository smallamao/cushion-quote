"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, ExternalLink, Loader2, X } from "lucide-react";

import type { PurchaseOrder, PurchaseOrderItem } from "@/lib/types";
import { fetchPurchaseOrder } from "@/hooks/usePurchases";

const STATUS_ORDER = ["draft", "sent", "confirmed", "received", "cancelled"] as const;
type PurchaseStatus = (typeof STATUS_ORDER)[number];

interface Props {
  orderId: string | null;
  onClose: () => void;
  onStatusChange?: () => void;
}

function fmtMoney(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  return (Number.isFinite(v) ? v : 0).toLocaleString("zh-TW", { maximumFractionDigits: 0 });
}

const STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  sent: "已送出",
  confirmed: "已確認",
  received: "已到貨",
  cancelled: "已取消",
};

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  sent: "bg-blue-100 text-blue-700",
  confirmed: "bg-amber-100 text-amber-700",
  received: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

export function PurchasePreviewDrawer({ orderId, onClose, onStatusChange }: Props) {
  const [order, setOrder] = useState<PurchaseOrder | null>(null);
  const [items, setItems] = useState<PurchaseOrderItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showStatusMenu) return;
    function handleClickOutside(e: MouseEvent) {
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) {
        setShowStatusMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showStatusMenu]);

  async function handleStatusChange(newStatus: PurchaseStatus) {
    if (!orderId || !order || order.status === newStatus || updatingStatus) return;
    setShowStatusMenu(false);
    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/sheets/purchases/${encodeURIComponent(orderId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("更新狀態失敗");
      setOrder((prev) => prev ? { ...prev, status: newStatus } : prev);
      onStatusChange?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : "更新狀態失敗");
    } finally {
      setUpdatingStatus(false);
    }
  }

  useEffect(() => {
    if (!orderId) {
      setOrder(null);
      setItems([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(false);
    void fetchPurchaseOrder(orderId).then((result) => {
      if (cancelled) return;
      if (!result) { setError(true); }
      else { setOrder(result.order); setItems(result.items); }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [orderId]);

  const open = Boolean(orderId);

  return (
    <>
      {/* Backdrop */}
      <div
        className={[
          "fixed inset-0 z-40 bg-black/30 transition-opacity duration-200",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        ].join(" ")}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={[
          "fixed right-0 top-0 z-50 flex h-full w-full max-w-[560px] flex-col bg-[var(--bg-elevated)] shadow-2xl transition-transform duration-200",
          open ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="font-mono text-base font-semibold text-[var(--text-primary)]">
              {orderId ?? ""}
            </span>
            {order && (
              <div ref={statusRef} className="relative">
                <button
                  onClick={() => setShowStatusMenu((v) => !v)}
                  disabled={updatingStatus}
                  className={[
                    "flex items-center gap-1 rounded-full px-3 py-1 text-sm transition-all disabled:opacity-50",
                    STATUS_COLOR[order.status] ?? "",
                  ].join(" ")}
                >
                  {updatingStatus ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  {STATUS_LABEL[order.status] ?? order.status}
                  <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                </button>
                {showStatusMenu && (
                  <div className="absolute left-0 top-full z-10 mt-1 min-w-[6rem] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] shadow-lg">
                    {STATUS_ORDER.filter((s) => s !== order.status).map((s) => (
                      <button
                        key={s}
                        onClick={() => void handleStatusChange(s)}
                        className={[
                          "flex w-full items-center px-3 py-2 text-sm hover:bg-[var(--bg-hover)]",
                          STATUS_COLOR[s] ?? "",
                        ].join(" ")}
                      >
                        {STATUS_LABEL[s]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {orderId && (
              <Link
                href={`/purchases/${orderId}`}
                className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]"
              >
                <ExternalLink className="h-4 w-4" />
                完整編輯
              </Link>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && (
            <div className="flex items-center justify-center py-16 text-[var(--text-tertiary)]">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}

          {!loading && error && (
            <p className="py-16 text-center text-sm text-[var(--text-tertiary)]">載入失敗，請重試</p>
          )}

          {!loading && order && (
            <>
              {/* Order meta */}
              <div className="mb-5 grid grid-cols-2 gap-x-4 gap-y-2.5 text-base">
                <div className="text-[var(--text-tertiary)]">廠商</div>
                <div className="text-[var(--text-primary)]">
                  {order.supplierSnapshot?.shortName || order.supplierSnapshot?.name || order.supplierId}
                </div>
                <div className="text-[var(--text-tertiary)]">採購日期</div>
                <div className="text-[var(--text-primary)]">{order.orderDate}</div>
                {order.expectedDeliveryDate && (
                  <>
                    <div className="text-[var(--text-tertiary)]">預計到貨</div>
                    <div className="text-[var(--text-primary)]">{order.expectedDeliveryDate}</div>
                  </>
                )}
                {order.notes && (
                  <>
                    <div className="text-[var(--text-tertiary)]">附註</div>
                    <div className="text-[var(--text-primary)]">{order.notes}</div>
                  </>
                )}
              </div>

              {/* Items table */}
              <div className="overflow-hidden rounded-lg border border-[var(--border)]">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-medium">品項</th>
                      <th className="px-4 py-2.5 text-right font-medium">數量</th>
                      <th className="px-4 py-2.5 text-right font-medium">進價</th>
                      <th className="px-4 py-2.5 text-right font-medium">小計</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {items.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-[var(--text-tertiary)]">
                          無明細
                        </td>
                      </tr>
                    )}
                    {items.map((item) => (
                      <tr key={item.itemId} className="hover:bg-[var(--bg-hover)]">
                        <td className="px-4 py-3">
                          <div className="flex items-baseline gap-2">
                            {item.productSnapshot.specification && (
                              <span className="text-base font-medium text-[var(--text-primary)]">
                                {item.productSnapshot.specification}
                              </span>
                            )}
                            {item.notes && (
                              <span className="font-mono text-xs text-[var(--text-tertiary)]">#{item.notes}</span>
                            )}
                          </div>
                          <div className="text-sm text-[var(--text-secondary)]">
                            {item.productSnapshot.productName}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-[var(--text-secondary)]">
                          {item.quantity} {item.productSnapshot.unit}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-[var(--text-secondary)]">
                          ${fmtMoney(item.unitPrice)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-[var(--text-primary)]">
                          ${fmtMoney(item.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div className="mt-4 space-y-1.5 text-right text-base">
                {order.shippingFee > 0 && (
                  <div className="text-[var(--text-secondary)]">
                    運費 <span className="font-mono">${fmtMoney(order.shippingFee)}</span>
                  </div>
                )}
                {order.taxAmount > 0 && (
                  <div className="text-[var(--text-secondary)]">
                    稅額 <span className="font-mono">${fmtMoney(order.taxAmount)}</span>
                  </div>
                )}
                <div className="text-lg font-semibold text-[var(--text-primary)]">
                  合計 <span className="font-mono">${fmtMoney(order.totalAmount)}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
