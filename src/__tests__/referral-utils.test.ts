import { describe, it, expect } from "vitest";
import {
  computeRewardTier,
  computeReferralStats,
  REWARD_TIER_META,
} from "@/lib/referral-utils";
import {
  parseReferrerId,
  adaptFastApiResponse,
  referrerStatsToRow,
  referrerRowToStats,
  type FastApiResponse,
} from "@/lib/referral-utils";
import type { CaseRecord, QuoteVersionRecord } from "@/lib/types";
import type { ReferrerStats } from "@/lib/referral-utils";

function makeCase(overrides: Partial<CaseRecord> = {}): CaseRecord {
  return {
    caseId: "CA-001",
    caseName: "測試案件",
    clientId: "CL-001",
    clientNameSnapshot: "王先生",
    contactNameSnapshot: "王小明",
    phoneSnapshot: "0912345678",
    projectAddress: "台北市",
    channelSnapshot: "wholesale",
    caseStatus: "new",
    inquiryDate: "2025-01-01",
    latestQuoteId: "CA-001-Q01",
    latestVersionId: "CA-001-Q01-V01",
    latestSentAt: "",
    nextFollowUpDate: "",
    lastFollowUpAt: "",
    wonVersionId: "",
    lostReason: "",
    internalNotes: "",
    createdAt: "2025-01-01",
    updatedAt: "2025-01-01",
    leadSource: "referral",
    leadSourceDetail: "",
    leadSourceContact: "",
    leadSourceNotes: "",
    shippingStatus: "not_started",
    trackingNo: "",
    shippedAt: "",
    referredByCompanyId: "",
    referredByCompanyName: "",
    ...overrides,
  };
}

function makeVersion(overrides: Partial<QuoteVersionRecord> = {}): QuoteVersionRecord {
  return {
    versionId: "CA-001-Q01-V01",
    quoteId: "CA-001-Q01",
    caseId: "CA-001",
    versionNo: 1,
    basedOnVersionId: "",
    versionLabel: "V1",
    versionStatus: "accepted",
    quoteDate: "2025-01-01",
    sentAt: "2025-01-02",
    validUntil: "",
    followUpDays: 7,
    nextFollowUpDate: "",
    lastFollowUpAt: "",
    reminderStatus: "not_sent",
    subtotalBeforeTax: 50000,
    discountAmount: 0,
    taxRate: 0,
    taxAmount: 0,
    totalAmount: 50000,
    commissionMode: "price_gap",
    commissionRate: 0,
    commissionAmount: 0,
    channel: "wholesale",
    channelSnapshot: "wholesale",
    ...overrides,
  } as QuoteVersionRecord;
}

describe("computeRewardTier", () => {
  it("returns 0 for 0 clients", () => {
    expect(computeRewardTier(0)).toBe(0);
  });
  it("returns 1 for 1 client", () => {
    expect(computeRewardTier(1)).toBe(1);
  });
  it("returns 1 for 2 clients", () => {
    expect(computeRewardTier(2)).toBe(1);
  });
  it("returns 3 for 3 clients", () => {
    expect(computeRewardTier(3)).toBe(3);
  });
  it("returns 5 for 5 clients", () => {
    expect(computeRewardTier(5)).toBe(5);
  });
  it("returns 10 for 10 clients", () => {
    expect(computeRewardTier(10)).toBe(10);
  });
  it("returns 10 for 15 clients", () => {
    expect(computeRewardTier(15)).toBe(10);
  });
});

describe("computeReferralStats", () => {
  it("ignores cases without referredByCompanyId", () => {
    const cases = [makeCase({ referredByCompanyId: "" })];
    const result = computeReferralStats(cases, []);
    expect(result.referrers).toHaveLength(0);
    expect(result.summary.totalReferrers).toBe(0);
  });

  it("groups cases by referredByCompanyId", () => {
    const cases = [
      makeCase({ caseId: "CA-001", referredByCompanyId: "C001", referredByCompanyName: "鄭香基", clientId: "CL-001" }),
      makeCase({ caseId: "CA-002", referredByCompanyId: "C001", referredByCompanyName: "鄭香基", clientId: "CL-002" }),
      makeCase({ caseId: "CA-003", referredByCompanyId: "C002", referredByCompanyName: "莊榮盛", clientId: "CL-003" }),
    ];
    const result = computeReferralStats(cases, []);
    expect(result.referrers).toHaveLength(2);
    expect(result.summary.totalReferrers).toBe(2);
  });

  it("counts unique clientIds per referrer for rewardTier", () => {
    const cases = [
      makeCase({ caseId: "CA-001", referredByCompanyId: "C001", referredByCompanyName: "鄭香基", clientId: "CL-001" }),
      makeCase({ caseId: "CA-002", referredByCompanyId: "C001", referredByCompanyName: "鄭香基", clientId: "CL-001" }),
    ];
    const result = computeReferralStats(cases, []);
    const referrer = result.referrers[0];
    expect(referrer.clientCount).toBe(1);
    expect(referrer.rewardTier).toBe(1);
  });

  it("sums revenue from accepted versions of referred cases", () => {
    const cases = [
      makeCase({ caseId: "CA-001", referredByCompanyId: "C001", referredByCompanyName: "鄭香基", clientId: "CL-001", caseStatus: "won" }),
      makeCase({ caseId: "CA-002", referredByCompanyId: "C001", referredByCompanyName: "鄭香基", clientId: "CL-002", caseStatus: "new" }),
    ];
    const versions = [
      makeVersion({ versionId: "V01", caseId: "CA-001", versionStatus: "accepted", totalAmount: 80000 }),
      makeVersion({ versionId: "V02", caseId: "CA-001", versionStatus: "superseded", totalAmount: 60000 }),
      makeVersion({ versionId: "V03", caseId: "CA-002", versionStatus: "draft", totalAmount: 30000 }),
    ];
    const result = computeReferralStats(cases, versions);
    const referrer = result.referrers[0];
    expect(referrer.revenue).toBe(80000);
    expect(referrer.wonCaseCount).toBe(1);
  });

  it("summary.totalRevenue sums all referrers", () => {
    const cases = [
      makeCase({ caseId: "CA-001", referredByCompanyId: "C001", clientId: "CL-001", caseStatus: "won" }),
      makeCase({ caseId: "CA-002", referredByCompanyId: "C002", clientId: "CL-002", caseStatus: "won" }),
    ];
    const versions = [
      makeVersion({ caseId: "CA-001", versionStatus: "accepted", totalAmount: 50000 }),
      makeVersion({ caseId: "CA-002", versionStatus: "accepted", totalAmount: 70000 }),
    ];
    const result = computeReferralStats(cases, versions);
    expect(result.summary.totalRevenue).toBe(120000);
  });

  it("pendingRewardCount counts referrers with rewardTier >= 1", () => {
    const cases = [
      makeCase({ caseId: "CA-001", referredByCompanyId: "C001", clientId: "CL-001" }),
    ];
    const result = computeReferralStats(cases, []);
    expect(result.summary.pendingRewardCount).toBe(1);
  });

  it("sorts referrers by revenue descending", () => {
    const cases = [
      makeCase({ caseId: "CA-001", referredByCompanyId: "C001", clientId: "CL-001", caseStatus: "won" }),
      makeCase({ caseId: "CA-002", referredByCompanyId: "C002", clientId: "CL-002", caseStatus: "won" }),
    ];
    const versions = [
      makeVersion({ caseId: "CA-001", versionStatus: "accepted", totalAmount: 30000 }),
      makeVersion({ caseId: "CA-002", versionStatus: "accepted", totalAmount: 80000 }),
    ];
    const result = computeReferralStats(cases, versions);
    expect(result.referrers[0].companyId).toBe("C002");
  });
});

// ── FastAPI adapter ────────────────────────────────────────────────────────

const FASTAPI_FIXTURE: FastApiResponse = {
  networks: [
    {
      referrer: "P3258 鄭香基",
      direct_referrals: 2,
      total_network: 2,
      total_network_revenue: 121600,
      layer_stats: {
        "1": {
          count: 2,
          revenue: 121600,
          people: [
            {
              name: "郑香城",
              phone: "0920004260",
              orders: ["P5871"],
              revenue: 65800,
              referrer_name: "P3258 鄭香基",
              relationship_type: "",
            },
            {
              name: "郑小明",
              phone: "0920001234",
              orders: ["P5309", "P5310"],
              revenue: 55800,
              referrer_name: "P3258 鄭香基",
              relationship_type: "",
            },
          ],
        },
      },
    },
  ],
  total_referrers: 1,
  total_network_size: 2,
};

describe("parseReferrerId", () => {
  it("parses standard ID + name format", () => {
    expect(parseReferrerId("P3258 鄭香基")).toEqual({ id: "P3258", name: "P3258 鄭香基" });
  });

  it("parses another entry", () => {
    expect(parseReferrerId("P4346 莊榮盛")).toEqual({ id: "P4346", name: "P4346 莊榮盛" });
  });

  it("returns raw string as both id and name when no space", () => {
    expect(parseReferrerId("P3258")).toEqual({ id: "P3258", name: "P3258" });
  });
});

describe("adaptFastApiResponse", () => {
  it("produces correct referrer stats from fixture", () => {
    const result = adaptFastApiResponse(FASTAPI_FIXTURE);
    expect(result.referrers).toHaveLength(1);
    const r = result.referrers[0];
    expect(r.companyId).toBe("P3258");
    expect(r.companyName).toBe("P3258 鄭香基");
    expect(r.clientCount).toBe(2);
    expect(r.caseCount).toBe(3);   // P5871 + P5309 + P5310
    expect(r.wonCaseCount).toBe(3);
    expect(r.revenue).toBe(121600);
    expect(r.rewardTier).toBe(1);
    expect(r.rewardStatus).toBe("pending");
    expect(r.cases).toHaveLength(3);
  });

  it("produces correct summary from fixture", () => {
    const result = adaptFastApiResponse(FASTAPI_FIXTURE);
    expect(result.summary.totalReferrers).toBe(1);
    expect(result.summary.totalReferredCases).toBe(3);
    expect(result.summary.totalRevenue).toBe(121600);
    expect(result.summary.pendingRewardCount).toBe(1);
  });

  it("handles empty networks gracefully", () => {
    const empty: FastApiResponse = { networks: [], total_referrers: 0, total_network_size: 0 };
    const result = adaptFastApiResponse(empty);
    expect(result.referrers).toHaveLength(0);
    expect(result.summary.totalReferrers).toBe(0);
    expect(result.summary.pendingRewardCount).toBe(0);
  });
});

describe("referrerStatsToRow / referrerRowToStats round-trip", () => {
  it("round-trips all fields without loss", () => {
    const stats: ReferrerStats = {
      companyId: "P3258",
      companyName: "P3258 鄭香基",
      caseCount: 3,
      wonCaseCount: 3,
      clientCount: 2,
      revenue: 121600,
      rewardTier: 1,
      rewardStatus: "pending",
      lastReferralDate: "",
      cases: [
        { caseId: "P5871", clientName: "郑香城", caseStatus: "won", amount: 65800, inquiryDate: "" },
      ],
    };
    const row = referrerStatsToRow(stats, "2026-05-03T12:00:00.000Z");
    const restored = referrerRowToStats(row);
    expect(restored.companyId).toBe("P3258");
    expect(restored.revenue).toBe(121600);
    expect(restored.rewardTier).toBe(1);
    expect(restored.rewardStatus).toBe("pending");
    expect(restored.cases).toHaveLength(1);
    expect(restored.cases[0].caseId).toBe("P5871");
  });

  it("preserves rewardStatus=sent through round-trip", () => {
    const stats: ReferrerStats = {
      companyId: "P4346",
      companyName: "P4346 莊榮盛",
      caseCount: 1,
      wonCaseCount: 1,
      clientCount: 1,
      revenue: 119900,
      rewardTier: 1,
      rewardStatus: "sent",
      lastReferralDate: "",
      cases: [],
    };
    const row = referrerStatsToRow(stats, "2026-05-03T12:00:00.000Z");
    const restored = referrerRowToStats(row);
    expect(restored.rewardStatus).toBe("sent");
  });
});
