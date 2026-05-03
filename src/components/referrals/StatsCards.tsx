// src/components/referrals/StatsCards.tsx
import { formatCurrency } from "@/lib/utils";
import type { ReferralSummary } from "@/lib/referral-utils";

interface Props {
  summary: ReferralSummary;
}

export function StatsCards({ summary }: Props) {
  const cards = [
    { label: "引薦人數",   value: `${summary.totalReferrers} 人` },
    { label: "介紹案件",   value: `${summary.totalReferredCases} 件` },
    { label: "成交案件",   value: `${summary.totalWonCases} 件` },
    { label: "貢獻營收",   value: formatCurrency(summary.totalRevenue), highlight: true },
    { label: "待發獎勵",   value: `${summary.pendingRewardCount} 人` },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`rounded-md border border-[var(--border)] bg-white px-3 py-3 ${card.highlight ? "ring-1 ring-[var(--accent)]" : ""}`}
        >
          <div className="text-[11px] text-[var(--text-secondary)]">{card.label}</div>
          <div className="mt-1 font-mono text-base font-semibold text-[var(--text-primary)]">
            {card.value}
          </div>
        </div>
      ))}
    </div>
  );
}
