"use client";

import { useCallback, useEffect, useState } from "react";

import type { AfterSalesService } from "@/lib/types";

export function useAfterSales() {
  const [services, setServices] = useState<AfterSalesService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sheets/after-sales", { cache: "no-store" });
      const json = (await res.json()) as {
        ok: boolean;
        services?: AfterSalesService[];
        error?: string;
      };
      if (!json.ok) {
        setError(json.error ?? "載入失敗");
      } else {
        setServices(json.services ?? []);
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

  return { services, loading, error, reload };
}
