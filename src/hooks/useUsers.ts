"use client";

import { useCallback, useEffect, useState } from "react";

import type { User } from "@/lib/types";

export function useUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sheets/users", { cache: "no-store" });
      const json = (await res.json()) as { ok: boolean; users?: User[]; error?: string };
      if (!json.ok) {
        setError(json.error ?? "載入失敗");
        setUsers([]);
        return;
      }
      setUsers(json.users ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入失敗");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { users, loading, error, reload: load };
}
