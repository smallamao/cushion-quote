"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

import type { ReferralStatsResult, ReferrerStats } from "@/lib/referral-utils";
import { REWARD_TIER_META } from "@/lib/referral-utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { StatsCards } from "@/components/referrals/StatsCards";
import { ReferrerList } from "@/components/referrals/ReferrerList";
import { PendingRewards } from "@/components/referrals/PendingRewards";

interface ApiResponse extends ReferralStatsResult {
  ok: boolean;
  error?: string;
}

export function ReferralsClient() {
  const [data, setData] = useState<ReferralStatsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/referrals/stats");
      const json = (await res.json()) as ApiResponse;
      if (!json.ok) throw new Error(json.error ?? "載入失敗");
      setData({ referrers: json.referrers, summary: json.summary });
      setLastSyncAt(new Date().toLocaleString("zh-TW"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "未知錯誤");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">轉介紹追蹤</h1>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          同步
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="flex items-center justify-center py-20 text-[var(--text-secondary)]">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : data ? (
        <Tabs defaultValue="dashboard">
          <TabsList>
            <TabsTrigger value="dashboard">儀表板</TabsTrigger>
            <TabsTrigger value="network">多層網路</TabsTrigger>
            <TabsTrigger value="rewards">待發獎勵</TabsTrigger>
            <TabsTrigger value="sync">同步記錄</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="mt-4 space-y-6">
            <StatsCards summary={data.summary} />
            <div>
              <div className="mb-2 text-xs font-semibold text-[var(--text-secondary)]">
                獎勵層級分布
              </div>
              <TierDistribution referrers={data.referrers} />
            </div>
          </TabsContent>

          <TabsContent value="network" className="mt-4">
            <ReferrerList referrers={data.referrers} />
          </TabsContent>

          <TabsContent value="rewards" className="mt-4">
            <PendingRewards referrers={data.referrers} />
          </TabsContent>

          <TabsContent value="sync" className="mt-4 space-y-3">
            <p className="text-sm text-[var(--text-secondary)]">
              資料直接從 Google Sheets 即時讀取，點擊「同步」按鈕重新載入。
            </p>
            <div className="rounded-md border border-[var(--border)] px-4 py-3 text-sm">
              最後同步時間：
              <span className="ml-1 font-mono text-[var(--text-primary)]">
                {lastSyncAt || "—"}
              </span>
            </div>
            <Button variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              立即同步
            </Button>
          </TabsContent>
        </Tabs>
      ) : null}
    </div>
  );
}

function TierDistribution({ referrers }: { referrers: ReferrerStats[] }) {
  const tierCounts = new Map<number, number>();
  for (const r of referrers) {
    if (r.rewardTier > 0) {
      tierCounts.set(r.rewardTier, (tierCounts.get(r.rewardTier) ?? 0) + 1);
    }
  }

  if (tierCounts.size === 0) {
    return <p className="text-xs text-[var(--text-tertiary)]">尚無轉介紹資料</p>;
  }

  return (
    <div className="space-y-1.5">
      {([1, 3, 5, 10] as const).map((tier) => {
        const count = tierCounts.get(tier) ?? 0;
        if (count === 0) return null;
        const meta = REWARD_TIER_META[tier];
        return (
          <div key={tier} className="flex items-center gap-2 text-sm">
            <span className="w-4">{meta.icon}</span>
            <span className="w-24 text-[var(--text-secondary)]">{meta.name}</span>
            <span className="font-mono font-semibold text-[var(--text-primary)]">{count} 人</span>
          </div>
        );
      })}
    </div>
  );
}
