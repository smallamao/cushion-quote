"use client";

import { useEffect, useRef } from "react";

import { POLL_INTERVAL_MS, isStale, shouldPollNow } from "@/lib/polling";

const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const;

/**
 * 有人在用才定時查詢：
 * - 掛上時查一次，之後每 2 分鐘一次
 * - 畫面在背景，或 5 分鐘沒有操作 → 跳過（不打伺服器）
 * - 切回畫面、視窗重新取得焦點、閒置後重新動滑鼠 → 若上次查詢超過 30 秒就立刻補查
 *
 * 規則與緣由見 lib/polling.ts（Vercel CPU 額度用完被暫停）。
 *
 * @param interval false＝不定時查，只在掛上、切回畫面、取得焦點、閒置後回來時補查
 *   （通知鈴鐺：老闆已改收 Telegram，2026-11-10）
 */
export function usePolling(
  fetchFn: () => void | Promise<void>,
  enabled = true,
  { interval = true }: { interval?: boolean } = {},
) {
  const fnRef = useRef(fetchFn);
  useEffect(() => {
    fnRef.current = fetchFn;
  });

  useEffect(() => {
    if (!enabled) return;
    let lastFetch = 0;
    let lastActivity = Date.now();

    const run = () => {
      lastFetch = Date.now();
      void fnRef.current();
    };
    const visible = () => document.visibilityState === "visible";
    const catchUp = () => {
      if (visible() && isStale(lastFetch, Date.now())) run();
    };

    run();

    const timer = interval
      ? setInterval(() => {
          if (shouldPollNow({ visible: visible(), lastActivityMs: lastActivity, nowMs: Date.now() })) run();
        }, POLL_INTERVAL_MS)
      : undefined;

    const onActivity = () => {
      const wasIdle = !shouldPollNow({ visible: true, lastActivityMs: lastActivity, nowMs: Date.now() });
      lastActivity = Date.now();
      if (wasIdle) catchUp();
    };
    const onReturn = () => {
      lastActivity = Date.now();
      catchUp();
    };

    for (const ev of ACTIVITY_EVENTS) window.addEventListener(ev, onActivity, { passive: true });
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);

    return () => {
      if (timer) clearInterval(timer);
      for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, onActivity);
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("focus", onReturn);
    };
  }, [enabled, interval]);
}
