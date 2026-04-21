"use client";

import { useCallback, useEffect, useState } from "react";

import type {
  ARRecord,
  ARScheduleRecord,
  CreateARPayload,
  RecordARPaymentPayload,
} from "@/lib/types";

type ARWithSchedules = ARRecord & { schedules?: ARScheduleRecord[] };

interface UseReceivablesOptions {
  caseId?: string;
  clientId?: string;
  includeSchedules?: boolean;
}

export function useReceivables(options: UseReceivablesOptions = {}) {
  const [ars, setArs] = useState<ARWithSchedules[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const { caseId, clientId, includeSchedules } = options;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (caseId) params.set("caseId", caseId);
      if (clientId) params.set("clientId", clientId);
      if (includeSchedules) params.set("includeSchedules", "true");

      const qs = params.toString();
      const url = `/api/sheets/ar${qs ? `?${qs}` : ""}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error("載入應收帳款失敗");
      const payload = (await res.json()) as { ars: ARWithSchedules[] };
      setArs(payload.ars ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入失敗");
      setArs([]);
    } finally {
      setLoading(false);
    }
  }, [caseId, clientId, includeSchedules]);

  useEffect(() => {
    void load();
  }, [load]);

  const createAR = useCallback(
    async (payload: CreateARPayload) => {
      const res = await fetch("/api/sheets/ar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          arId?: string;
        };
        throw new Error(data.error || "建立應收帳款失敗");
      }
      const payloadData = (await res.json()) as {
        ar: ARRecord;
        schedules: ARScheduleRecord[];
      };
      await load();
      return payloadData;
    },
    [load],
  );

  return { ars, loading, error, reload: load, createAR };
}

export function useReceivableDetail(arId: string | null) {
  const [ar, setAr] = useState<ARRecord | null>(null);
  const [schedules, setSchedules] = useState<ARScheduleRecord[]>([]);
  const [loading, setLoading] = useState(Boolean(arId));
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!arId) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/sheets/ar/${encodeURIComponent(arId)}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("載入失敗");
      const payload = (await res.json()) as {
        ar: ARRecord;
        schedules: ARScheduleRecord[];
      };
      setAr(payload.ar);
      setSchedules(payload.schedules);
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }, [arId]);

  useEffect(() => {
    void load();
  }, [load]);

  const recordPayment = useCallback(
    async (payload: RecordARPaymentPayload) => {
      if (!arId) throw new Error("arId is required");
      const res = await fetch(
        `/api/sheets/ar/${encodeURIComponent(arId)}/schedules/${encodeURIComponent(payload.scheduleId)}/receive`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "記錄收款失敗");
      }
      await load();
    },
    [arId, load],
  );

  const updateAR = useCallback(
    async (patch: { arStatus?: ARRecord["arStatus"]; notes?: string }) => {
      if (!arId) return;
      const res = await fetch(`/api/sheets/ar/${encodeURIComponent(arId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("更新失敗");
      await load();
    },
    [arId, load],
  );

  return { ar, schedules, loading, error, reload: load, recordPayment, updateAR };
}

interface ARMonthlySummary {
  month: string;
  arCount: number;
  dueAmount: number;
  receivedAmount: number;
  outstandingAmount: number;
  overdueCount: number;
  overdueAmount: number;
}

export function useARMonthlySummary(month: string) {
  const [summary, setSummary] = useState<ARMonthlySummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/sheets/reports/ar-monthly?month=${encodeURIComponent(month)}`, {
      cache: "no-store",
    })
      .then((res) => res.json())
      .then((payload: { ok: boolean; summary?: ARMonthlySummary }) => {
        if (cancelled) return;
        if (payload.ok && payload.summary) {
          setSummary(payload.summary);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [month]);

  return { summary, loading };
}
