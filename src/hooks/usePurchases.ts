"use client";

import { useCallback, useEffect, useState } from "react";

import type { InventoryTransaction, PurchaseOrder, PurchaseOrderItem } from "@/lib/types";

interface ReceivePurchaseItemInput {
  itemId: string;
  receivedQuantity: number;
  occurredAt?: string;
  referenceNumber?: string;
  notes?: string;
}

const CACHE_KEY = "cq-purchases-cache";
const TTL = 2 * 60 * 1000;

function sanitizeNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sanitizePurchaseOrder(order: PurchaseOrder): PurchaseOrder {
  return {
    ...order,
    subtotal: sanitizeNumber(order.subtotal),
    shippingFee: sanitizeNumber(order.shippingFee),
    taxAmount: sanitizeNumber(order.taxAmount),
    totalAmount: sanitizeNumber(order.totalAmount),
    notes: order.notes ?? "",
    status: order.status || "draft",
  };
}

function sanitizePurchaseOrders(orders: PurchaseOrder[]): PurchaseOrder[] {
  return orders
    .filter((order) => Boolean(order?.orderId))
    .map(sanitizePurchaseOrder);
}

function readCachedOrders(): PurchaseOrder[] | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;

    const parsed = JSON.parse(cached) as {
      data: PurchaseOrder[];
      ts: number;
    };

    if (Date.now() - parsed.ts >= TTL) {
      return null;
    }

    return sanitizePurchaseOrders(parsed.data ?? []);
  } catch {
    localStorage.removeItem(CACHE_KEY);
    return null;
  }
}

export function usePurchases() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [itemCountByOrder, setItemCountByOrder] = useState<Record<string, number>>({});

  const load = useCallback(async (force = false) => {
    setLoading(true);
      try {
        if (!force) {
          const cachedOrders = readCachedOrders();
          if (cachedOrders) {
            setOrders(cachedOrders);
            setLoading(false);
            return;
          }
        }

      const res = await fetch("/api/sheets/purchases", { cache: "no-store" });
      if (!res.ok) throw new Error("load purchases");
      const payload = (await res.json()) as { orders: PurchaseOrder[] };
      const sanitizedOrders = sanitizePurchaseOrders(payload.orders ?? []);
      setOrders(sanitizedOrders);
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ data: sanitizedOrders, ts: Date.now() })
      );
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/sheets/purchases?includeItemCounts=true", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const payload = (await res.json()) as { itemCountByOrder?: Record<string, number> };
        if (!cancelled && payload.itemCountByOrder) setItemCountByOrder(payload.itemCountByOrder);
      } catch {
        // counts are non-critical, silently skip
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const createOrder = useCallback(
    async (order: PurchaseOrder, items: PurchaseOrderItem[]) => {
      const res = await fetch("/api/sheets/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order, items }),
      });
      if (!res.ok) throw new Error("建立採購單失敗");
      const payload = (await res.json()) as {
        ok: boolean;
        order: PurchaseOrder;
        items: PurchaseOrderItem[];
        transactions: InventoryTransaction[];
      };
      localStorage.removeItem(CACHE_KEY);
      await load(true);
      return payload;
    },
    [load]
  );

  const updateOrder = useCallback(
    async (order: PurchaseOrder, items: PurchaseOrderItem[]) => {
      const res = await fetch(`/api/sheets/purchases/${order.orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order, items }),
      });
      if (!res.ok) throw new Error("更新採購單失敗");
      localStorage.removeItem(CACHE_KEY);
      await load(true);
    },
    [load]
  );

  const cancelOrder = useCallback(
    async (orderId: string) => {
      const res = await fetch(`/api/sheets/purchases/${orderId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("取消採購單失敗");
      localStorage.removeItem(CACHE_KEY);
      await load(true);
    },
    [load]
  );

  const receiveOrderItems = useCallback(
    async (orderId: string, items: ReceivePurchaseItemInput[]) => {
      const res = await fetch(`/api/sheets/purchases/${orderId}/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) throw new Error("採購收貨失敗");
      const payload = (await res.json()) as {
        ok: boolean;
        order: PurchaseOrder;
        items: PurchaseOrderItem[];
      };
      localStorage.removeItem(CACHE_KEY);
      await load(true);
      return payload;
    },
    [load]
  );

  return {
    orders,
    loading,
    itemCountByOrder,
    reload: () => load(true),
    createOrder,
    updateOrder,
    cancelOrder,
    receiveOrderItems,
  };
}

export async function fetchPurchaseOrder(orderId: string): Promise<{
  order: PurchaseOrder;
  items: PurchaseOrderItem[];
} | null> {
  try {
    const res = await fetch(`/api/sheets/purchases/${orderId}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const payload = (await res.json()) as {
      ok: boolean;
      order: PurchaseOrder;
      items: PurchaseOrderItem[];
    };
    return payload.ok ? { order: payload.order, items: payload.items } : null;
  } catch {
    return null;
  }
}
