"use client";

import Link from "next/link";
import { Loader2, Wallet } from "lucide-react";
import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ARMonthlySummary {
  month: string;
  arCount: number;
  dueAmount: number;
  receivedAmount: number;
  outstandingAmount: number;
  overdueCount: number;
  overdueAmount: number;
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function fmt(n: number): string {
  return n.toLocaleString("zh-TW", { maximumFractionDigits: 0 });
}

export function MonthlyARReportCard() {
  const [month, setMonth] = useState(currentMonth());
  const [summary, setSummary] = useState<ARMonthlySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/sheets/reports/ar-monthly?month=${encodeURIComponent(month)}`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((json: { ok: boolean; summary?: ARMonthlySummary; error?: string }) => {
        if (cancelled) return;
        if (!json.ok) {
          setError(json.error ?? "載入失敗");
          return;
        }
        setSummary(json.summary ?? null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "載入失敗");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [month]);

  const collectedRate =
    summary && summary.dueAmount > 0
      ? (summary.receivedAmount / summary.dueAmount) * 100
      : 0;

  return (
    <div className="rounded-lg border border-[var(--border)] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-[var(--accent)]" />
          <span className="text-sm font-semibold">月度應收帳款</span>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs">月份</Label>
          <Input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="h-8 w-36"
          />
          <Link
            href="/receivables"
            className="text-xs text-[var(--accent)] hover:underline"
          >
            前往應收列表 →
          </Link>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 px-4 py-6 text-sm text-[var(--text-secondary)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          載入中…
        </div>
      )}

      {error && !loading && (
        <div className="px-4 py-3 text-sm text-red-700">載入失敗: {error}</div>
      )}

      {summary && !loading && !error && (
        <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-4 lg:grid-cols-6">
          <Stat label="應收單數" value={`${summary.arCount} 張`} />
          <Stat label="當月到期" value={fmt(summary.dueAmount)} />
          <Stat label="當月已收" value={fmt(summary.receivedAmount)} tone="good" />
          <Stat label="當月未收" value={fmt(summary.outstandingAmount)} tone="warn" />
          <Stat
            label="收款率"
            value={`${collectedRate.toFixed(1)}%`}
            tone={collectedRate >= 80 ? "good" : collectedRate >= 50 ? "warn" : "bad"}
          />
          <Stat
            label="逾期"
            value={
              summary.overdueCount > 0
                ? `${summary.overdueCount} 筆 / ${fmt(summary.overdueAmount)}`
                : "—"
            }
            tone={summary.overdueCount > 0 ? "bad" : "muted"}
          />
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "warn" | "bad" | "muted";
}) {
  const color =
    tone === "good"
      ? "text-green-700"
      : tone === "warn"
        ? "text-amber-700"
        : tone === "bad"
          ? "text-red-700"
          : tone === "muted"
            ? "text-[var(--text-tertiary)]"
            : "text-[var(--text-primary)]";
  return (
    <div>
      <div className="text-[11px] text-[var(--text-secondary)]">{label}</div>
      <div className={`mt-0.5 font-mono text-sm font-semibold ${color}`}>{value}</div>
    </div>
  );
}
