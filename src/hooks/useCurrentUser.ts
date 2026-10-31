"use client";

import { useEffect, useState } from "react";

import { invalidateCache } from "@/lib/fetch-cache";
import type { UserRole } from "@/lib/types";

export interface CurrentUser {
  userId: string;
  email: string;
  displayName: string;
  role: UserRole;
  picture?: string | null;
}

const CACHE_KEY = "cq-current-user-cache";
const TTL = 5 * 60 * 1000;

function readCachedUser(): CurrentUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data: CurrentUser | null; ts: number };
    if (Date.now() - parsed.ts < TTL) return parsed.data;
    return null;
  } catch {
    return null;
  }
}

export function useCurrentUser(): {
  user: CurrentUser | null;
  loading: boolean;
  refresh: () => void;
} {
  // Initialise from localStorage so sidebar renders immediately on cached visits
  const [user, setUser] = useState<CurrentUser | null>(() => readCachedUser());
  const [loading, setLoading] = useState(() => readCachedUser() === null);
  const [tick, setTick] = useState(0);

  // 🔴 身分一律向伺服器重新確認，快取只拿來讓畫面先長出來（老闆 2026-10-31）。
  //    原本走 cachedFetch：TTL 五分鐘內連 /api/auth/me 都不會打，於是按了登出、
  //    cookie 清掉了，右上角還是顯示原本的使用者，要等五分鐘才會消失；同一台電腦
  //    換人登入也會先看到上一個人。身分不是可以放著過期的資料。
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const json = (await res.json()) as { ok: boolean; user?: CurrentUser };
        const data = json.ok && json.user ? json.user : null;
        if (cancelled) return;
        setUser(data);
        if (data) {
          try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
          } catch {
            // localStorage 滿了就算了，不影響已取得的身分
          }
        } else {
          // 沒登入就不該留著上一個人的名字
          invalidateCache(CACHE_KEY);
        }
      } catch {
        // 網路失敗時保留畫面上既有的身分，不要無故把人登出
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  return {
    user,
    loading,
    refresh: () => {
      invalidateCache(CACHE_KEY);
      setTick((t) => t + 1);
    },
  };
}
