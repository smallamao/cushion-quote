# Referral Sync (FastAPI → Google Sheets) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pull B2C referral data from the existing FastAPI backend (Render) into a dedicated `轉介紹人` Google Sheets tab, so the `/referrals` UI shows real data instead of an empty list.

**Architecture:** The legacy Python/Streamlit system syncs Trello → FastAPI. Our Next.js app posts a user-triggered sync that fetches `GET /api/referrals/network` from the FastAPI, writes all referrer rows to a new `轉介紹人` Google Sheets tab (preserving manually-set `rewardStatus`), and reads stats from that tab on every page load.

**Tech Stack:** Next.js 15 App Router, TypeScript, Google Sheets API v4 via `getSheetsClient()`, Vitest, `LEGACY_API_URL` env var (already set).

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/app/api/sheets/init/route.ts` | Add `轉介紹人` tab to SHEET_DEFINITIONS |
| Create | `src/app/api/referrals/_sheets-utils.ts` | `getReferrerRows()` shared helper + sheet constants |
| Modify | `src/lib/referral-utils.ts` | FastAPI types, `parseReferrerId`, `adaptFastApiResponse`, `referrerStatsToRow`, `referrerRowToStats`; add `rewardStatus?` to `ReferrerStats` |
| Modify | `src/__tests__/referral-utils.test.ts` | New tests for the 4 added functions |
| Modify | `src/app/api/referrals/stats/route.ts` | Rewrite: read from `轉介紹人` Sheets tab (replaces reading cases+versions) |
| Create | `src/app/api/referrals/sync/route.ts` | POST: ping FastAPI health, fetch network data, write rows to Sheets |
| Modify | `src/app/referrals/ReferralsClient.tsx` | Update sync tab with FastAPI sync button and status message |

---

## Context for subagent workers

- `SheetsClient = { sheets: sheets_v4.Sheets; spreadsheetId: string }` from `@/lib/sheets-client`
- `getSheetsClient()` is an async factory — returns `SheetsClient | null`
- `LEGACY_API_URL=https://sofa-production-system-fast-api.onrender.com` is already in `.env.local`
- Render free-tier cold start takes 30-60s → ping `/api/health` first before fetching data
- Existing `ReferrerStats.companyId / companyName` map to `referrerId / referrerName` for B2C data
- Existing `computeReferralStats` (B2B path) stays untouched — only `stats/route.ts` changes
- `AbortSignal.timeout(ms)` is available in Node 18+

---

## Task 1: Add `轉介紹人` Sheet tab + shared row helper

**Files:**
- Modify: `src/app/api/sheets/init/route.ts`
- Create: `src/app/api/referrals/_sheets-utils.ts`

- [ ] **Step 1: Add tab definition to `init/route.ts`**

Find the last item in `SHEET_DEFINITIONS` (it's `電子發票紀錄`) and insert after it:

```typescript
  {
    title: "轉介紹人",
    headers: [
      "引荐人ID",
      "引荐人名稱",
      "介紹人數",
      "訂單數",
      "貢獻營收",
      "獎勵層級",
      "獎勵狀態",
      "最近轉介日",
      "被介紹人JSON",
      "同步時間",
    ],
  },
```

- [ ] **Step 2: Create `src/app/api/referrals/_sheets-utils.ts`**

```typescript
import type { SheetsClient } from "@/lib/sheets-client";

export const REFERRER_SHEET = "轉介紹人";
const DATA_RANGE = `${REFERRER_SHEET}!A2:J`;

export async function getReferrerRows(client: SheetsClient): Promise<string[][]> {
  const res = await client.sheets.spreadsheets.values.get({
    spreadsheetId: client.spreadsheetId,
    range: DATA_RANGE,
  });
  return (res.data.values ?? []) as string[][];
}

export async function writeReferrerRows(client: SheetsClient, rows: string[][]): Promise<void> {
  await client.sheets.spreadsheets.values.clear({
    spreadsheetId: client.spreadsheetId,
    range: DATA_RANGE,
  });
  if (rows.length === 0) return;
  await client.sheets.spreadsheets.values.update({
    spreadsheetId: client.spreadsheetId,
    range: `${REFERRER_SHEET}!A2`,
    valueInputOption: "RAW",
    requestBody: { values: rows },
  });
}
```

- [ ] **Step 3: Check types**

```bash
cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價 && npx tsc --noEmit 2>&1 | head -30
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/sheets/init/route.ts src/app/api/referrals/_sheets-utils.ts
git commit -m "feat(referrals): add 轉介紹人 sheet tab + row helper utils"
```

---

## Task 2: Add FastAPI types, adapters, and row helpers to `referral-utils.ts` (TDD)

**Files:**
- Modify: `src/lib/referral-utils.ts`
- Modify: `src/__tests__/referral-utils.test.ts`

- [ ] **Step 1: Write failing tests — append to `src/__tests__/referral-utils.test.ts`**

Add these imports at the top of the test file (after existing imports):

```typescript
import {
  parseReferrerId,
  adaptFastApiResponse,
  referrerStatsToRow,
  referrerRowToStats,
  type FastApiResponse,
} from "@/lib/referral-utils";
```

Append these test suites at the bottom of the file:

```typescript
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

  it("returns the raw string as both id and name when no space", () => {
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
```

- [ ] **Step 2: Run tests to verify they FAIL**

```bash
cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價 && npx vitest run src/__tests__/referral-utils.test.ts 2>&1 | tail -20
```

Expected: failures mentioning `parseReferrerId is not a function` or similar.

- [ ] **Step 3: Add types and functions to `src/lib/referral-utils.ts`**

Add `rewardStatus?` field to `ReferrerStats` (after `lastReferralDate`):

```typescript
export interface ReferrerStats {
  companyId: string;
  companyName: string;
  caseCount: number;
  wonCaseCount: number;
  clientCount: number;
  revenue: number;
  rewardTier: RewardTier;
  lastReferralDate: string;
  rewardStatus?: "pending" | "sent";
  cases: ReferredCaseDetail[];
}
```

Append at the end of `src/lib/referral-utils.ts`:

```typescript
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
```

- [ ] **Step 4: Run tests to verify they PASS**

```bash
cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價 && npx vitest run src/__tests__/referral-utils.test.ts 2>&1 | tail -20
```

Expected: all tests pass (including the 14 pre-existing + the new ones added here). Pre-existing failing `v2-utils.test.ts` tests are unrelated — ignore them.

- [ ] **Step 5: Check types**

```bash
cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價 && npx tsc --noEmit 2>&1 | head -30
```

Expected: no new errors (there may be pre-existing errors to ignore; focus on new ones).

- [ ] **Step 6: Commit**

```bash
git add src/lib/referral-utils.ts src/__tests__/referral-utils.test.ts
git commit -m "feat(referrals): add FastAPI adapter + Sheets row helpers with TDD"
```

---

## Task 3: Rewrite `stats/route.ts` to read from `轉介紹人` Sheets tab

**Files:**
- Modify: `src/app/api/referrals/stats/route.ts` (full rewrite)

- [ ] **Step 1: Rewrite `src/app/api/referrals/stats/route.ts`**

Replace the entire file content with:

```typescript
import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import { referrerRowToStats } from "@/lib/referral-utils";
import type { ReferralSummary } from "@/lib/referral-utils";
import { getReferrerRows } from "../_sheets-utils";

export async function GET() {
  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const rows = await getReferrerRows(client);
    const referrers = rows
      .filter((row) => row.length >= 9 && row[0])
      .map(referrerRowToStats);

    const summary: ReferralSummary = {
      totalReferrers: referrers.length,
      totalReferredCases: referrers.reduce((s, r) => s + r.caseCount, 0),
      totalWonCases: referrers.reduce((s, r) => s + r.wonCaseCount, 0),
      totalRevenue: referrers.reduce((s, r) => s + r.revenue, 0),
      pendingRewardCount: referrers.filter(
        (r) => r.rewardTier >= 1 && r.rewardStatus !== "sent",
      ).length,
    };

    return NextResponse.json({ ok: true, referrers, summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Check types**

```bash
cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價 && npx tsc --noEmit 2>&1 | head -30
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/referrals/stats/route.ts
git commit -m "feat(referrals): rewrite stats route to read from 轉介紹人 Sheets tab"
```

---

## Task 4: Create `sync/route.ts` — POST sync from FastAPI to Sheets

**Files:**
- Create: `src/app/api/referrals/sync/route.ts`

- [ ] **Step 1: Create `src/app/api/referrals/sync/route.ts`**

```typescript
import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import {
  adaptFastApiResponse,
  referrerStatsToRow,
  referrerRowToStats,
  type FastApiResponse,
} from "@/lib/referral-utils";
import { getReferrerRows, writeReferrerRows } from "../_sheets-utils";

export async function POST() {
  const legacyUrl = process.env.LEGACY_API_URL;
  if (!legacyUrl) {
    return NextResponse.json({ ok: false, error: "LEGACY_API_URL 未設定" }, { status: 503 });
  }

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    // Ping health endpoint to wake Render's free-tier service (cold start ~30-60s).
    // We don't wait on the result — the generous timeout on the main request handles it.
    void fetch(`${legacyUrl}/api/health`, {
      signal: AbortSignal.timeout(15000),
    }).catch(() => null);

    // Fetch referral network data (65s timeout covers Render cold start).
    const res = await fetch(`${legacyUrl}/api/referrals/network`, {
      signal: AbortSignal.timeout(65000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        { ok: false, error: `FastAPI 回傳 ${res.status}${text ? `: ${text.slice(0, 100)}` : ""}` },
        { status: 502 },
      );
    }

    const data = (await res.json()) as FastApiResponse;

    // Read existing rows to preserve manually-set rewardStatus.
    const existingRows = await getReferrerRows(client);
    const existingStatusMap = new Map<string, "pending" | "sent">();
    for (const row of existingRows) {
      const id = row[0];
      const status = row[6];
      if (id && (status === "pending" || status === "sent")) {
        existingStatusMap.set(id, status);
      }
    }

    // Adapt FastAPI data → ReferrerStats[].
    const stats = adaptFastApiResponse(data);

    // Preserve existing rewardStatus for known referrers.
    for (const referrer of stats.referrers) {
      const preserved = existingStatusMap.get(referrer.companyId);
      if (preserved) {
        referrer.rewardStatus = preserved;
      }
    }

    const syncedAt = new Date().toISOString();
    const rows = stats.referrers.map((r) => referrerStatsToRow(r, syncedAt));

    await writeReferrerRows(client, rows);

    return NextResponse.json({
      ok: true,
      count: rows.length,
      syncedAt,
      message: `已同步 ${rows.length} 筆轉介紹人資料`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Check types**

```bash
cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價 && npx tsc --noEmit 2>&1 | head -30
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/referrals/sync/route.ts
git commit -m "feat(referrals): create sync route — POST syncs FastAPI data to Google Sheets"
```

---

## Task 5: Update `ReferralsClient.tsx` sync tab

**Files:**
- Modify: `src/app/referrals/ReferralsClient.tsx`

- [ ] **Step 1: Add `syncing` state and `syncFromFastApi` handler**

After the existing state declarations (around line 23), add:

```typescript
const [syncing, setSyncing] = useState(false);
const [syncResult, setSyncResult] = useState<{ message: string; syncedAt: string } | null>(null);
const [syncError, setSyncError] = useState<string | null>(null);
```

After the `load` callback, add a `syncFromFastApi` callback:

```typescript
const syncFromFastApi = useCallback(async () => {
  setSyncing(true);
  setSyncError(null);
  try {
    const res = await fetch("/api/referrals/sync", { method: "POST" });
    const json = (await res.json()) as { ok: boolean; message?: string; syncedAt?: string; error?: string };
    if (!json.ok) throw new Error(json.error ?? "同步失敗");
    setSyncResult({ message: json.message ?? "", syncedAt: json.syncedAt ?? "" });
    await load();
  } catch (err) {
    setSyncError(err instanceof Error ? err.message : "未知錯誤");
  } finally {
    setSyncing(false);
  }
}, [load]);
```

- [ ] **Step 2: Replace the sync tab content**

Find the `<TabsContent value="sync" ...>` block and replace it with:

```typescript
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
              注意：FastAPI 服務使用 Render 免費方案，首次同步可能需等待 30-60 秒。
            </p>
          </TabsContent>
```

- [ ] **Step 3: Check types**

```bash
cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價 && npx tsc --noEmit 2>&1 | head -30
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/referrals/ReferralsClient.tsx
git commit -m "feat(referrals): update sync tab with FastAPI sync button and status feedback"
```

---

## Self-Review

### Spec Coverage

| Spec requirement | Task |
|-----------------|------|
| 轉介紹人 Sheets tab (independent of B2B client database) | Task 1 |
| FastAPI network data → Sheets row serialisation | Task 2 |
| Ping health before fetch (Render cold start) | Task 4 |
| Preserve rewardStatus across syncs | Task 4 |
| Stats route reads from new Sheets tab | Task 3 |
| UI sync tab triggers POST /api/referrals/sync | Task 5 |
| Show sync result / error in UI | Task 5 |

### Type Consistency Check

- `ReferrerStats.rewardStatus?: "pending" | "sent"` — added in Task 2, read in Tasks 3 & 4 ✓
- `referrerStatsToRow` outputs `string[]` of length 10, `referrerRowToStats` reads indices 0-8 ✓
- `FastApiResponse` type used in sync route without `as unknown` needed ✓
- `getReferrerRows` and `writeReferrerRows` both come from `../_sheets-utils` (same relative path) ✓

### No Placeholders Found ✓
