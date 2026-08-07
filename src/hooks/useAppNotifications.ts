"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const POLL_INTERVAL = 30_000;
const LS_KEY = "cq-notif-last-read";

export interface AppNotifItem {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string;
  createdAt: string;
}

/**
 * 後台通用通知（目前：報價單線上簽署）。已讀狀態存 localStorage（per device），
 * 未讀＝ createdAt 晚於上次已讀時間。首次無紀錄時以「現在」為基準，避免歷史全被標未讀。
 */
export function useAppNotifications(enabled = true) {
  const [items, setItems] = useState<AppNotifItem[]>([]);
  const [lastRead, setLastRead] = useState<string>("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let lr = "";
    try {
      lr = localStorage.getItem(LS_KEY) ?? "";
    } catch {
      /* ignore */
    }
    if (!lr) {
      lr = new Date().toISOString();
      try {
        localStorage.setItem(LS_KEY, lr);
      } catch {
        /* ignore */
      }
    }
    setLastRead(lr);
  }, []);

  const fetchItems = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await fetch("/api/sheets/notifications", { cache: "no-store" });
      const json = (await res.json()) as { ok: boolean; items?: AppNotifItem[] };
      if (json.ok) setItems(json.items ?? []);
    } catch {
      /* ignore */
    }
  }, [enabled]);

  const markAsRead = useCallback(() => {
    const now = new Date().toISOString();
    try {
      localStorage.setItem(LS_KEY, now);
    } catch {
      /* ignore */
    }
    setLastRead(now);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void fetchItems();
    function startPolling() {
      if (intervalRef.current) return;
      intervalRef.current = setInterval(() => {
        if (document.visibilityState === "visible") void fetchItems();
      }, POLL_INTERVAL);
    }
    function handleVisibility() {
      if (document.visibilityState === "visible") {
        void fetchItems();
        startPolling();
      } else if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    startPolling();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [fetchItems, enabled]);

  const unread = items.filter((i) => i.createdAt > lastRead);
  return { items, unread, unreadCount: unread.length, markAsRead };
}
