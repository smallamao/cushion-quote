"use client";

import { useCallback, useEffect, useState } from "react";

import type { Material } from "@/lib/types";

interface MaterialsResponse {
  materials: Material[];
  source: "sheets" | "defaults" | "cache";
}

const CACHE_KEY = "cq-materials-cache";
const TTL = 5 * 60 * 1000;

export function useMaterials() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<MaterialsResponse["source"]>("defaults");

  const load = useCallback(async (force = false) => {
    try {
      setLoading(true);
      setError(null);

      if (!force) {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached) as { data: Material[]; ts: number };
          if (Date.now() - parsed.ts < TTL) {
            setMaterials(parsed.data);
            setSource("cache");
            setLoading(false);
            return;
          }
        }
      }

      const response = await fetch("/api/sheets/materials", { cache: "no-store" });
      if (!response.ok) throw new Error("讀取材質資料失敗");
      const payload = (await response.json()) as MaterialsResponse;
      setMaterials(payload.materials);
      setSource(payload.source);
      localStorage.setItem(CACHE_KEY, JSON.stringify({ data: payload.materials, ts: Date.now() }));
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "未知錯誤");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const addMaterial = useCallback(async (material: Material) => {
    const response = await fetch("/api/sheets/materials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(material),
    });
    if (!response.ok) throw new Error("新增失敗");
    localStorage.removeItem(CACHE_KEY);
    await load(true);
  }, [load]);

  const updateMaterial = useCallback(async (material: Material) => {
    const response = await fetch("/api/sheets/materials", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(material),
    });
    if (!response.ok) throw new Error("更新失敗");
    localStorage.removeItem(CACHE_KEY);
    await load(true);
  }, [load]);

  return { materials, loading, error, source, reload: () => load(true), addMaterial, updateMaterial };
}
