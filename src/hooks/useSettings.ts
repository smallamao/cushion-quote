"use client";

import { useCallback, useEffect, useState } from "react";

import { DEFAULT_SETTINGS } from "@/lib/constants";
import type { SystemSettings } from "@/lib/types";

export function useSettings() {
  const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch("/api/sheets/settings", { cache: "no-store" });
        if (!response.ok) throw new Error("load settings");
        const payload = (await response.json()) as { settings: SystemSettings };
        setSettings(payload.settings);
      } catch {
        setSettings(DEFAULT_SETTINGS);
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  const save = useCallback(async (next: SystemSettings) => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/sheets/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!response.ok) throw new Error("save settings");
      setSettings(next);
    } catch {
      setError("儲存失敗，請重試");
    } finally {
      setSaving(false);
    }
  }, []);

  return { settings, loading, saving, error, setSettings, save };
}
