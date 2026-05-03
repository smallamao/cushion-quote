import type { CaseRecord, QuoteVersionRecord } from "@/lib/types";

export type RewardTier = 0 | 1 | 3 | 5 | 10;

export interface RewardTierMeta {
  name: string;
  value: number;
  icon: string;
}

export const REWARD_TIER_META: Record<number, RewardTierMeta> = {
  1:  { name: "保養禮盒",       value: 800,   icon: "🌱" },
  3:  { name: "精緻抱枕 x2",   value: 1600,  icon: "🌿" },
  5:  { name: "專業清潔服務",   value: 2500,  icon: "🌳" },
  10: { name: "馬鈴薯大使資格", value: 5000,  icon: "🏆" },
};

export interface ReferrerStats {
  companyId: string;
  companyName: string;
  caseCount: number;
  wonCaseCount: number;
  clientCount: number;
  revenue: number;
  rewardTier: RewardTier;
  lastReferralDate: string;
  cases: ReferredCaseDetail[];
}

export interface ReferredCaseDetail {
  caseId: string;
  clientName: string;
  caseStatus: string;
  amount: number;
  inquiryDate: string;
}

export interface ReferralSummary {
  totalReferrers: number;
  totalReferredCases: number;
  totalWonCases: number;
  totalRevenue: number;
  pendingRewardCount: number;
}

export interface ReferralStatsResult {
  referrers: ReferrerStats[];
  summary: ReferralSummary;
}

export function computeRewardTier(clientCount: number): RewardTier {
  if (clientCount >= 10) return 10;
  if (clientCount >= 5)  return 5;
  if (clientCount >= 3)  return 3;
  if (clientCount >= 1)  return 1;
  return 0;
}

export function computeReferralStats(
  cases: CaseRecord[],
  versions: QuoteVersionRecord[],
): ReferralStatsResult {
  const acceptedAmountByCaseId = new Map<string, number>();
  for (const v of versions) {
    if (v.versionStatus === "accepted") {
      const existing = acceptedAmountByCaseId.get(v.caseId);
      if (existing === undefined || v.totalAmount > existing) {
        acceptedAmountByCaseId.set(v.caseId, v.totalAmount);
      }
    }
  }

  const referrerMap = new Map<string, {
    companyId: string;
    companyName: string;
    clientIds: Set<string>;
    cases: ReferredCaseDetail[];
    wonCaseCount: number;
    revenue: number;
    lastDate: string;
  }>();

  for (const c of cases) {
    if (!c.referredByCompanyId) continue;

    let entry = referrerMap.get(c.referredByCompanyId);
    if (!entry) {
      entry = {
        companyId: c.referredByCompanyId,
        companyName: c.referredByCompanyName,
        clientIds: new Set(),
        cases: [],
        wonCaseCount: 0,
        revenue: 0,
        lastDate: "",
      };
      referrerMap.set(c.referredByCompanyId, entry);
    }

    entry.clientIds.add(c.clientId);

    const amount = acceptedAmountByCaseId.get(c.caseId) ?? 0;
    if (c.caseStatus === "won") {
      entry.wonCaseCount++;
      entry.revenue += amount;
    }

    if (c.inquiryDate && c.inquiryDate > entry.lastDate) {
      entry.lastDate = c.inquiryDate;
    }

    entry.cases.push({
      caseId: c.caseId,
      clientName: c.clientNameSnapshot,
      caseStatus: c.caseStatus,
      amount,
      inquiryDate: c.inquiryDate,
    });
  }

  const referrers: ReferrerStats[] = Array.from(referrerMap.values())
    .map((e) => ({
      companyId: e.companyId,
      companyName: e.companyName,
      caseCount: e.cases.length,
      wonCaseCount: e.wonCaseCount,
      clientCount: e.clientIds.size,
      revenue: e.revenue,
      rewardTier: computeRewardTier(e.clientIds.size),
      lastReferralDate: e.lastDate,
      cases: e.cases,
    }))
    .sort((a, b) => b.revenue - a.revenue || b.caseCount - a.caseCount);

  const summary: ReferralSummary = {
    totalReferrers: referrers.length,
    totalReferredCases: referrers.reduce((s, r) => s + r.caseCount, 0),
    totalWonCases: referrers.reduce((s, r) => s + r.wonCaseCount, 0),
    totalRevenue: referrers.reduce((s, r) => s + r.revenue, 0),
    pendingRewardCount: referrers.filter((r) => r.rewardTier >= 1).length,
  };

  return { referrers, summary };
}
