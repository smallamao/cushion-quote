"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";

interface ARMonthlySummary {
  overdueCount: number;
  overdueAmount: number;
}

export function OverdueARAlert() {
  const [summary, setSummary] = useState<ARMonthlySummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/sheets/reports/ar-monthly", { cache: "no-store" })
      .then((r) => r.json())
      .then((json: { ok: boolean; summary?: ARMonthlySummary }) => {
        if (cancelled) return;
        if (json.ok && json.summary) setSummary(json.summary);
      })
      .catch(() => {
        /* silently ignore */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!summary || summary.overdueCount === 0) return null;

  return (
    <Link
      href="/receivables?filter=overdue"
      className="flex items-center justify-between gap-3 rounded-lg border border-red-300 bg-red-50 px-4 py-3 transition-colors hover:bg-red-100"
    >
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" />
        <div>
          <div className="text-sm font-semibold text-red-900">
            應收逾期 {summary.overdueCount} 筆
          </div>
          <div className="text-xs text-red-700">
            未收金額 $
            {summary.overdueAmount.toLocaleString("zh-TW", {
              maximumFractionDigits: 0,
            })}
            {" · 點擊查看"}
          </div>
        </div>
      </div>
      <div className="text-red-600">→</div>
    </Link>
  );
}
