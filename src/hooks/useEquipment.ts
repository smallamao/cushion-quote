"use client";

import { useCallback, useEffect, useState } from "react";

import type { EquipmentModel } from "@/lib/types";

export function useEquipment() {
  const [equipment, setEquipment] = useState<EquipmentModel[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sheets/equipment", { cache: "no-store" });
      const json = (await res.json()) as {
        ok: boolean;
        equipment?: EquipmentModel[];
      };
      if (json.ok) setEquipment(json.equipment ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { equipment, loading, reload };
}
