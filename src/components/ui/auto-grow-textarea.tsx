"use client";

import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from "react";

/**
 * 跟著內容自動長高的文字框（老闆 2026-11-09：報價品名固定 3 行，字多要一直在框裡捲動）。
 *
 * - rows 是最小高度，內容少時版面跟原本一樣
 * - 欄寬被拖拉改變時（報價表可調欄寬），換行數會變，重新量一次
 * - 保留 resize-y：想手動再拉大還是可以（下次打字會重新貼合內容）
 *
 * 不用 CSS field-sizing：Safari 還不支援，老闆與師傅都有人用 iPhone。
 */
export function AutoGrowTextarea({
  className = "",
  value,
  rows = 3,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // 內容變了就重量
  useLayoutEffect(() => {
    fit(ref.current);
  }, [value]);

  // 寬度變了也要重量；只看寬度，避免自己改高度又觸發自己
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let lastWidth = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth !== lastWidth) {
        lastWidth = el.clientWidth;
        fit(el);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <textarea
      ref={ref}
      rows={rows}
      value={value}
      className={`resize-y overflow-hidden ${className}`}
      {...props}
    />
  );
}

/** 先縮回 auto 再量 scrollHeight，刪字時才縮得回來；邊框不含在 scrollHeight 裡要補上 */
function fit(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  const border = el.offsetHeight - el.clientHeight;
  el.style.height = `${el.scrollHeight + border}px`;
}
