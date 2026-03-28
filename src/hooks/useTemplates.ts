"use client";

import { useCallback, useEffect, useState } from "react";

import type { QuoteTemplate } from "@/lib/types";

export function useTemplates() {
  const [templates, setTemplates] = useState<QuoteTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 載入範本列表
  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/sheets/templates");
      const data = await response.json();

      if (data.ok) {
        setTemplates(data.templates.filter((t: QuoteTemplate) => t.isActive));
      } else {
        setError(data.error || "載入範本失敗");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "未知錯誤");
    } finally {
      setLoading(false);
    }
  }, []);

  // 儲存範本
  const saveTemplate = useCallback(
    async (template: QuoteTemplate) => {
      try {
        const response = await fetch("/api/sheets/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ template }),
        });

        const data = await response.json();

        if (data.ok) {
          await loadTemplates(); // 重新載入列表
          return { ok: true, template: data.template };
        } else {
          return { ok: false, error: data.error };
        }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "未知錯誤" };
      }
    },
    [loadTemplates]
  );

  // 刪除範本
  const deleteTemplate = useCallback(
    async (templateId: string) => {
      try {
        const response = await fetch(`/api/sheets/templates?templateId=${templateId}`, {
          method: "DELETE",
        });

        const data = await response.json();

        if (data.ok) {
          await loadTemplates(); // 重新載入列表
          return { ok: true };
        } else {
          return { ok: false, error: data.error };
        }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "未知錯誤" };
      }
    },
    [loadTemplates]
  );

  // 初次載入
  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  return {
    templates,
    loading,
    error,
    loadTemplates,
    saveTemplate,
    deleteTemplate,
  };
}
