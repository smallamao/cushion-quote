"use client";

import { useEffect, useState } from "react";

import type { UserRole } from "@/lib/types";

export interface CurrentUser {
  userId: string;
  email: string;
  displayName: string;
  role: UserRole;
}

export function useCurrentUser(): {
  user: CurrentUser | null;
  loading: boolean;
  refresh: () => void;
} {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const json = (await res.json()) as {
          ok: boolean;
          user?: CurrentUser;
        };
        if (!cancelled) {
          setUser(json.ok && json.user ? json.user : null);
        }
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

  return { user, loading, refresh: () => setTick((t) => t + 1) };
}
