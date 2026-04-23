"use client";

import { useCallback, useEffect, useState } from "react";

import type { InventoryLot } from "@/lib/types";

export function useInventoryLots(inventoryId: string) {
  const [lots, setLots] = useState<InventoryLot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!inventoryId) {
      setLots([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/sheets/inventory-lots?inventoryId=${encodeURIComponent(inventoryId)}`,
        { cache: "no-store" },
      );
      const json = (await res.json()) as { lots?: InventoryLot[]; error?: string };
      if (json.error) throw new Error(json.error);
      setLots(json.lots ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入批次失敗");
      setLots([]);
    } finally {
      setLoading(false);
    }
  }, [inventoryId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { lots, loading, error, reload: load };
}
