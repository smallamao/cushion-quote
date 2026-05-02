"use client";

import { useCallback, useEffect, useState } from "react";

import { cachedFetch, invalidateCache } from "@/lib/fetch-cache";
import type { DriverRecord } from "@/lib/drivers-sheet";

const CACHE_KEY = "cq-drivers-cache";
const TTL = 5 * 60 * 1000;

export type { DriverRecord };

export function useDrivers() {
  const [drivers, setDrivers] = useState<DriverRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      if (force) invalidateCache(CACHE_KEY);
      const data = await cachedFetch<DriverRecord[]>(CACHE_KEY, TTL, async () => {
        const res = await fetch("/api/sheets/drivers", { cache: "no-store" });
        const json = (await res.json()) as { ok: boolean; drivers?: DriverRecord[]; error?: string };
        if (!json.ok) throw new Error(json.error ?? "載入失敗");
        return json.drivers ?? [];
      });
      setDrivers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  return { drivers, loading, error, reload: () => void reload(true) };
}

export function useActiveDrivers() {
  const { drivers, loading, error, reload } = useDrivers();
  return { drivers: drivers.filter((d) => d.active), loading, error, reload };
}
