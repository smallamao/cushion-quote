"use client";

import { useCallback, useEffect, useState } from "react";

import { cachedFetch, invalidateCache } from "@/lib/fetch-cache";
import type { AfterSalesService } from "@/lib/types";

// v2：快取內容由「services 陣列」改為含 dispatchPaths 的物件，換 key 避免讀到舊格式。
const CACHE_KEY = "cq-after-sales-cache-v2";
const TTL = 2 * 60 * 1000;

interface AfterSalesPayload {
  services: AfterSalesService[];
  /** serviceId → 派工連結站內路徑（已結案/已取消的單不會有） */
  dispatchPaths: Record<string, string>;
}

export function useAfterSales() {
  const [services, setServices] = useState<AfterSalesService[]>([]);
  const [dispatchPaths, setDispatchPaths] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      if (force) invalidateCache(CACHE_KEY);
      const data = await cachedFetch<AfterSalesPayload>(CACHE_KEY, TTL, async () => {
        const res = await fetch("/api/sheets/after-sales", { cache: "no-store" });
        const json = (await res.json()) as {
          ok: boolean;
          services?: AfterSalesService[];
          dispatchPaths?: Record<string, string>;
          error?: string;
        };
        if (!json.ok) throw new Error(json.error ?? "載入失敗");
        return { services: json.services ?? [], dispatchPaths: json.dispatchPaths ?? {} };
      });
      // 防禦：萬一取到舊版快取（純陣列），仍能正常顯示列表
      if (Array.isArray(data)) {
        setServices(data as AfterSalesService[]);
        setDispatchPaths({});
      } else {
        setServices(data.services ?? []);
        setDispatchPaths(data.dispatchPaths ?? {});
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { services, dispatchPaths, loading, error, reload: () => reload(true) };
}
