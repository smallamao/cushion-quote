"use client";

import { useCallback, useState } from "react";

import { usePolling } from "@/hooks/usePolling";

export interface UnreadItem {
  serviceId: string;
  author: string;
  content: string;
  occurredAt: string;
}

/**
 * @param poll 是否定時查詢。只需要 markAsRead 的頁面（售後列表）傳 false，
 *   不要跟頂端選單重複輪詢（2026-11-10 Vercel CPU 額度用完被暫停）。
 */
export function useUnreadReplies({ poll = true }: { poll?: boolean } = {}) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<UnreadItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCount = useCallback(async () => {
    try {
      const res = await fetch("/api/sheets/after-sales/unread-count", {
        cache: "no-store",
      });
      const json = (await res.json()) as {
        ok: boolean;
        unreadCount?: number;
        items?: UnreadItem[];
      };
      if (json.ok) {
        setUnreadCount(json.unreadCount ?? 0);
        setItems(json.items ?? []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  const markAsRead = useCallback(async () => {
    try {
      await fetch("/api/sheets/after-sales/unread-count", { method: "POST" });
      setUnreadCount(0);
      setItems([]);
    } catch {
      // ignore
    }
  }, []);

  // 原本每 15 秒一次、人不在也照跑；改成 2 分鐘、閒置就停、回來補查
  usePolling(fetchCount, poll);

  return { unreadCount, items, loading, markAsRead, refresh: fetchCount };
}
