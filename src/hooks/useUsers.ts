"use client";

import { useCallback, useEffect, useState } from "react";

import { cachedFetch, invalidateCache } from "@/lib/fetch-cache";
import type { User } from "@/lib/types";

const CACHE_KEY = "cq-users-cache";
const TTL = 5 * 60 * 1000;

export function useUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      if (force) invalidateCache(CACHE_KEY);
      const data = await cachedFetch<User[]>(CACHE_KEY, TTL, async () => {
        const res = await fetch("/api/sheets/users", { cache: "no-store" });
        const json = (await res.json()) as { ok: boolean; users?: User[]; error?: string };
        if (!json.ok) throw new Error(json.error ?? "載入失敗");
        return json.users ?? [];
      });
      setUsers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入失敗");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { users, loading, error, reload: () => load(true) };
}
