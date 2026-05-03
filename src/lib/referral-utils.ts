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
  rewardStatus?: "pending" | "sent";
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

// ── FastAPI types ──────────────────────────────────────────────────────────

export interface FastApiPerson {
  name: string;
  phone: string;
  orders: string[];
  revenue: number;
  referrer_name: string;
  relationship_type: string;
}

export interface FastApiNetwork {
  referrer: string;
  direct_referrals: number;
  total_network: number;
  total_network_revenue: number;
  layer_stats?: Record<string, { count: number; revenue: number; people: FastApiPerson[] }>;
}

export interface FastApiResponse {
  networks: FastApiNetwork[];
  total_referrers: number;
  total_network_size: number;
}

// ── Adapter helpers ────────────────────────────────────────────────────────

export function parseReferrerId(raw: string): { id: string; name: string } {
  const spaceIdx = raw.indexOf(" ");
  if (spaceIdx === -1) return { id: raw, name: raw };
  return { id: raw.slice(0, spaceIdx), name: raw };
}

export function adaptFastApiResponse(data: FastApiResponse): ReferralStatsResult {
  const referrers: ReferrerStats[] = data.networks
    .map((network) => {
      const { id, name } = parseReferrerId(network.referrer);
      const layer1People = network.layer_stats?.["1"]?.people ?? [];

      const cases: ReferredCaseDetail[] = layer1People.flatMap((person) =>
        (person.orders ?? []).map((orderId) => ({
          caseId: orderId,
          clientName: person.name,
          caseStatus: "won",
          amount:
            person.orders.length > 0
              ? Math.round(person.revenue / person.orders.length)
              : 0,
          inquiryDate: "",
        })),
      );

      const caseCount = cases.length;
      const clientCount = network.direct_referrals;
      const revenue = network.total_network_revenue;

      return {
        companyId: id,
        companyName: name,
        caseCount,
        wonCaseCount: caseCount,
        clientCount,
        revenue,
        rewardTier: computeRewardTier(clientCount),
        rewardStatus: "pending" as const,
        lastReferralDate: "",
        cases,
      };
    })
    .sort((a, b) => b.revenue - a.revenue || b.caseCount - a.caseCount);

  const summary: ReferralSummary = {
    totalReferrers: referrers.length,
    totalReferredCases: referrers.reduce((s, r) => s + r.caseCount, 0),
    totalWonCases: referrers.reduce((s, r) => s + r.wonCaseCount, 0),
    totalRevenue: referrers.reduce((s, r) => s + r.revenue, 0),
    pendingRewardCount: referrers.filter(
      (r) => r.rewardTier >= 1 && r.rewardStatus !== "sent",
    ).length,
  };

  return { referrers, summary };
}

// ── Google Sheets row serialisation ───────────────────────────────────────

export function referrerStatsToRow(r: ReferrerStats, syncedAt: string): string[] {
  return [
    r.companyId,
    r.companyName,
    String(r.clientCount),
    String(r.caseCount),
    String(r.revenue),
    String(r.rewardTier),
    r.rewardStatus ?? "pending",
    r.lastReferralDate,
    JSON.stringify(r.cases),
    syncedAt,
  ];
}

export function referrerRowToStats(row: string[]): ReferrerStats {
  let cases: ReferredCaseDetail[] = [];
  try {
    cases = JSON.parse(row[8] ?? "[]") as ReferredCaseDetail[];
  } catch {
    cases = [];
  }
  const caseCount = Number(row[3]) || 0;
  return {
    companyId: row[0] ?? "",
    companyName: row[1] ?? "",
    clientCount: Number(row[2]) || 0,
    caseCount,
    wonCaseCount: caseCount,
    revenue: Number(row[4]) || 0,
    rewardTier: (Number(row[5]) || 0) as RewardTier,
    rewardStatus: (row[6] === "sent" ? "sent" : "pending") as "pending" | "sent",
    lastReferralDate: row[7] ?? "",
    cases,
  };
}
