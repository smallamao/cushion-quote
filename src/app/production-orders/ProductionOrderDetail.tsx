"use client";

import { AlertTriangle, ArrowLeft, FileText, Loader2 } from "lucide-react";

import { STATUS_BADGE } from "@/app/production-orders/ProductionOrderList";
import type { ProductionOrderItemView, ProductionOrderView, ProductionSettableStatus } from "@/lib/production-orders";
import { dueLabel } from "@/lib/production-groups";

// 訂單詳細頁：布料 → 品項 → 注意事項 → 照片，底部固定操作列。
// 尺寸、色號是師傅照著做的數字，字級最大、尺寸用等寬字。

const NOTE_COLOR: Record<ProductionOrderView["notes"][number]["color"], string> = {
  black: "text-[var(--text-primary)]",
  red: "text-[var(--error)]",
  orange: "text-[var(--warning)]",
};

const FOAM_PILL: Record<string, string> = {
  orange: "border-[var(--warning)] bg-[var(--warning-light)] text-[var(--warning)]",
  red: "border-[var(--error)] bg-[var(--error-light)] text-[var(--error)]",
};
const FOAM_PILL_DEFAULT = "border-[var(--border)] bg-[var(--bg-hover)] text-[var(--text-primary)]";

const LABEL = "text-[15px] font-bold tracking-wider text-[var(--text-secondary)]";

function Thumbs({ urls, size, onView }: { urls: string[]; size: string; onView: (url: string) => void }) {
  if (urls.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {urls.map((url) => (
        <button key={url} type="button" onClick={() => onView(url)} aria-label="看大圖" className="shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className={`${size} rounded-[var(--radius-sm)] border border-[var(--border)] object-cover`} />
        </button>
      ))}
    </div>
  );
}

function ItemBlock({ item, onView }: { item: ProductionOrderItemView; onView: (url: string) => void }) {
  if (item.itemType === "header") {
    return <h3 className="px-1 pt-2 text-[20px] font-bold text-[var(--text-primary)]">{item.name}</h3>;
  }
  return (
    <div className="space-y-2.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] p-4 shadow-sm">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[22px] font-bold leading-tight text-[var(--text-primary)]">{item.name || "—"}</span>
        {item.quantity && (
          <span className="shrink-0 text-[22px] font-bold text-[var(--text-primary)]">× {item.quantity}</span>
        )}
      </div>
      {item.dimensions && (
        <div className="whitespace-pre-line font-mono text-[21px] font-bold leading-snug tracking-wide text-[var(--text-primary)]">
          {item.dimensions}
        </div>
      )}
      {item.foamSpec && (
        <div className="flex flex-wrap items-center gap-2">
          <span className={LABEL}>泡棉</span>
          <span
            className={`inline-flex items-center rounded-full border px-3 py-1 text-[19px] font-bold leading-tight ${
              FOAM_PILL[item.foamColor ?? ""] ?? FOAM_PILL_DEFAULT
            }`}
          >
            {item.foamSpec}
          </span>
        </div>
      )}
      {item.colorCode && (
        <div className="flex items-baseline gap-2">
          <span className={LABEL}>色號</span>
          <span className="text-[24px] font-black tabular-nums text-[var(--error)]">{item.colorCode}</span>
        </div>
      )}
      {item.subNote && (
        <div className="whitespace-pre-line text-[19px] text-[var(--text-secondary)]">{item.subNote}</div>
      )}
      <Thumbs urls={item.photos} size="h-24 w-24" onView={onView} />
    </div>
  );
}

export function ProductionOrderDetail({
  order,
  today,
  saving,
  viewingPdf,
  onBack,
  onSetProduction,
  onRequestComplete,
  onOpenPdf,
  onViewImage,
}: {
  order: ProductionOrderView;
  today: string;
  /** 正在送出的目標狀態（null＝沒在送） */
  saving: ProductionSettableStatus | null;
  viewingPdf: boolean;
  onBack: () => void;
  onSetProduction: () => void;
  onRequestComplete: () => void;
  onOpenPdf: () => void;
  onViewImage: (url: string) => void;
}) {
  const badge = STATUS_BADGE[order.status];
  const hasMaterial = Boolean(order.materialName || order.materialCode || order.materialImageUrl);
  const warnings = order.notes.filter((n) => n.isWarning);
  const plainNotes = order.notes.filter((n) => !n.isWarning);
  // 允許的變更同 canSetProductionStatus：待出貨／已完成 → 製作中、製作中／待出貨 → 已完成
  const canSetProduction = order.status !== "production";
  const canComplete = order.status !== "completed";
  const due =
    order.status === "completed"
      ? `完成 ${order.completedDate ? order.completedDate.slice(0, 10) : "—"}`
      : `交期 ${dueLabel(order, today)}`;

  return (
    <div>
      {/* 頁首 */}
      <div className="flex items-center gap-3 border-b border-[var(--border)] pb-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="返回清單"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--text-primary)]"
        >
          <ArrowLeft className="h-6 w-6" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[28px] font-black leading-none tracking-wide tabular-nums">
            {order.orderNumber || order.orderId}
          </div>
          <div className="mt-1 text-[19px] text-[var(--text-secondary)]">
            {[order.itemCategory, due].filter(Boolean).join("・")}
          </div>
        </div>
        {badge && (
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[15px] font-bold ${badge.className}`}>
            {badge.label}
          </span>
        )}
      </div>

      <div className="space-y-4 py-4">
        {/* 警示備註放最上面：布料方向、特殊做法這種一做錯就要重來的事 */}
        {warnings.length > 0 && (
          <div className="space-y-2">
            {warnings.map((n) => (
              <div
                key={n.id}
                className="flex items-start gap-2.5 rounded-r-[var(--radius-md)] border-l-4 border-[var(--error)] bg-[var(--error-light)] p-3"
              >
                <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-[var(--error)]" aria-hidden />
                <span className="whitespace-pre-line text-[19px] font-bold leading-snug text-[var(--error)]">{n.text}</span>
              </div>
            ))}
          </div>
        )}

        {/* 布料 */}
        {hasMaterial && (
          <div className="flex items-start gap-4 rounded-[var(--radius-md)] bg-[var(--bg-subtle)] p-3">
            {order.materialImageUrl && (
              <button
                type="button"
                onClick={() => onViewImage(order.materialImageUrl)}
                aria-label="看布料大圖"
                className="shrink-0"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={order.materialImageUrl}
                  alt="布料色票"
                  className="h-[120px] w-[120px] rounded-[var(--radius-sm)] border border-[var(--border)] object-cover"
                />
              </button>
            )}
            <div className="min-w-0 flex-1">
              <div className={LABEL}>布料</div>
              {order.materialName && (
                <div className="mt-1 text-[22px] font-bold leading-tight text-[var(--text-primary)]">{order.materialName}</div>
              )}
              {order.materialCode && (
                <div className="mt-1 text-[26px] font-black tabular-nums tracking-wide text-[var(--error)]">
                  {order.materialCode}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 品項 */}
        {order.items.length > 0 && (
          <div className="space-y-2.5">
            {order.items.map((item) => (
              <ItemBlock key={item.id} item={item} onView={onViewImage} />
            ))}
          </div>
        )}

        {/* 一般備註 */}
        {plainNotes.length > 0 && (
          <ul className="space-y-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
            {plainNotes.map((n) => (
              <li key={n.id} className={`flex items-start gap-2 text-[19px] leading-snug ${NOTE_COLOR[n.color] ?? ""}`}>
                <span className="mt-[11px] h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
                <span className="whitespace-pre-line">{n.text}</span>
              </li>
            ))}
          </ul>
        )}

        {/* 訂單照片 */}
        {order.photos.length > 0 && (
          <div className="space-y-2">
            <div className={LABEL}>照片</div>
            <Thumbs urls={order.photos} size="h-28 w-28" onView={onViewImage} />
          </div>
        )}
      </div>

      {/* 底部固定操作列。z 要蓋過右下角的 AI 助手圓鈕，免得它壓在「已完成」上 */}
      <div className="sticky bottom-0 z-[75] -mx-4 flex items-center gap-2 border-t border-[var(--border)] bg-[var(--bg-elevated)] px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] sm:mx-0 sm:rounded-t-[var(--radius-lg)]">
        {order.workOrderPdfUrl && (
          <button
            type="button"
            onClick={onOpenPdf}
            disabled={viewingPdf}
            className="flex h-14 shrink-0 items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 text-[18px] font-bold text-[var(--text-primary)] disabled:opacity-60"
          >
            {viewingPdf ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileText className="h-5 w-5" />}
            工單
          </button>
        )}
        {canSetProduction && (
          <button
            type="button"
            onClick={onSetProduction}
            disabled={saving !== null}
            className="flex h-14 flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--bg-subtle)] text-[19px] font-bold text-[var(--text-primary)] disabled:opacity-60"
          >
            {saving === "production" && <Loader2 className="h-5 w-5 animate-spin" />}
            {order.status === "completed" ? "改回製作中" : "製作中"}
          </button>
        )}
        {canComplete && (
          <button
            type="button"
            onClick={onRequestComplete}
            disabled={saving !== null}
            className="flex h-14 flex-[1.3] items-center justify-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--success)] text-[19px] font-bold text-white shadow-sm disabled:opacity-60"
          >
            已完成
          </button>
        )}
      </div>
    </div>
  );
}
