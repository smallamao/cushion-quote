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
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ message: string; syncedAt: string } | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/referrals/stats");
      const json = (await res.json()) as ApiResponse;
      if (!json.ok) throw new Error(json.error ?? "載入失敗");
      setData({ referrers: json.referrers, summary: json.summary });
    } catch (err) {
      setError(err instanceof Error ? err.message : "未知錯誤");
    } finally {
      setLoading(false);
    }
  }, []);

  const syncFromFastApi = useCallback(async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch("/api/referrals/sync", { method: "POST" });
      const json = (await res.json()) as {
        ok: boolean;
        message?: string;
        syncedAt?: string;
        error?: string;
      };
      if (!json.ok) throw new Error(json.error ?? "同步失敗");
      setSyncResult({ message: json.message ?? "", syncedAt: json.syncedAt ?? "" });
      await load();
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "未知錯誤");
    } finally {
      setSyncing(false);
    }
  }, [load]);

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

          <TabsContent value="sync" className="mt-4 space-y-4">
            <p className="text-sm text-[var(--text-secondary)]">
              從舊系統 FastAPI 同步最新的 B2C 轉介紹資料，寫入 Google Sheets。
              首次同步後資料即可在其他頁籤查看。
            </p>

            {syncError && (
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {syncError}
              </div>
            )}

            {syncResult && (
              <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                {syncResult.message}
                <span className="ml-2 text-xs text-green-600">
                  ({new Date(syncResult.syncedAt).toLocaleString("zh-TW")})
                </span>
              </div>
            )}

            <div className="flex gap-3">
              <Button onClick={syncFromFastApi} disabled={syncing || loading}>
                {syncing ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1.5 h-4 w-4" />
                )}
                從 FastAPI 同步
              </Button>
              <Button variant="outline" onClick={load} disabled={loading || syncing}>
                重新讀取
              </Button>
            </div>

            <p className="text-xs text-[var(--text-tertiary)]">
              注意：FastAPI 服務使用 Render 免費方案，首次同步可能需等待 30–60 秒。
            </p>
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
