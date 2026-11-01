"use client";

import { useEffect } from "react";
import { Loader2, X } from "lucide-react";

// 生產訂單用的兩個全螢幕浮層：已完成確認（底部抽屜）、看大圖。

/** Esc 關閉 */
function useEscape(onClose: () => void) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
}

/**
 * 「已完成」確認。取代瀏覽器 confirm()：iOS 上的原生彈窗字小、也看不出是哪一張單。
 * 訂單號碼放最大，師傅確認的是「這一張」。
 */
export function CompleteConfirmSheet({
  orderNumber,
  itemCategory,
  saving,
  onConfirm,
  onCancel,
}: {
  orderNumber: string;
  itemCategory: string;
  saving: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEscape(onCancel);
  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col justify-end bg-black/45"
      role="dialog"
      aria-modal="true"
      aria-label="確認已完成"
      onClick={saving ? undefined : onCancel}
    >
      <div
        className="mx-auto w-full max-w-lg rounded-t-[20px] bg-[var(--bg-elevated)] px-5 pb-[calc(28px+env(safe-area-inset-bottom))] pt-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-[var(--border-strong)]" aria-hidden />
        <div className="text-center font-mono text-[40px] font-black leading-none tracking-wide tabular-nums">
          {orderNumber}
        </div>
        <div className="mt-3 text-center text-[22px] font-bold text-[var(--text-primary)]">
          {itemCategory ? `${itemCategory} ` : ""}確定已完成？
        </div>
        <div className="mt-6 space-y-3">
          <button
            type="button"
            onClick={onConfirm}
            disabled={saving}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--success)] text-[20px] font-bold text-white shadow-sm active:opacity-90 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-5 w-5 animate-spin" />}
            確定已完成
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="flex h-14 w-full items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[19px] font-bold text-[var(--text-secondary)] disabled:opacity-60"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}

/** 點縮圖看大圖；點任何地方關閉 */
export function ImageLightbox({ url, alt, onClose }: { url: string; alt: string; onClose: () => void }) {
  useEscape(onClose);
  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/90 p-3"
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="關閉"
        className="absolute right-3 top-[calc(12px+env(safe-area-inset-top))] flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-white"
      >
        <X className="h-7 w-7" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={alt} className="max-h-full max-w-full object-contain" />
    </div>
  );
}
