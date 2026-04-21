"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { formatCurrency } from "@/lib/utils";

interface VersionLite {
  versionId: string;
  quoteId: string;
  caseId: string;
  versionStatus: string;
  totalAmount: number;
  quoteDate: string;
  sentAt: string;
  channel: string;
}

interface ClientContributionTabProps {
  companyId: string;
}

const CHANNEL_LABEL: Record<string, string> = {
  wholesale: "批發",
  designer: "設計師",
  retail: "屋主",
  luxury_retail: "豪華屋主",
};

export function ClientContributionTab({ companyId }: ClientContributionTabProps) {
  const [versions, setVersions] = useState<VersionLite[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/sheets/versions?clientId=${encodeURIComponent(companyId)}&includeLines=false`)
      .then((r) => r.json())
      .then((data: { versions: VersionLite[] }) => {
        if (cancelled) return;
        setVersions(data.versions ?? []);
      })
      .catch(() => {
        if (!cancelled) setVersions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const stats = useMemo(() => {
    const active = versions.filter((v) => v.versionStatus !== "superseded");
    const accepted = active.filter((v) => v.versionStatus === "accepted");
    const rejected = active.filter((v) => v.versionStatus === "rejected");
    const closed = accepted.length + rejected.length;
    const winRate = closed > 0 ? accepted.length / closed : 0;

    const caseIds = new Set(active.map((v) => v.caseId));
    const acceptedCaseIds = new Set(accepted.map((v) => v.caseId));
    const acceptedTotal = accepted.reduce((sum, v) => sum + (v.totalAmount ?? 0), 0);
    const avgAcceptedAmount = accepted.length > 0 ? acceptedTotal / accepted.length : 0;
    const activeTotal = active.reduce((sum, v) => sum + (v.totalAmount ?? 0), 0);

    const channelBreakdown = new Map<string, { count: number; total: number }>();
    for (const v of accepted) {
      const key = v.channel || "wholesale";
      const prev = channelBreakdown.get(key) ?? { count: 0, total: 0 };
      prev.count++;
      prev.total += v.totalAmount ?? 0;
      channelBreakdown.set(key, prev);
    }

    const latestActivity = active
      .map((v) => v.sentAt || v.quoteDate)
      .filter(Boolean)
      .sort()
      .pop() ?? "";

    const quoteCountByMonth = new Map<string, number>();
    const acceptedAmountByMonth = new Map<string, number>();
    for (const v of active) {
      const month = (v.quoteDate || "").slice(0, 7);
      if (!month) continue;
      quoteCountByMonth.set(month, (quoteCountByMonth.get(month) ?? 0) + 1);
    }
    for (const v of accepted) {
      const month = (v.quoteDate || "").slice(0, 7);
      if (!month) continue;
      acceptedAmountByMonth.set(
        month,
        (acceptedAmountByMonth.get(month) ?? 0) + (v.totalAmount ?? 0),
      );
    }

    const months = Array.from(
      new Set([...quoteCountByMonth.keys(), ...acceptedAmountByMonth.keys()]),
    ).sort();

    return {
      caseCount: caseIds.size,
      acceptedCaseCount: acceptedCaseIds.size,
      versionCount: active.length,
      acceptedCount: accepted.length,
      rejectedCount: rejected.length,
      winRate,
      acceptedTotal,
      avgAcceptedAmount,
      activeTotal,
      latestActivity,
      channelBreakdown,
      months,
      quoteCountByMonth,
      acceptedAmountByMonth,
    };
  }, [versions]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-[var(--text-secondary)]">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-[var(--text-secondary)]">
        尚無報價資料,無法計算貢獻度
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <StatCell label="總案件數" value={`${stats.caseCount} 件`} />
        <StatCell
          label="已成交案件"
          value={`${stats.acceptedCaseCount} 件`}
          tone="good"
        />
        <StatCell label="總報價版本" value={`${stats.versionCount} 版`} />
        <StatCell
          label="成交率"
          value={`${(stats.winRate * 100).toFixed(1)}%`}
          tone={stats.winRate >= 0.5 ? "good" : stats.winRate >= 0.2 ? "warn" : "muted"}
        />
        <StatCell
          label="成交總額"
          value={formatCurrency(stats.acceptedTotal)}
          tone="good"
          highlight
        />
        <StatCell
          label="平均每案金額"
          value={formatCurrency(stats.avgAcceptedAmount)}
        />
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold text-[var(--text-secondary)]">
          通路分佈（已成交）
        </div>
        {stats.channelBreakdown.size === 0 ? (
          <p className="text-xs text-[var(--text-tertiary)]">尚無成交資料</p>
        ) : (
          <div className="space-y-1.5">
            {Array.from(stats.channelBreakdown.entries())
              .sort((a, b) => b[1].total - a[1].total)
              .map(([channel, data]) => {
                const percent =
                  stats.acceptedTotal > 0 ? (data.total / stats.acceptedTotal) * 100 : 0;
                return (
                  <div key={channel} className="flex items-center gap-2 text-xs">
                    <div className="w-20 shrink-0 text-[var(--text-secondary)]">
                      {CHANNEL_LABEL[channel] || channel}
                    </div>
                    <div className="flex-1">
                      <div className="h-4 overflow-hidden rounded bg-[var(--bg-subtle)]">
                        <div
                          className="h-full bg-[var(--accent)]"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                    <div className="w-24 shrink-0 text-right font-mono text-[var(--text-secondary)]">
                      {data.count} 件 · {formatCurrency(data.total)}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-[var(--text-secondary)]">
            月度活動
          </span>
          <span className="text-[11px] text-[var(--text-tertiary)]">
            最近活動: {stats.latestActivity || "—"}
          </span>
        </div>
        {stats.months.length === 0 ? (
          <p className="text-xs text-[var(--text-tertiary)]">無月份資料</p>
        ) : (
          <div className="overflow-hidden rounded-md border border-[var(--border)]">
            <table className="w-full text-xs">
              <thead className="bg-[var(--bg-subtle)]">
                <tr>
                  <th className="px-2 py-1.5 text-left">月份</th>
                  <th className="px-2 py-1.5 text-right">報價數</th>
                  <th className="px-2 py-1.5 text-right">成交額</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {stats.months
                  .slice()
                  .reverse()
                  .slice(0, 12)
                  .map((month) => (
                    <tr key={month}>
                      <td className="px-2 py-1.5 font-mono">{month}</td>
                      <td className="px-2 py-1.5 text-right font-mono">
                        {stats.quoteCountByMonth.get(month) ?? 0}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono">
                        {formatCurrency(stats.acceptedAmountByMonth.get(month) ?? 0)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCell({
  label,
  value,
  tone = "neutral",
  highlight = false,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "warn" | "muted";
  highlight?: boolean;
}) {
  const color =
    tone === "good"
      ? "text-green-700"
      : tone === "warn"
        ? "text-amber-700"
        : tone === "muted"
          ? "text-[var(--text-tertiary)]"
          : "text-[var(--text-primary)]";
  return (
    <div
      className={`rounded-md border border-[var(--border)] bg-white px-3 py-2 ${highlight ? "ring-1 ring-[var(--accent)]" : ""}`}
    >
      <div className="text-[11px] text-[var(--text-secondary)]">{label}</div>
      <div className={`mt-0.5 font-mono text-sm font-semibold ${color}`}>
        {value}
      </div>
    </div>
  );
}
