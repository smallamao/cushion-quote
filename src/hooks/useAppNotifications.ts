"use client";

import { useCallback, useEffect, useState } from "react";

import { usePolling } from "@/hooks/usePolling";
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

  // 原本每 30 秒一次、人不在也照跑；改成 2 分鐘、閒置就停、回來補查
  usePolling(fetchItems, enabled);

  const unread = items.filter((i) => i.createdAt > lastRead);
  return { items, unread, unreadCount: unread.length, markAsRead };
}
