"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, X } from "lucide-react";

/**
 * 全站浮動照片視窗（釘在 root layout，頁面切換不會消失）。
 * 用途：在排程出貨看到訂單照片後，切去售後服務等其他功能輸入資料時仍可並排對照。
 *
 * 開啟方式：window.dispatchEvent(new CustomEvent("cq:open-floating-images", { detail }))
 * detail: { title: string; groups: string[][]; startIndex?: number }
 *   groups 為每張圖的候選 URL 陣列（依序 fallback），已是可直接載入的 src。
 */

export interface FloatingImagesDetail {
  title: string;
  groups: string[][];
  startIndex?: number;
}

export const FLOATING_IMAGES_EVENT = "cq:open-floating-images";

export function openFloatingImages(detail: FloatingImagesDetail) {
  window.dispatchEvent(new CustomEvent<FloatingImagesDetail>(FLOATING_IMAGES_EVENT, { detail }));
}

function FallbackImg({ urls, className, alt }: { urls: string[]; className: string; alt: string }) {
  const [i, setI] = useState(0);
  useEffect(() => setI(0), [urls]);
  const src = urls[i];
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} onError={() => setI((k) => k + 1)} draggable={false} />;
}

const MIN_W = 260;
const MIN_H = 200;

export function FloatingImageViewer() {
  const [payload, setPayload] = useState<FloatingImagesDetail | null>(null);
  const [index, setIndex] = useState(0);
  const [minimized, setMinimized] = useState(false);
  // 位置與尺寸（px），預設右下角
  const [box, setBox] = useState({ x: 0, y: 0, w: 420, h: 480 });
  const dragRef = useRef<{ mode: "move" | "resize"; sx: number; sy: number; ox: number; oy: number; ow: number; oh: number } | null>(null);

  // 接收開啟事件
  useEffect(() => {
    function onOpen(e: Event) {
      const d = (e as CustomEvent<FloatingImagesDetail>).detail;
      if (!d || !d.groups?.length) return;
      setPayload(d);
      setIndex(Math.min(Math.max(d.startIndex ?? 0, 0), d.groups.length - 1));
      setMinimized(false);
      // 首次開啟放右下角
      setBox((b) => {
        if (b.x || b.y) return b;
        const w = Math.min(420, window.innerWidth - 24);
        const h = Math.min(480, window.innerHeight - 24);
        return { x: window.innerWidth - w - 16, y: window.innerHeight - h - 16, w, h };
      });
    }
    window.addEventListener(FLOATING_IMAGES_EVENT, onOpen);
    return () => window.removeEventListener(FLOATING_IMAGES_EVENT, onOpen);
  }, []);

  const total = payload?.groups.length ?? 0;
  const prev = useCallback(() => setIndex((i) => (i - 1 + total) % total), [total]);
  const next = useCallback(() => setIndex((i) => (i + 1) % total), [total]);

  // 拖曳移動 / 拉角縮放
  useEffect(() => {
    function onMove(e: PointerEvent) {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.sx;
      const dy = e.clientY - d.sy;
      if (d.mode === "move") {
        setBox((b) => ({
          ...b,
          x: Math.min(Math.max(d.ox + dx, 8 - b.w + 80), window.innerWidth - 80),
          y: Math.min(Math.max(d.oy + dy, 0), window.innerHeight - 40),
        }));
      } else {
        setBox((b) => ({
          ...b,
          w: Math.max(MIN_W, d.ow + dx),
          h: Math.max(MIN_H, d.oh + dy),
        }));
      }
    }
    function onUp() {
      dragRef.current = null;
      document.body.style.userSelect = "";
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  function startDrag(mode: "move" | "resize", e: React.PointerEvent) {
    e.preventDefault();
    dragRef.current = { mode, sx: e.clientX, sy: e.clientY, ox: box.x, oy: box.y, ow: box.w, oh: box.h };
    document.body.style.userSelect = "none";
  }

  if (!payload) return null;
  const urls = payload.groups[index] ?? [];

  // 最小化：縮成右下角一顆膠囊
  if (minimized) {
    return (
      <button
        onClick={() => setMinimized(false)}
        className="fixed bottom-4 right-4 z-[60] flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs shadow-lg hover:bg-[var(--bg-hover)]"
        title="展開訂單照片"
      >
        <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
        📷 {payload.title}
        {total > 1 && <span className="text-[var(--text-tertiary)]">{index + 1}/{total}</span>}
      </button>
    );
  }

  return (
    <div
      className="fixed z-[60] flex flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] shadow-2xl"
      style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
    >
      {/* 標題列：拖曳移動 */}
      <div
        onPointerDown={(e) => startDrag("move", e)}
        className="flex cursor-move select-none items-center gap-2 border-b border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1.5 text-xs"
      >
        <span className="truncate font-medium">📷 {payload.title}</span>
        {total > 1 && <span className="shrink-0 text-[var(--text-tertiary)]">{index + 1} / {total}</span>}
        <span className="flex-1" />
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setMinimized(true)}
          className="rounded p-1 hover:bg-[var(--bg-hover)]"
          title="最小化"
        >
          <Minimize2 className="h-3.5 w-3.5" />
        </button>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setBox({ x: 16, y: 16, w: window.innerWidth - 32, h: window.innerHeight - 32 })}
          className="rounded p-1 hover:bg-[var(--bg-hover)]"
          title="放大到全畫面"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setPayload(null)}
          className="rounded p-1 hover:bg-[var(--bg-hover)]"
          title="關閉"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* 圖片區 */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black/90">
        <FallbackImg urls={urls} alt="訂單照片" className="max-h-full max-w-full object-contain" />
        {total > 1 && (
          <>
            <button
              onClick={prev}
              className="absolute left-1.5 top-1/2 -translate-y-1/2 rounded-full bg-white/15 p-1.5 text-white hover:bg-white/30"
              title="上一張"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={next}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full bg-white/15 p-1.5 text-white hover:bg-white/30"
              title="下一張"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        )}
      </div>

      {/* 縮圖列 */}
      {total > 1 && (
        <div className="flex gap-1 overflow-x-auto border-t border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5">
          {payload.groups.map((g, k) => (
            <button
              key={k}
              onClick={() => setIndex(k)}
              className={`h-10 w-10 shrink-0 overflow-hidden rounded border ${k === index ? "border-[var(--accent)]" : "border-transparent opacity-60 hover:opacity-100"}`}
            >
              <FallbackImg urls={g} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {/* 右下角縮放把手 */}
      <div
        onPointerDown={(e) => startDrag("resize", e)}
        className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize"
        title="拖曳調整大小"
      >
        <svg viewBox="0 0 16 16" className="h-4 w-4 text-[var(--text-tertiary)]">
          <path d="M14 2L2 14M14 8l-6 6M14 14h0" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
      </div>
    </div>
  );
}
