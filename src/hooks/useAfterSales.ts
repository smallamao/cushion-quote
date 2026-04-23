"use client";

import { useCallback, useEffect, useState } from "react";

import { cachedFetch, invalidateCache } from "@/lib/fetch-cache";
import type { AfterSalesService } from "@/lib/types";

const CACHE_KEY = "cq-after-sales-cache";
const TTL = 2 * 60 * 1000;

export function useAfterSales() {
  const [services, setServices] = useState<AfterSalesService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      if (force) invalidateCache(CACHE_KEY);
      const data = await cachedFetch<AfterSalesService[]>(CACHE_KEY, TTL, async () => {
        const res = await fetch("/api/sheets/after-sales", { cache: "no-store" });
        const json = (await res.json()) as {
          ok: boolean;
          services?: AfterSalesService[];
          error?: string;
        };
        if (!json.ok) throw new Error(json.error ?? "載入失敗");
        return json.services ?? [];
      });
      setServices(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { services, loading, error, reload: () => reload(true) };
}
