"use client";

import { useCallback, useEffect, useState } from "react";

import { cachedFetch, invalidateCache } from "@/lib/fetch-cache";
import type { QuoteTemplate } from "@/lib/types";

const CACHE_KEY = "cq-templates-cache";
const TTL = 5 * 60 * 1000;

export function useTemplates() {
  const [templates, setTemplates] = useState<QuoteTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTemplates = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      if (force) invalidateCache(CACHE_KEY);
      const data = await cachedFetch<QuoteTemplate[]>(CACHE_KEY, TTL, async () => {
        const response = await fetch("/api/sheets/templates");
        const json = await response.json() as { ok: boolean; templates?: QuoteTemplate[]; error?: string };
        if (!json.ok) throw new Error(json.error ?? "載入範本失敗");
        return json.templates ?? [];
      });
      setTemplates(data.filter((t) => t.isActive));
    } catch (err) {
      setError(err instanceof Error ? err.message : "未知錯誤");
    } finally {
      setLoading(false);
    }
  }, []);

  const saveTemplate = useCallback(
    async (template: QuoteTemplate) => {
      try {
        const response = await fetch("/api/sheets/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ template }),
        });
        const data = await response.json() as { ok: boolean; template?: QuoteTemplate; error?: string };
        if (data.ok) {
          await loadTemplates(true);
          return { ok: true, template: data.template };
        }
        return { ok: false, error: data.error };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "未知錯誤" };
      }
    },
    [loadTemplates]
  );

  const deleteTemplate = useCallback(
    async (templateId: string) => {
      try {
        const response = await fetch(`/api/sheets/templates?templateId=${templateId}`, {
          method: "DELETE",
        });
        const data = await response.json() as { ok: boolean; error?: string };
        if (data.ok) {
          await loadTemplates(true);
          return { ok: true };
        }
        return { ok: false, error: data.error };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "未知錯誤" };
      }
    },
    [loadTemplates]
  );

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  return { templates, loading, error, loadTemplates, saveTemplate, deleteTemplate };
}
