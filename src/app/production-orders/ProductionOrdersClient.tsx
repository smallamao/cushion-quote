"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, Factory, FileText, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ProductionOrderView, ProductionSettableStatus } from "@/lib/production-orders";
import type { OrderStatus } from "@/lib/types";

// 工廠師傅的生產訂單。資料來自 /api/sheets/production-orders 的白名單投影：
// 沒有客戶姓名、訂單標題、地址電話、金額——畫面也就不會有。

const STATUS_BADGE: Partial<Record<OrderStatus, { label: string; className: string }>> = {
  production: { label: "製作中", className: "badge-sent" },
  waiting: { label: "待出貨", className: "badge-deleted" },
  completed: { label: "已完成", className: "badge-accepted" },
};

const NOTE_COLOR: Record<ProductionOrderView["notes"][number]["color"], string> = {
  black: "text-[var(--text-primary)]",
  red: "text-red-600",
  orange: "text-orange-600",
};

function dueDateOf(o: ProductionOrderView): string {
  return o.productionDueDate || o.deadline;
}

// 未完成的排前面、交期近的排前面；沒填交期的排最後
function compareProduction(a: ProductionOrderView, b: ProductionOrderView): number {
  const doneA = a.status === "completed" ? 1 : 0;
  const doneB = b.status === "completed" ? 1 : 0;
  if (doneA !== doneB) return doneA - doneB;
  const da = dueDateOf(a) || "9999-99-99";
  const db = dueDateOf(b) || "9999-99-99";
  return da.localeCompare(db) || a.orderNumber.localeCompare(b.orderNumber);
}

function Photos({ urls }: { urls: string[] }) {
  if (urls.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {urls.map((url) => (
        <a key={url} href={url} target="_blank" rel="noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="h-16 w-16 rounded border border-[var(--border)] object-cover" />
        </a>
      ))}
    </div>
  );
}

interface CardProps {
  order: ProductionOrderView;
  expanded: boolean;
  saving: boolean;
  viewingPdf: boolean;
  onToggle: () => void;
  onSetStatus: (status: ProductionSettableStatus) => void;
  onOpenPdf: () => void;
}

function ProductionOrderCard({ order, expanded, saving, viewingPdf, onToggle, onSetStatus, onOpenPdf }: CardProps) {
  const badge = STATUS_BADGE[order.status];
  const due = dueDateOf(order);
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] shadow-sm">
      <button type="button" onClick={onToggle} className="w-full p-3 text-left">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-sm font-semibold text-[var(--accent)]">
            {order.orderNumber || order.orderId}
          </span>
          <div className="flex items-center gap-2">
            {badge && <span className={`badge ${badge.className}`}>{badge.label}</span>}
            {expanded ? (
              <ChevronUp className="h-4 w-4 text-[var(--text-tertiary)]" />
            ) : (
              <ChevronDown className="h-4 w-4 text-[var(--text-tertiary)]" />
            )}
          </div>
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[var(--text-secondary)]">
          {order.itemCategory && <span className="font-medium text-[var(--text-primary)]">{order.itemCategory}</span>}
          <span>交期 {due || "—"}</span>
          {order.shipDate && <span>出貨 {order.shipDate}</span>}
          {order.status === "completed" && order.completedDate && <span>完成 {order.completedDate}</span>}
        </div>
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-[var(--border)] p-3">
          {/* 品項 */}
          {order.items.length > 0 && (
            <div className="space-y-2">
              {order.items.map((item) =>
                item.itemType === "header" ? (
                  <div key={item.id} className="pt-1 text-xs font-semibold text-[var(--text-secondary)]">
                    {item.name}
                  </div>
                ) : (
                  <div key={item.id} className="rounded border border-[var(--border)] p-2 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium">{item.name || "—"}</span>
                      {item.quantity && <span className="shrink-0 text-xs">× {item.quantity}</span>}
                    </div>
                    {item.dimensions && (
                      <div className="mt-1 whitespace-pre-line text-xs text-[var(--text-secondary)]">{item.dimensions}</div>
                    )}
                    <div className="mt-1 flex flex-wrap gap-x-3 text-xs">
                      {item.foamSpec && (
                        <span
                          className={
                            item.foamColor === "red"
                              ? "text-red-600"
                              : item.foamColor === "orange"
                                ? "text-orange-600"
                                : "text-[var(--text-secondary)]"
                          }
                        >
                          泡棉 {item.foamSpec}
                        </span>
                      )}
                      {item.colorCode && <span className="text-[var(--text-secondary)]">色號 {item.colorCode}</span>}
                    </div>
                    {item.subNote && <div className="mt-1 text-xs text-[var(--text-tertiary)]">{item.subNote}</div>}
                    {item.photos.length > 0 && (
                      <div className="mt-1.5">
                        <Photos urls={item.photos} />
                      </div>
                    )}
                  </div>
                ),
              )}
            </div>
          )}

          {/* 布料 */}
          {(order.materialName || order.materialCode || order.materialImageUrl) && (
            <div className="flex items-center gap-2 text-sm">
              {order.materialImageUrl && (
                <a href={order.materialImageUrl} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={order.materialImageUrl}
                    alt="布料色票"
                    className="h-14 w-14 rounded border border-[var(--border)] object-cover"
                  />
                </a>
              )}
              <div>
                <div className="text-xs text-[var(--text-tertiary)]">布料</div>
                <div>
                  {order.materialName} {order.materialCode}
                </div>
              </div>
            </div>
          )}

          {/* 注意事項 */}
          {order.notes.length > 0 && (
            <ul className="space-y-1 text-sm">
              {order.notes.map((n) => (
                <li key={n.id} className={`flex items-start gap-1 ${NOTE_COLOR[n.color] ?? ""} ${n.isWarning ? "font-semibold" : ""}`}>
                  {n.isWarning && <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                  <span className="whitespace-pre-line">{n.text}</span>
                </li>
              ))}
            </ul>
          )}

          <Photos urls={order.photos} />

          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3">
            {order.workOrderPdfUrl && (
              <Button variant="outline" size="sm" className="gap-1" disabled={viewingPdf} onClick={onOpenPdf}>
                {viewingPdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                看工單
              </Button>
            )}
            <div className="ml-auto flex gap-2">
              {order.status !== "production" && (
                <Button variant="outline" size="sm" disabled={saving} onClick={() => onSetStatus("production")}>
                  製作中
                </Button>
              )}
              {order.status !== "completed" && (
                <Button size="sm" disabled={saving} onClick={() => onSetStatus("completed")}>
                  {saving && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                  已完成
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function ProductionOrdersClient() {
  const [orders, setOrders] = useState<ProductionOrderView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [viewingPdfId, setViewingPdfId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sheets/production-orders", { cache: "no-store" });
      const json = (await res.json()) as { ok: boolean; orders?: ProductionOrderView[]; error?: string };
      if (!json.ok) {
        setError(json.error ?? "載入失敗");
        return;
      }
      setError(null);
      setOrders(json.orders ?? []);
    } catch {
      setError("載入失敗，請稍後再試");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function setStatus(order: ProductionOrderView, status: ProductionSettableStatus) {
    if (status === "completed" && !confirm(`確定 ${order.orderNumber || order.orderId} 已完成？`)) return;
    setSavingId(order.orderId);
    try {
      const res = await fetch(`/api/sheets/production-orders/${encodeURIComponent(order.orderId)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = (await res.json()) as { ok: boolean; order?: ProductionOrderView; error?: string };
      if (!json.ok || !json.order) throw new Error(json.error ?? `伺服器錯誤 ${res.status}`);
      const updated = json.order;
      setOrders((prev) => prev.map((o) => (o.orderId === updated.orderId ? updated : o)));
    } catch (err) {
      alert(err instanceof Error ? `更新失敗：${err.message}` : "更新失敗");
    } finally {
      setSavingId(null);
    }
  }

  // 同「我的行程」：先抓成 blob 再開，iOS 才不會直接下載檔案
  async function openWorkOrderPdf(order: ProductionOrderView) {
    if (!order.workOrderPdfUrl) return;
    setViewingPdfId(order.orderId);
    try {
      const res = await fetch(order.workOrderPdfUrl);
      if (!res.ok) throw new Error("讀取工單失敗");
      const buf = await res.arrayBuffer();
      const url = URL.createObjectURL(new Blob([buf], { type: "application/pdf" }));
      window.open(url, "_blank");
    } catch (err) {
      alert(err instanceof Error ? err.message : "讀取工單失敗");
    } finally {
      setViewingPdfId(null);
    }
  }

  const sorted = [...orders].sort(compareProduction);
  const activeCount = orders.filter((o) => o.status !== "completed").length;

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Factory className="h-6 w-6" />
            生產訂單
          </h1>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            待製作 {activeCount} 筆・已完成的單保留 7 天
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} aria-label="重新整理">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {loading && orders.length === 0 ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="animate-spin text-[var(--text-secondary)]" size={32} />
        </div>
      ) : error ? (
        <div className="py-12 text-center text-sm text-red-500">{error}</div>
      ) : sorted.length === 0 ? (
        <div className="py-12 text-center text-sm text-[var(--text-secondary)]">目前沒有生產中的訂單</div>
      ) : (
        <div className="space-y-2">
          {sorted.map((o) => (
            <ProductionOrderCard
              key={o.orderId}
              order={o}
              expanded={expandedId === o.orderId}
              saving={savingId === o.orderId}
              viewingPdf={viewingPdfId === o.orderId}
              onToggle={() => setExpandedId((cur) => (cur === o.orderId ? null : o.orderId))}
              onSetStatus={(s) => void setStatus(o, s)}
              onOpenPdf={() => void openWorkOrderPdf(o)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
