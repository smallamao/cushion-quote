"use client";

import { useCallback, useEffect, useState } from "react";

import type { PurchaseProduct } from "@/lib/types";

const CACHE_KEY = "cq-purchase-products-cache";
const TTL = 5 * 60 * 1000;

function readCachedPurchaseProducts(): PurchaseProduct[] | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;

    const parsed = JSON.parse(cached) as {
      data: PurchaseProduct[];
      ts: number;
    };

    if (Date.now() - parsed.ts >= TTL) {
      return null;
    }

    return parsed.data ?? [];
  } catch {
    localStorage.removeItem(CACHE_KEY);
    return null;
  }
}

export function usePurchaseProducts() {
  const [products, setProducts] = useState<PurchaseProduct[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    try {
      if (!force) {
        const cachedProducts = readCachedPurchaseProducts();
        if (cachedProducts) {
          setProducts(cachedProducts);
          setLoading(false);
          return;
        }
      }

      const res = await fetch("/api/sheets/purchase-products", {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("load purchase products");
      const payload = (await res.json()) as { products: PurchaseProduct[] };
      setProducts(payload.products);
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ data: payload.products, ts: Date.now() })
      );
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const addProduct = useCallback(
    async (
      p: PurchaseProduct | PurchaseProduct[],
    ): Promise<PurchaseProduct[]> => {
      const res = await fetch("/api/sheets/purchase-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
      });
      if (!res.ok) throw new Error("新增商品失敗");
      const payload = (await res.json()) as {
        ok: boolean;
        products?: PurchaseProduct[];
        count?: number;
      };
      localStorage.removeItem(CACHE_KEY);
      await load(true);
      return payload.products ?? (Array.isArray(p) ? p : [p]);
    },
    [load]
  );

  const updateProduct = useCallback(
    async (p: PurchaseProduct) => {
      const res = await fetch("/api/sheets/purchase-products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
      });
      if (!res.ok) throw new Error("更新商品失敗");
      localStorage.removeItem(CACHE_KEY);
      await load(true);
    },
    [load]
  );

  return {
    products,
    loading,
    reload: () => load(true),
    addProduct,
    updateProduct,
  };
}
