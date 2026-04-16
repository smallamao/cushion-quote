"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const POLL_INTERVAL = 60_000; // 60 秒

export function useUnreadReplies() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchCount = useCallback(async () => {
    try {
      const res = await fetch("/api/sheets/after-sales/unread-count", {
        cache: "no-store",
      });
      const json = (await res.json()) as { ok: boolean; unreadCount?: number };
      if (json.ok) {
        setUnreadCount(json.unreadCount ?? 0);
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

  return { unreadCount, loading, markAsRead, refresh: fetchCount };
}
