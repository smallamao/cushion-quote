# 轉介紹追蹤系統 (Referral Tracking) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在繃布報價系統新增 `/referrals` 頁面，從 Google Sheets 計算轉介紹統計，包含儀表板、引薦人列表（可展開）、待發獎勵清單。

**Architecture:** 新增 `GET /api/referrals/stats` API，直接讀取 Google Sheets 的案件表（`referredByCompanyId` 欄位）與報價版本表，在伺服器端計算各引薦人的統計資料。純計算邏輯提取到 `src/lib/referral-utils.ts`，前端用 `Tabs` 組件呈現四個模組（儀表板 / 多層網路 / 待發獎勵 / 同步）。

**Tech Stack:** Next.js 15, TypeScript, Vitest, Google Sheets API, Radix UI Tabs (已有 `src/components/ui/tabs.tsx`)

---

## File Map

| 狀態 | 路徑 | 職責 |
|------|------|------|
| Create | `src/lib/referral-utils.ts` | 純計算：tier 計算、groupBy referrer |
| Create | `src/__tests__/referral-utils.test.ts` | Vitest 單元測試 |
| Create | `src/app/api/referrals/stats/route.ts` | GET API，讀 Sheets 回傳統計 |
| Create | `src/app/referrals/page.tsx` | Server component wrapper (Suspense) |
| Create | `src/app/referrals/ReferralsClient.tsx` | Client，管理 fetch 狀態 + Tabs |
| Create | `src/components/referrals/StatsCards.tsx` | 5 個統計卡片 |
| Create | `src/components/referrals/ReferrerList.tsx` | 多層網路 Tab：搜尋 + 排序 + 展開 |
| Create | `src/components/referrals/PendingRewards.tsx` | 待發獎勵 Tab |
| Modify | `src/components/layout/nav-links.ts` | 新增 `/referrals` 連結 |

---

## Task 1: 純計算邏輯 + 型別定義 (TDD)

**Files:**
- Create: `src/lib/referral-utils.ts`
- Create: `src/__tests__/referral-utils.test.ts`

### 先寫測試

- [ ] **Step 1: 建立測試檔，寫 `computeRewardTier` 的測試**

```typescript
// src/__tests__/referral-utils.test.ts
import { describe, it, expect } from "vitest";
import {
  computeRewardTier,
  computeReferralStats,
  REWARD_TIER_META,
} from "@/lib/referral-utils";
import type { CaseRecord, QuoteVersionRecord } from "@/lib/types";

// ── helpers ──────────────────────────────────────────────────────────────────

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

// ── computeRewardTier ─────────────────────────────────────────────────────────

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

// ── computeReferralStats ──────────────────────────────────────────────────────

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
      makeCase({ caseId: "CA-002", referredByCompanyId: "C001", referredByCompanyName: "鄭香基", clientId: "CL-001" }), // same client
    ];
    const result = computeReferralStats(cases, []);
    const referrer = result.referrers[0];
    expect(referrer.clientCount).toBe(1); // de-duped
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
    expect(referrer.revenue).toBe(80000); // only accepted version
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
    expect(result.referrers[0].companyId).toBe("C002"); // higher revenue first
  });
});
```

- [ ] **Step 2: 執行測試，確認全部失敗（找不到模組）**

```bash
cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價
npx vitest run src/__tests__/referral-utils.test.ts
```

預期輸出包含：`Cannot find module '@/lib/referral-utils'`

- [ ] **Step 3: 建立 `src/lib/referral-utils.ts` 並實作**

```typescript
// src/lib/referral-utils.ts
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
  // 建立 caseId → accepted version 的 totalAmount 索引
  const acceptedAmountByCaseId = new Map<string, number>();
  for (const v of versions) {
    if (v.versionStatus === "accepted") {
      const existing = acceptedAmountByCaseId.get(v.caseId);
      // 取金額最大的 accepted 版本（理論上只有一個，防衛性處理）
      if (existing === undefined || v.totalAmount > existing) {
        acceptedAmountByCaseId.set(v.caseId, v.totalAmount);
      }
    }
  }

  // 依 referredByCompanyId 分組
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
```

- [ ] **Step 4: 執行測試，確認全部通過**

```bash
npx vitest run src/__tests__/referral-utils.test.ts
```

預期輸出：`✓ src/__tests__/referral-utils.test.ts (11 tests) passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/referral-utils.ts src/__tests__/referral-utils.test.ts
git commit -m "feat(referrals): add computeReferralStats and computeRewardTier utilities"
```

---

## Task 2: API 端點 `GET /api/referrals/stats`

**Files:**
- Create: `src/app/api/referrals/stats/route.ts`

- [ ] **Step 1: 建立 API 路由**

```typescript
// src/app/api/referrals/stats/route.ts
import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import { getCaseRows, caseRowToRecord, getVersionRows, versionRowToRecord } from "@/app/api/sheets/_v2-utils";
import { computeReferralStats } from "@/lib/referral-utils";

export async function GET() {
  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const [caseRows, versionRows] = await Promise.all([
      getCaseRows(client),
      getVersionRows(client),
    ]);

    const cases = caseRows.map(caseRowToRecord);
    const versions = versionRows.map(versionRowToRecord);
    const stats = computeReferralStats(cases, versions);

    return NextResponse.json({ ok: true, ...stats });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: 確認 `getVersionRows` 是否已從 `_v2-utils` 匯出**

```bash
grep -n "^export.*getVersionRows" /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價/src/app/api/sheets/_v2-utils.ts
```

- 若找不到 `export`，在 `_v2-utils.ts` 新增匯出：
  ```typescript
  export async function getVersionRows(client: SheetsClient): Promise<string[][]> { ... }
  ```
  （實際函式已存在，只需加 `export`）

- [ ] **Step 3: TypeScript build 檢查**

```bash
npx tsc --noEmit 2>&1 | head -30
```

預期：無錯誤。若有，修正型別後再繼續。

- [ ] **Step 4: Commit**

```bash
git add src/app/api/referrals/stats/route.ts
git commit -m "feat(referrals): add GET /api/referrals/stats endpoint"
```

---

## Task 3: StatsCards 元件

**Files:**
- Create: `src/components/referrals/StatsCards.tsx`

- [ ] **Step 1: 建立元件**

```tsx
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
```

- [ ] **Step 2: Commit**

```bash
git add src/components/referrals/StatsCards.tsx
git commit -m "feat(referrals): add StatsCards component"
```

---

## Task 4: ReferrerList 元件（多層網路 Tab，Phase 1 + Phase 2）

**Files:**
- Create: `src/components/referrals/ReferrerList.tsx`

此元件包含：
- 搜尋框（過濾引薦人名稱）
- 引薦人列表（依貢獻金額排序，已在 API 端排好）
- 每行可點擊展開，顯示被介紹案件清單（Phase 2）

- [ ] **Step 1: 建立元件**

```tsx
// src/components/referrals/ReferrerList.tsx
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
```

- [ ] **Step 2: Commit**

```bash
git add src/components/referrals/ReferrerList.tsx
git commit -m "feat(referrals): add ReferrerList with expandable case detail"
```

---

## Task 5: PendingRewards 元件

**Files:**
- Create: `src/components/referrals/PendingRewards.tsx`

注意：Phase 1 沒有 `reward_status` 欄位，所以「待發」= `rewardTier >= 1` 的引薦人。未來加入 `rewardStatus` 欄位後，此元件只需改過濾條件。

- [ ] **Step 1: 建立元件**

```tsx
// src/components/referrals/PendingRewards.tsx
import { formatCurrency } from "@/lib/utils";
import { REWARD_TIER_META } from "@/lib/referral-utils";
import type { ReferrerStats } from "@/lib/referral-utils";

interface Props {
  referrers: ReferrerStats[];
}

export function PendingRewards({ referrers }: Props) {
  // Phase 1: 所有 rewardTier >= 1 的引薦人都算「待發」
  const pending = referrers.filter((r) => r.rewardTier >= 1);

  if (pending.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-[var(--text-secondary)]">
        目前沒有待發放的獎勵
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-[var(--text-secondary)]">
        共 {pending.length} 位引薦人待發獎勵（Phase 2 將加入手動標記已發放功能）
      </p>
      <div className="overflow-hidden rounded-md border border-[var(--border)]">
        {pending.map((r, idx) => {
          const meta = REWARD_TIER_META[r.rewardTier];
          return (
            <div
              key={r.companyId}
              className={`flex items-center gap-4 px-4 py-3 ${idx !== 0 ? "border-t border-[var(--border)]" : ""}`}
            >
              <span className="text-lg">{meta?.icon ?? ""}</span>
              <div className="flex-1">
                <div className="font-medium text-[var(--text-primary)]">{r.companyName}</div>
                <div className="text-xs text-[var(--text-secondary)]">
                  介紹 {r.clientCount} 位客戶
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-[var(--text-primary)]">
                  {meta?.name ?? "—"}
                </div>
                <div className="text-xs text-[var(--text-secondary)]">
                  {meta ? formatCurrency(meta.value) : ""}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/referrals/PendingRewards.tsx
git commit -m "feat(referrals): add PendingRewards component"
```

---

## Task 6: ReferralsClient 主頁面元件

**Files:**
- Create: `src/app/referrals/ReferralsClient.tsx`

- [ ] **Step 1: 建立 Client 元件**

```tsx
// src/app/referrals/ReferralsClient.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

import type { ReferralStatsResult } from "@/lib/referral-utils";
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

// ── 獎勵層級分布 ─────────────────────────────────────────────────────────────

import { REWARD_TIER_META } from "@/lib/referral-utils";
import type { ReferrerStats } from "@/lib/referral-utils";

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
```

- [ ] **Step 2: Commit**

```bash
git add src/app/referrals/ReferralsClient.tsx
git commit -m "feat(referrals): add ReferralsClient with Tabs layout"
```

---

## Task 7: 頁面路由 + 導覽列

**Files:**
- Create: `src/app/referrals/page.tsx`
- Modify: `src/components/layout/nav-links.ts`

- [ ] **Step 1: 建立 page.tsx**

```tsx
// src/app/referrals/page.tsx
import { Suspense } from "react";
import { Loader2 } from "lucide-react";

import { ReferralsClient } from "@/app/referrals/ReferralsClient";

export default function ReferralsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--text-secondary)]" />
      </div>
    }>
      <ReferralsClient />
    </Suspense>
  );
}
```

- [ ] **Step 2: 在 nav-links.ts 新增連結**

在 `src/components/layout/nav-links.ts` 的 `// ── 業務 ──` 區塊，`/cases` 之後新增：

```typescript
// 新增 import（與其他 icons 放在一起）
import { Users } from "lucide-react";

// 新增連結（放在 /cases 之後）
{ href: "/referrals", label: "轉介紹", icon: Users, roles: ["admin"], group: "business" },
```

- [ ] **Step 3: TypeScript build 檢查**

```bash
npx tsc --noEmit 2>&1 | head -30
```

預期：無錯誤。

- [ ] **Step 4: 執行所有測試**

```bash
npx vitest run
```

預期：全部通過。

- [ ] **Step 5: Commit**

```bash
git add src/app/referrals/page.tsx src/components/layout/nav-links.ts
git commit -m "feat(referrals): add /referrals page route and nav link"
```

---

## Self-Review

### Spec Coverage

| 規格需求 | 對應 Task |
|---------|----------|
| 儀表板：5 個統計卡片 | Task 3 (StatsCards) + Task 6 (ReferralsClient dashboard tab) |
| 儀表板：獎勵層級分布 | Task 6 (TierDistribution) |
| 多層網路：引薦人列表 + 搜尋 | Task 4 (ReferrerList) |
| 多層網路：點擊展開被介紹人 | Task 4 (ReferrerList 展開邏輯) |
| 待發獎勵清單 | Task 5 (PendingRewards) |
| 同步按鈕 + 最後同步時間 | Task 6 (sync tab) |
| `/referrals` 路由 | Task 7 |
| 導覽列連結 | Task 7 |
| Google Sheets 資料來源 | Task 2 (API route) |
| 獎勵層級計算邏輯 | Task 1 (computeRewardTier) |

### 型別一致性確認

- `ReferrerStats` 定義於 Task 1，StatsCards / ReferrerList / PendingRewards / ReferralsClient 都 import 相同型別 ✓
- `ReferralSummary` 定義於 Task 1，StatsCards 使用 ✓
- `REWARD_TIER_META` 定義於 Task 1，ReferrerList / PendingRewards / TierDistribution 使用 ✓
- API 回傳 `{ ok, referrers, summary }` ，ReferralsClient 型別 `ApiResponse extends ReferralStatsResult` ✓

### Phase 2 / Phase 3 後續事項（此計畫不實作）

- **Phase 2**：ReferrerList 展開功能已包含（即為 Phase 2 層級展開），已完整實作
- **Phase 3 獎勵發放**：需在 Google Sheets `案件` 表新增兩欄 `rewardStatus`（pending/sent）和 `rewardSentDate`；後端讀取並回傳；PendingRewards 加入「標記已發放」按鈕呼叫 `POST /api/referrals/mark-reward`
