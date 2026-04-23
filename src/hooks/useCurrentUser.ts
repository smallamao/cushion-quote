"use client";

import { useEffect, useState } from "react";

import { cachedFetch, invalidateCache } from "@/lib/fetch-cache";
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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await cachedFetch<CurrentUser | null>(CACHE_KEY, TTL, async () => {
          const res = await fetch("/api/auth/me", { cache: "no-store" });
          const json = (await res.json()) as { ok: boolean; user?: CurrentUser };
          return json.ok && json.user ? json.user : null;
        });
        if (!cancelled) setUser(data);
      } catch {
        if (!cancelled) setUser(null);
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
