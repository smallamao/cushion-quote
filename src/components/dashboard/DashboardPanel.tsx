"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { CHANNEL_LABELS } from "@/lib/constants";
import type { Channel, QuoteRecord, QuoteStatus } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

const DASHBOARD_STATUSES = ["draft", "sent", "accepted", "rejected", "expired"] as const;

const STATUS_META: Record<(typeof DASHBOARD_STATUSES)[number], { label: string; className: string }> = {
  draft: { label: "草稿", className: "badge-draft" },
  sent: { label: "已發送", className: "badge-sent" },
  accepted: { label: "已接受", className: "badge-accepted" },
  rejected: { label: "已拒絕", className: "badge-rejected" },
  expired: { label: "已過期", className: "badge-expired" },
};

const CHANNELS: Channel[] = ["wholesale", "designer", "retail", "luxury_retail"];

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function DashboardPanel() {
  const [quotes, setQuotes] = useState<QuoteRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/sheets/quotes", { cache: "no-store" });
      if (!response.ok) throw new Error("load dashboard");
      const payload = (await response.json()) as { quotes: QuoteRecord[] };
      setQuotes(payload.quotes);
    } catch {
      setQuotes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeQuotes = useMemo(
    () => quotes.filter((quote) => quote.status !== "deleted"),
    [quotes],
  );

  const acceptedQuotes = useMemo(
    () => activeQuotes.filter((quote) => quote.status === "accepted"),
    [activeQuotes],
  );

  const actionableQuotes = useMemo(
    () =>
      activeQuotes.filter(
        (quote) =>
          quote.status === "sent" ||
          quote.status === "accepted" ||
          quote.status === "rejected",
      ),
    [activeQuotes],
  );

  const acceptedTotal = useMemo(
    () => acceptedQuotes.reduce((sum, quote) => sum + quote.total, 0),
    [acceptedQuotes],
  );

  const acceptedRate = actionableQuotes.length === 0 ? 0 : acceptedQuotes.length / actionableQuotes.length;

  const statusDistribution = useMemo(() => {
    const maxCount = Math.max(
      ...DASHBOARD_STATUSES.map(
        (status) => activeQuotes.filter((quote) => quote.status === status).length,
      ),
      0,
    );

    return DASHBOARD_STATUSES.map((status) => {
      const matches = activeQuotes.filter((quote) => quote.status === status);
      const total = matches.reduce((sum, quote) => sum + quote.total, 0);
      return {
        status,
        count: matches.length,
        total,
        barWidth: maxCount === 0 ? 0 : (matches.length / maxCount) * 100,
      };
    });
  }, [activeQuotes]);

  const topClients = useMemo(() => {
    const clientRevenue = new Map<string, { total: number; count: number }>();
    acceptedQuotes.forEach((quote) => {
      const name = quote.clientName || "未填客戶";
      const current = clientRevenue.get(name) ?? { total: 0, count: 0 };
      clientRevenue.set(name, {
        total: current.total + quote.total,
        count: current.count + 1,
      });
    });

    return [...clientRevenue.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 5);
  }, [acceptedQuotes]);

  const channelRevenue = useMemo(() => {
    return CHANNELS.map((channel) => {
      const matches = acceptedQuotes.filter((quote) => quote.channel === channel);
      const total = matches.reduce((sum, quote) => sum + quote.total, 0);
      return {
        channel,
        count: matches.length,
        total,
        ratio: acceptedTotal === 0 ? 0 : total / acceptedTotal,
      };
    });
  }, [acceptedQuotes, acceptedTotal]);

  const statCards = [
    { label: "總報價數", value: String(activeQuotes.length), detail: "排除已刪除" },
    { label: "已成交", value: String(acceptedQuotes.length), detail: "accepted 報價數" },
    { label: "成交率", value: formatPercent(acceptedRate), detail: "sent + accepted + rejected" },
    { label: "成交總額", value: formatCurrency(acceptedTotal), detail: "accepted 合計" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">
            營運統計
          </h1>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            依報價紀錄即時彙整成交與通路表現
          </p>
        </div>
        <Button variant="outline" size="sm" disabled={loading} onClick={() => void load()}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          重新載入
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="card-surface rounded-[var(--radius-lg)] px-5 py-4"
          >
            <div className="text-xs font-medium text-[var(--text-secondary)]">
              {card.label}
            </div>
            <div className="mt-3 text-3xl font-semibold tracking-tight text-[var(--accent)]">
              {loading ? "..." : card.value}
            </div>
            <div className="mt-1 text-xs text-[var(--text-tertiary)]">
              {card.detail}
            </div>
          </div>
        ))}
      </div>

      {!loading && activeQuotes.length === 0 ? (
        <div className="card-surface rounded-[var(--radius-lg)] px-6 py-12 text-center">
          <div className="text-base font-medium text-[var(--text-primary)]">
            尚無報價資料
          </div>
          <div className="mt-2 text-sm text-[var(--text-secondary)]">
            建立第一張報價後，這裡會顯示狀態分佈、成交排行與通路營收。
          </div>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <div className="card-surface rounded-[var(--radius-lg)] px-5 py-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="section-title">報價狀態分佈</div>
                  <div className="section-subtitle">各狀態的筆數與金額</div>
                </div>
              </div>
              <div className="space-y-3">
                {statusDistribution.map((entry) => (
                  <div key={entry.status} className="rounded-[var(--radius-md)] bg-[var(--bg-subtle)] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className={`badge ${STATUS_META[entry.status].className}`}>
                          {STATUS_META[entry.status].label}
                        </span>
                        <span className="text-sm text-[var(--text-secondary)]">
                          {entry.count} 筆
                        </span>
                      </div>
                      <div className="text-sm font-medium text-[var(--text-primary)]">
                        {formatCurrency(entry.total)}
                      </div>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--bg-elevated)]">
                      <div
                        className="h-full rounded-full bg-[var(--accent)] transition-[width]"
                        style={{ width: `${entry.barWidth}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card-surface rounded-[var(--radius-lg)] px-5 py-5">
              <div>
                <div className="section-title">通路營收比較</div>
                <div className="section-subtitle">accepted 報價依通路彙整</div>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>通路</th>
                      <th className="text-right">成交筆數</th>
                      <th className="text-right">成交金額</th>
                      <th className="text-right">佔比</th>
                    </tr>
                  </thead>
                  <tbody>
                    {channelRevenue.map((entry) => (
                      <tr key={entry.channel}>
                        <td className="text-sm font-medium">
                          {CHANNEL_LABELS[entry.channel].label}
                        </td>
                        <td className="text-right text-sm">{entry.count}</td>
                        <td className="text-right text-sm font-medium">
                          {formatCurrency(entry.total)}
                        </td>
                        <td className="text-right text-sm text-[var(--text-secondary)]">
                          {formatPercent(entry.ratio)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="card-surface rounded-[var(--radius-lg)] px-5 py-5">
            <div>
              <div className="section-title">Top 5 客戶</div>
              <div className="section-subtitle">依成交金額排序</div>
            </div>
            <div className="mt-4 space-y-3">
              {topClients.length === 0 ? (
                <div className="rounded-[var(--radius-md)] bg-[var(--bg-subtle)] px-4 py-8 text-center text-sm text-[var(--text-secondary)]">
                  尚無成交報價
                </div>
              ) : (
                topClients.map(([name, stats], index) => (
                  <div
                    key={name}
                    className="rounded-[var(--radius-md)] border border-[var(--border)] px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-[var(--text-primary)]">
                          {index + 1}. {name}
                        </div>
                        <div className="mt-1 text-xs text-[var(--text-secondary)]">
                          {stats.count} 筆成交
                        </div>
                      </div>
                      <div className="text-sm font-semibold text-[var(--accent)]">
                        {formatCurrency(stats.total)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
