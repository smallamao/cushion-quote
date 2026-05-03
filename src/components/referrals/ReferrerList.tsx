"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { formatCurrency } from "@/lib/utils";
import { REWARD_TIER_META } from "@/lib/referral-utils";
import type { ReferrerStats } from "@/lib/referral-utils";
import { Input } from "@/components/ui/input";

const CASE_STATUS_LABEL: Record<string, string> = {
  won: "✅ 成交",
  lost: "❌ 失敗",
  quoting: "💬 報價中",
  new: "🆕 新詢問",
};

interface Props {
  referrers: ReferrerStats[];
}

export function ReferrerList({ referrers }: Props) {
  const [search, setSearch] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const filtered = referrers.filter((r) =>
    r.companyName.toLowerCase().includes(search.toLowerCase()),
  );

  function toggleExpand(companyId: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(companyId)) {
        next.delete(companyId);
      } else {
        next.add(companyId);
      }
      return next;
    });
  }

  return (
    <div className="space-y-3">
      <Input
        placeholder="搜尋引薦人名稱…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-xs"
      />

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--text-secondary)]">
          {search ? "找不到符合的引薦人" : "尚無轉介紹資料"}
        </p>
      ) : (
        <div className="overflow-hidden rounded-md border border-[var(--border)]">
          {filtered.map((r, idx) => {
            const isExpanded = expandedIds.has(r.companyId);
            const tierMeta = REWARD_TIER_META[r.rewardTier];
            return (
              <div key={r.companyId}>
                <button
                  type="button"
                  onClick={() => toggleExpand(r.companyId)}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-[var(--bg-subtle)] ${idx !== 0 ? "border-t border-[var(--border)]" : ""}`}
                >
                  <span className="shrink-0 text-[var(--text-tertiary)]">
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </span>

                  <span className="flex-1 font-medium text-[var(--text-primary)]">
                    {tierMeta?.icon ?? ""} {r.companyName}
                  </span>

                  <span className="shrink-0 text-xs text-[var(--text-secondary)]">
                    介紹 {r.clientCount} 位 · {r.caseCount} 件
                  </span>

                  <span className="w-24 shrink-0 text-right font-mono text-sm font-semibold text-[var(--text-primary)]">
                    {formatCurrency(r.revenue)}
                  </span>
                </button>

                {isExpanded && (
                  <div className="border-t border-[var(--border)] bg-[var(--bg-subtle)] px-4 py-3">
                    {r.cases.length === 0 ? (
                      <p className="text-xs text-[var(--text-tertiary)]">無案件資料</p>
                    ) : (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-[var(--text-secondary)]">
                            <th className="pb-1.5 text-left">案件</th>
                            <th className="pb-1.5 text-left">客戶</th>
                            <th className="pb-1.5 text-left">狀態</th>
                            <th className="pb-1.5 text-right">金額</th>
                            <th className="pb-1.5 text-right">詢問日期</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                          {r.cases.map((c) => (
                            <tr key={c.caseId}>
                              <td className="py-1 font-mono text-[var(--text-secondary)]">{c.caseId}</td>
                              <td className="py-1">{c.clientName}</td>
                              <td className="py-1">{CASE_STATUS_LABEL[c.caseStatus] ?? c.caseStatus}</td>
                              <td className="py-1 text-right font-mono">
                                {c.amount > 0 ? formatCurrency(c.amount) : "—"}
                              </td>
                              <td className="py-1 text-right text-[var(--text-secondary)]">
                                {c.inquiryDate || "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
