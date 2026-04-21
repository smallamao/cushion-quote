"use client";

import { useCallback, useEffect, useState } from "react";

import type {
  InventorySummary,
  InventoryTransaction,
  InventoryTransactionType,
  PurchaseUnit,
} from "@/lib/types";

export interface ManualAdjustmentPayload {
  productId: string;
  inventoryId?: string;
  quantityDelta: number;
  transactionType?: InventoryTransactionType;
  unit?: PurchaseUnit;
  unitCost?: number;
  occurredAt?: string;
  referenceNumber?: string;
  notes?: string;
}

export function useInventory() {
  const [inventory, setInventory] = useState<InventorySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sheets/inventory", { cache: "no-store" });
      const json = (await res.json()) as { inventory?: InventorySummary[]; error?: string };
      if (json.error) setError(json.error);
      setInventory(json.inventory ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入庫存失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const adjust = useCallback(
    async (payload: ManualAdjustmentPayload) => {
      const res = await fetch("/api/sheets/inventory-transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as {
        ok: boolean;
        error?: string;
        transaction?: InventoryTransaction;
        inventory?: InventorySummary;
      };
      if (!json.ok) {
        throw new Error(json.error ?? "庫存調整失敗");
      }
      await load();
      return json;
    },
    [load],
  );

  return { inventory, loading, error, reload: load, adjust };
}

export function useInventoryTransactions(filter: {
  inventoryId?: string;
  productId?: string;
  orderId?: string;
  transactionType?: InventoryTransactionType;
} = {}) {
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  const { inventoryId, productId, orderId, transactionType } = filter;

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (inventoryId) params.set("inventoryId", inventoryId);
    if (productId) params.set("productId", productId);
    if (orderId) params.set("orderId", orderId);
    if (transactionType) params.set("transactionType", transactionType);
    try {
      const qs = params.toString();
      const res = await fetch(
        `/api/sheets/inventory-transactions${qs ? `?${qs}` : ""}`,
        { cache: "no-store" },
      );
      const json = (await res.json()) as { transactions?: InventoryTransaction[] };
      setTransactions(json.transactions ?? []);
    } catch {
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, [inventoryId, productId, orderId, transactionType]);

  useEffect(() => {
    void load();
  }, [load]);

  return { transactions, loading, reload: load };
}
