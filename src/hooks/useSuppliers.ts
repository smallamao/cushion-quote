"use client";

import { useCallback, useEffect, useState } from "react";

import type { Supplier } from "@/lib/types";

const CACHE_KEY = "cq-suppliers-cache";
const TTL = 5 * 60 * 1000;

function readCachedSuppliers(): Supplier[] | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;

    const parsed = JSON.parse(cached) as { data: Supplier[]; ts: number };
    if (Date.now() - parsed.ts >= TTL) {
      return null;
    }

    return parsed.data ?? [];
  } catch {
    localStorage.removeItem(CACHE_KEY);
    return null;
  }
}

export function useSuppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    try {
      if (!force) {
        const cachedSuppliers = readCachedSuppliers();
        if (cachedSuppliers) {
          setSuppliers(cachedSuppliers);
          setLoading(false);
          return;
        }
      }

      const res = await fetch("/api/sheets/suppliers", { cache: "no-store" });
      if (!res.ok) throw new Error("load suppliers");
      const payload = (await res.json()) as { suppliers: Supplier[] };
      setSuppliers(payload.suppliers);
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ data: payload.suppliers, ts: Date.now() })
      );
    } catch {
      setSuppliers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const addSupplier = useCallback(
    async (s: Supplier) => {
      const res = await fetch("/api/sheets/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(s),
      });
      if (!res.ok) throw new Error("新增廠商失敗");
      localStorage.removeItem(CACHE_KEY);
      await load(true);
    },
    [load]
  );

  const updateSupplier = useCallback(
    async (s: Supplier) => {
      const res = await fetch("/api/sheets/suppliers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(s),
      });
      if (!res.ok) throw new Error("更新廠商失敗");
      localStorage.removeItem(CACHE_KEY);
      await load(true);
    },
    [load]
  );

  return {
    suppliers,
    loading,
    reload: () => load(true),
    addSupplier,
    updateSupplier,
  };
}
