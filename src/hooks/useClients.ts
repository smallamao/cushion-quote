"use client";

import { useCallback, useEffect, useState } from "react";

import type { Client } from "@/lib/types";

const CACHE_KEY = "cq-clients-cache";
const TTL = 5 * 60 * 1000;

export function useClients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    try {
      if (!force) {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached) as { data: Client[]; ts: number };
          if (Date.now() - parsed.ts < TTL) {
            setClients(parsed.data);
            setLoading(false);
            return;
          }
        }
      }

      const response = await fetch("/api/sheets/clients", { cache: "no-store" });
      if (!response.ok) throw new Error("load clients");
      const payload = (await response.json()) as { clients: Client[] };
      setClients(payload.clients);
      localStorage.setItem(CACHE_KEY, JSON.stringify({ data: payload.clients, ts: Date.now() }));
    } catch {
      setClients([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const addClient = useCallback(async (client: Client) => {
    const response = await fetch("/api/sheets/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(client),
    });
    if (!response.ok) throw new Error("新增客戶失敗");
    localStorage.removeItem(CACHE_KEY);
    await load(true);
  }, [load]);

  const updateClient = useCallback(async (client: Client) => {
    const response = await fetch("/api/sheets/clients", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(client),
    });
    if (!response.ok) throw new Error("更新客戶失敗");
    localStorage.removeItem(CACHE_KEY);
    await load(true);
  }, [load]);

  return { clients, loading, reload: () => load(true), addClient, updateClient };
}
