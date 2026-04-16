"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const POLL_INTERVAL = 15_000; // 15 秒，小團隊在 Sheets API 配額內

export interface UnreadItem {
  serviceId: string;
  author: string;
  content: string;
  occurredAt: string;
}

export function useUnreadReplies() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<UnreadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  useEffect(() => {
    void fetchCount();

    function startPolling() {
      if (intervalRef.current) return;
      intervalRef.current = setInterval(() => {
        if (document.visibilityState === "visible") {
          void fetchCount();
        }
      }, POLL_INTERVAL);
    }

    function handleVisibility() {
      if (document.visibilityState === "visible") {
        void fetchCount();
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
  }, [fetchCount]);

  return { unreadCount, items, loading, markAsRead, refresh: fetchCount };
}
