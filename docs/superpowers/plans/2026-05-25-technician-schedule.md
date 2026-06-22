# 技師行程日曆 (Technician Schedule) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a mobile-first "我的行程" page where technicians can see their own assigned work orders grouped by date, mark them in-progress / completed, add completion notes, and upload completion photos; plus a one-tap "查看路線" link that opens Google Maps with all that day's addresses as multi-stop waypoints.

**Architecture:** Utility functions (date grouping, Maps URL, technician PATCH validation) live in a new `src/lib/schedule-utils.ts` so they can be unit-tested without importing server-only modules. The existing PATCH route is extended to allow technicians to update a restricted field set (`status`, `completionNotes`, `completionPhotos`, `completedDate`). The new page re-uses the existing `useAfterSales` hook and filters client-side by `assignedTo === user.displayName`.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, shadcn/ui (Button, Textarea), Cloudinary (`/api/upload` already accessible to technicians), Vitest for tests.

---

## File Structure

**New files:**
- `src/lib/schedule-utils.ts` — pure utility functions (no server-only)
- `src/__tests__/my-schedule-utils.test.ts` — Vitest unit tests
- `src/app/my-schedule/page.tsx` — thin server component wrapper
- `src/app/my-schedule/MyScheduleClient.tsx` — full mobile-first client component

**Modified files:**
- `src/app/api/sheets/after-sales/[serviceId]/route.ts` — allow technician restricted PATCH
- `src/middleware.ts` — add `/my-schedule` to `TECHNICIAN_ALLOWED_PREFIXES`
- `src/lib/auth.ts` — add `/my-schedule` to `TECHNICIAN_ALLOWED_PREFIXES`
- `src/components/layout/nav-links.ts` — add "我的行程" nav entry

---

## Task 1: Utility functions + tests

**Files:**
- Create: `src/lib/schedule-utils.ts`
- Create: `src/__tests__/my-schedule-utils.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/my-schedule-utils.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  filterTechnicianPatch,
  groupByDate,
  sortDateGroups,
  buildMapsUrl,
} from "@/lib/schedule-utils";
import type { AfterSalesService } from "@/lib/types";

const base: AfterSalesService = {
  serviceId: "AS-20260525-01",
  receivedDate: "2026-05-25",
  relatedOrderNo: "",
  shipmentDate: "",
  clientName: "測試客戶",
  clientPhone: "",
  clientContact2: "",
  clientPhone2: "",
  deliveryAddress: "台北市信義區信義路五段7號",
  modelCode: "",
  modelNameSnapshot: "",
  issueDescription: "",
  issuePhotos: [],
  status: "scheduled",
  assignedTo: "師父A",
  scheduledDate: "2026-05-26",
  dispatchNotes: "",
  completedDate: "",
  completionNotes: "",
  completionPhotos: [],
  createdAt: "",
  updatedAt: "",
  createdBy: "",
};

describe("filterTechnicianPatch", () => {
  it("allows status=in_progress", () => {
    expect(filterTechnicianPatch({ status: "in_progress" })).toEqual({ ok: true });
  });

  it("allows all completion fields together", () => {
    expect(
      filterTechnicianPatch({
        status: "completed",
        completionNotes: "固定好了",
        completedDate: "2026-05-25",
        completionPhotos: [],
      }),
    ).toEqual({ ok: true });
  });

  it("rejects a non-allowed field (assignedTo)", () => {
    expect(filterTechnicianPatch({ assignedTo: "other" }).ok).toBe(false);
  });

  it("rejects status=pending", () => {
    expect(filterTechnicianPatch({ status: "pending" }).ok).toBe(false);
  });

  it("rejects status=scheduled", () => {
    expect(filterTechnicianPatch({ status: "scheduled" }).ok).toBe(false);
  });

  it("rejects mix of allowed + forbidden fields", () => {
    expect(filterTechnicianPatch({ status: "completed", clientName: "hack" }).ok).toBe(false);
  });
});

describe("groupByDate", () => {
  it("groups two services on the same date", () => {
    const s1 = { ...base, serviceId: "S1", scheduledDate: "2026-05-26" };
    const s2 = { ...base, serviceId: "S2", scheduledDate: "2026-05-26" };
    const s3 = { ...base, serviceId: "S3", scheduledDate: "2026-05-27" };
    const groups = groupByDate([s1, s2, s3]);
    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.date === "2026-05-26")?.items).toHaveLength(2);
    expect(groups.find((g) => g.date === "2026-05-27")?.items).toHaveLength(1);
  });

  it("excludes services with no scheduledDate", () => {
    expect(groupByDate([{ ...base, scheduledDate: "" }])).toHaveLength(0);
  });
});

describe("sortDateGroups", () => {
  it("puts future dates before past dates", () => {
    const groups = [
      { date: "2024-01-01", items: [] },
      { date: "2099-01-01", items: [] },
    ];
    const sorted = sortDateGroups(groups);
    const futureIdx = sorted.findIndex((g) => g.date === "2099-01-01");
    const pastIdx = sorted.findIndex((g) => g.date === "2024-01-01");
    expect(futureIdx).toBeLessThan(pastIdx);
  });

  it("sorts multiple future dates ascending", () => {
    const groups = [
      { date: "2099-03-01", items: [] },
      { date: "2099-01-01", items: [] },
      { date: "2099-02-01", items: [] },
    ];
    const sorted = sortDateGroups(groups);
    const dates = sorted.map((g) => g.date);
    expect(dates).toEqual(["2099-01-01", "2099-02-01", "2099-03-01"]);
  });

  it("sorts multiple past dates descending", () => {
    const groups = [
      { date: "2020-01-01", items: [] },
      { date: "2022-01-01", items: [] },
      { date: "2021-01-01", items: [] },
    ];
    const sorted = sortDateGroups(groups);
    const dates = sorted.map((g) => g.date);
    expect(dates).toEqual(["2022-01-01", "2021-01-01", "2020-01-01"]);
  });
});

describe("buildMapsUrl", () => {
  it("returns google maps base for empty array", () => {
    expect(buildMapsUrl([])).toBe("https://www.google.com/maps");
  });

  it("builds a dir url for one address", () => {
    const url = buildMapsUrl(["台北市信義區信義路五段7號"]);
    expect(url).toContain("/maps/dir/");
    expect(url).toContain(encodeURIComponent("台北市信義區信義路五段7號"));
  });

  it("encodes all addresses in multi-stop url", () => {
    const url = buildMapsUrl(["地址A", "地址B", "地址C"]);
    expect(url).toContain(encodeURIComponent("地址A"));
    expect(url).toContain(encodeURIComponent("地址B"));
    expect(url).toContain(encodeURIComponent("地址C"));
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價
npx vitest run src/__tests__/my-schedule-utils.test.ts
```

Expected: FAIL with "Cannot find module '@/lib/schedule-utils'"

- [ ] **Step 3: Create `src/lib/schedule-utils.ts`**

```typescript
import type { AfterSalesService } from "@/lib/types";

const TECHNICIAN_WRITABLE = new Set([
  "status",
  "completionNotes",
  "completionPhotos",
  "completedDate",
]);

const TECHNICIAN_ALLOWED_STATUSES = new Set(["in_progress", "completed"]);

/** Returns { ok: true } if body only contains fields a technician may update. */
export function filterTechnicianPatch(
  body: Record<string, unknown>,
): { ok: boolean; error?: string } {
  const forbidden = Object.keys(body).filter((k) => !TECHNICIAN_WRITABLE.has(k));
  if (forbidden.length > 0) {
    return { ok: false, error: `forbidden fields: ${forbidden.join(", ")}` };
  }
  if ("status" in body && !TECHNICIAN_ALLOWED_STATUSES.has(body.status as string)) {
    return { ok: false, error: `forbidden status: ${String(body.status)}` };
  }
  return { ok: true };
}

export interface DateGroup {
  date: string;
  items: AfterSalesService[];
}

/** Groups services by scheduledDate. Excludes services with no scheduledDate. */
export function groupByDate(services: AfterSalesService[]): DateGroup[] {
  const map = new Map<string, AfterSalesService[]>();
  for (const s of services) {
    if (!s.scheduledDate) continue;
    const existing = map.get(s.scheduledDate) ?? [];
    map.set(s.scheduledDate, [...existing, s]);
  }
  return Array.from(map.entries()).map(([date, items]) => ({ date, items }));
}

/**
 * Sorts date groups: today first, then future dates ascending, then past dates descending.
 */
export function sortDateGroups(groups: DateGroup[]): DateGroup[] {
  const today = new Date().toISOString().slice(0, 10);
  const todayGroups = groups.filter((g) => g.date === today);
  const future = groups
    .filter((g) => g.date > today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const past = groups
    .filter((g) => g.date < today)
    .sort((a, b) => b.date.localeCompare(a.date));
  return [...todayGroups, ...future, ...past];
}

/**
 * Builds a Google Maps multi-stop route URL from an array of addresses.
 * Uses /maps/dir/ format — works on mobile without an API key.
 */
export function buildMapsUrl(addresses: string[]): string {
  if (addresses.length === 0) return "https://www.google.com/maps";
  const encoded = addresses.map((a) => encodeURIComponent(a));
  return `https://www.google.com/maps/dir/${encoded.join("/")}`;
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npx vitest run src/__tests__/my-schedule-utils.test.ts
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/schedule-utils.ts src/__tests__/my-schedule-utils.test.ts
git commit -m "feat(schedule): add schedule utility functions with tests"
```

---

## Task 2: Allow technician restricted PATCH

**Files:**
- Modify: `src/app/api/sheets/after-sales/[serviceId]/route.ts`

Currently line 50-53 blocks all technician PATCH requests. Replace that guard so technicians can update only `status` (in_progress or completed), `completionNotes`, `completionPhotos`, and `completedDate`.

- [ ] **Step 1: Modify the PATCH handler**

Open `src/app/api/sheets/after-sales/[serviceId]/route.ts`.

Replace the current technician guard:
```typescript
// REMOVE this block:
if (session.role === "technician") {
  return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
}
```

With the import and restricted-field check. The full updated PATCH function should be:

```typescript
import { filterTechnicianPatch } from "@/lib/schedule-utils";

// ... (keep existing imports, getSession, RouteContext, GET handler unchanged)

export async function PATCH(request: Request, context: RouteContext) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  }
  const { serviceId } = await context.params;

  interface PatchBody {
    receivedDate?: string;
    relatedOrderNo?: string;
    shipmentDate?: string;
    clientName?: string;
    clientPhone?: string;
    clientContact2?: string;
    clientPhone2?: string;
    deliveryAddress?: string;
    modelCode?: string;
    modelNameSnapshot?: string;
    issueDescription?: string;
    issuePhotos?: string[];
    status?: AfterSalesStatus;
    assignedTo?: string;
    scheduledDate?: string;
    dispatchNotes?: string;
    completedDate?: string;
    completionNotes?: string;
    completionPhotos?: string[];
    customerSignature?: string;
    customerSignedAt?: string;
    serviceType?: AfterSalesServiceType;
    outsourcedVendor?: string;
    outsourcedNote?: string;
    itemLocation?: string;
    itemDescription?: string;
    issueCategories?: string[];
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  if (session.role === "technician") {
    const check = filterTechnicianPatch(body as Record<string, unknown>);
    if (!check.ok) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
  }

  try {
    const service = await updateService(serviceId, body);
    if (!service) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, service });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "儲存失敗";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors (if errors appear, fix them before continuing)

- [ ] **Step 3: Commit**

```bash
git add src/app/api/sheets/after-sales/\[serviceId\]/route.ts
git commit -m "feat(schedule): allow technician to PATCH completion fields only"
```

---

## Task 3: Auth whitelist + nav link

**Files:**
- Modify: `src/middleware.ts`
- Modify: `src/lib/auth.ts`
- Modify: `src/components/layout/nav-links.ts`

- [ ] **Step 1: Add `/my-schedule` to middleware allowlist**

In `src/middleware.ts`, the `TECHNICIAN_ALLOWED_PREFIXES` array (around line 35) currently has `"/calendar"` and `"/inventory"`. Add `"/my-schedule"` to the same array:

```typescript
const TECHNICIAN_ALLOWED_PREFIXES = [
  "/after-sales",
  "/api/auth",
  "/api/sheets/after-sales",
  "/api/sheets/equipment",
  "/api/sheets/cases",
  "/api/sheets/versions",
  "/api/sheets/inventory",
  "/api/sheets/products",
  "/api/sheets/suppliers",
  "/api/upload",
  "/login",
  "/calendar",
  "/inventory",
  "/my-schedule",   // ← add this line
];
```

- [ ] **Step 2: Add `/my-schedule` to auth.ts allowlist**

In `src/lib/auth.ts`, the `TECHNICIAN_ALLOWED_PREFIXES` array (around line 215). Add `"/my-schedule"`:

```typescript
export const TECHNICIAN_ALLOWED_PREFIXES = [
  "/after-sales",
  "/my-schedule",   // ← add this line
  "/api/auth",
  "/api/sheets/after-sales",
  "/api/sheets/equipment",
  "/api/upload",
  "/login",
  "/_next",
  "/logo.png",
  "/favicon.ico",
];
```

- [ ] **Step 3: Add nav link**

In `src/components/layout/nav-links.ts`, add the `CalendarCheck2` import and the new nav entry.

Add to the imports:
```typescript
import {
  Archive,
  BarChart3,
  Briefcase,
  Calculator,
  Calendar,
  CalendarCheck2,   // ← add
  CircleHelp,
  FileText,
  HandCoins,
  Package,
  ReceiptText,
  Ruler,
  Settings,
  ShoppingCart,
  Stethoscope,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
```

Add the new link in the `navLinks` array, after the `/after-sales` entry (same `"operations"` group):

```typescript
{ href: "/after-sales", label: "售後服務", icon: Stethoscope, roles: ["admin", "technician"], group: "operations" },
{ href: "/my-schedule", label: "我的行程", icon: CalendarCheck2, roles: ["admin", "technician"], group: "operations" },  // ← add
```

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/middleware.ts src/lib/auth.ts src/components/layout/nav-links.ts
git commit -m "feat(schedule): add /my-schedule to auth whitelist and nav"
```

---

## Task 4: Create MyScheduleClient — full mobile-first view

**Files:**
- Create: `src/app/my-schedule/page.tsx`
- Create: `src/app/my-schedule/MyScheduleClient.tsx`

This component:
1. Loads all services via `useAfterSales()`, filters by `assignedTo === user.displayName`
2. Groups by `scheduledDate`, sorted today → future → past
3. For each date: header, "查看路線" button (Google Maps multi-stop), work order cards
4. Each card: client name + tappable phone, tappable address, model, issue description, issue categories, dispatch notes, action buttons
5. "開始維修" button: PATCHes `status: "in_progress"` immediately
6. "完成維修" button: opens a bottom-sheet modal
7. Modal: completion notes textarea, photo upload (camera capture on mobile), confirm button

- [ ] **Step 1: Create `src/app/my-schedule/page.tsx`**

```typescript
import { MyScheduleClient } from "@/app/my-schedule/MyScheduleClient";

export const metadata = {
  title: "我的行程 | 馬鈴薯沙發營運系統",
};

export default function MySchedulePage() {
  return <MyScheduleClient />;
}
```

- [ ] **Step 2: Create `src/app/my-schedule/MyScheduleClient.tsx`**

```typescript
"use client";

import { useMemo, useRef, useState } from "react";
import { CheckCircle2, Loader2, MapPin, Phone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAfterSales } from "@/hooks/useAfterSales";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { buildMapsUrl, groupByDate, sortDateGroups } from "@/lib/schedule-utils";
import type { AfterSalesService, AfterSalesStatus } from "@/lib/types";

const STATUS_LABEL: Record<AfterSalesStatus, string> = {
  pending: "待確認",
  scheduled: "已排程",
  in_progress: "維修中",
  completed: "已完成",
  cancelled: "取消",
};

const STATUS_COLOR: Record<AfterSalesStatus, string> = {
  pending: "bg-gray-100 text-gray-700",
  scheduled: "bg-blue-100 text-blue-700",
  in_progress: "bg-amber-100 text-amber-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

function formatDate(date: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  if (date === today) return `今天 ${date}`;
  if (date === tomorrow) return `明天 ${date}`;
  return date;
}

interface CompletionState {
  serviceId: string;
  notes: string;
  photos: string[];
  uploading: boolean;
  saving: boolean;
}

export function MyScheduleClient() {
  const { user } = useCurrentUser();
  const { services, loading, error, reload } = useAfterSales();
  const [startingId, setStartingId] = useState<string | null>(null);
  const [completion, setCompletion] = useState<CompletionState | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const myName = user?.displayName ?? "";

  const myServices = useMemo(
    () => services.filter((s) => s.assignedTo === myName && s.status !== "cancelled"),
    [services, myName],
  );

  const dateGroups = useMemo(
    () => sortDateGroups(groupByDate(myServices)),
    [myServices],
  );

  async function handleStart(serviceId: string) {
    setStartingId(serviceId);
    try {
      await fetch(`/api/sheets/after-sales/${serviceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "in_progress" }),
      });
      reload();
    } finally {
      setStartingId(null);
    }
  }

  function openCompletion(serviceId: string) {
    setCompletion({ serviceId, notes: "", photos: [], uploading: false, saving: false });
  }

  async function handlePhotoFiles(files: FileList) {
    if (!completion) return;
    setCompletion((prev) => prev && { ...prev, uploading: true });
    const uploaded: string[] = [];
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const json = (await res.json()) as { ok: boolean; url?: string };
      if (json.ok && json.url) uploaded.push(json.url);
    }
    setCompletion((prev) =>
      prev ? { ...prev, uploading: false, photos: [...prev.photos, ...uploaded] } : null,
    );
  }

  async function handleConfirmComplete() {
    if (!completion) return;
    setCompletion((prev) => prev && { ...prev, saving: true });
    const today = new Date().toISOString().slice(0, 10);
    await fetch(`/api/sheets/after-sales/${completion.serviceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "completed",
        completionNotes: completion.notes,
        completionPhotos: completion.photos,
        completedDate: today,
      }),
    });
    setCompletion(null);
    reload();
  }

  if (!myName || loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--text-secondary)]" />
      </div>
    );
  }

  if (error) {
    return <div className="p-6 text-center text-red-600">{error}</div>;
  }

  if (myServices.length === 0) {
    return (
      <div className="p-8 text-center text-[var(--text-secondary)]">目前沒有派工給您的行程</div>
    );
  }

  const completionService = completion
    ? services.find((s) => s.serviceId === completion.serviceId)
    : null;

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <h1 className="mb-5 text-xl font-semibold text-[var(--text-primary)]">我的行程</h1>

      {dateGroups.map(({ date, items }) => {
        const addresses = items.map((s) => s.deliveryAddress).filter(Boolean);
        return (
          <section key={date} className="mb-7">
            {/* Date header */}
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[var(--text-secondary)]">
                {formatDate(date)}
                <span className="ml-2 text-xs font-normal opacity-70">{items.length} 個工單</span>
              </h2>
              {addresses.length > 1 && (
                <a
                  href={buildMapsUrl(addresses)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-blue-600 underline"
                >
                  <MapPin className="h-3 w-3" />
                  查看路線
                </a>
              )}
            </div>

            {/* Work order cards */}
            <div className="space-y-3">
              {items.map((s) => (
                <ServiceCard
                  key={s.serviceId}
                  service={s}
                  startingId={startingId}
                  onStart={handleStart}
                  onComplete={openCompletion}
                />
              ))}
            </div>
          </section>
        );
      })}

      {/* Completion bottom-sheet modal */}
      {completion && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
          onClick={() => !completion.saving && setCompletion(null)}
        >
          <div
            className="w-full max-w-lg rounded-t-2xl bg-white p-5 pb-8 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-4 font-semibold text-[var(--text-primary)]">
              完工確認
              {completionService ? ` — ${completionService.clientName}` : ""}
            </h3>

            <Textarea
              placeholder="維修說明（選填）"
              value={completion.notes}
              onChange={(e) =>
                setCompletion((prev) => prev && { ...prev, notes: e.target.value })
              }
              rows={3}
              className="mb-4"
            />

            {/* Photo upload */}
            <div className="mb-4">
              <p className="mb-1.5 text-xs text-[var(--text-secondary)]">完工照片（選填）</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                capture="environment"
                className="hidden"
                disabled={completion.uploading}
                onChange={(e) => e.target.files && void handlePhotoFiles(e.target.files)}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={completion.uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {completion.uploading ? (
                  <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />上傳中…</>
                ) : (
                  "拍照 / 選擇照片"
                )}
              </Button>
              {completion.photos.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {completion.photos.map((url) => (
                    <img
                      key={url}
                      src={url}
                      alt="完工照片"
                      className="h-16 w-16 rounded-lg object-cover"
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                disabled={completion.saving}
                onClick={() => setCompletion(null)}
              >
                取消
              </Button>
              <Button
                className="flex-1"
                disabled={completion.saving || completion.uploading}
                onClick={() => void handleConfirmComplete()}
              >
                {completion.saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "確認完工"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface ServiceCardProps {
  service: AfterSalesService;
  startingId: string | null;
  onStart: (id: string) => void;
  onComplete: (id: string) => void;
}

function ServiceCard({ service, startingId, onStart, onComplete }: ServiceCardProps) {
  const { status } = service;
  const isCompleted = status === "completed";
  const isStarting = startingId === service.serviceId;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
      {/* Name + phone + status badge */}
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="font-semibold text-[var(--text-primary)]">{service.clientName}</span>
          {service.clientPhone && (
            <a
              href={`tel:${service.clientPhone}`}
              className="ml-2 inline-flex items-center gap-0.5 text-sm text-blue-600"
            >
              <Phone className="h-3 w-3" />
              {service.clientPhone}
            </a>
          )}
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOR[status]}`}
        >
          {STATUS_LABEL[status]}
        </span>
      </div>

      {/* Address (tappable → single-address Maps) */}
      {service.deliveryAddress && (
        <a
          href={`https://www.google.com/maps/search/${encodeURIComponent(service.deliveryAddress)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-2 flex items-start gap-1 text-sm text-blue-600"
        >
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="leading-snug">{service.deliveryAddress}</span>
        </a>
      )}

      {/* Model */}
      {service.modelNameSnapshot && (
        <p className="mb-1 text-sm text-[var(--text-secondary)]">{service.modelNameSnapshot}</p>
      )}

      {/* Issue description */}
      {service.issueDescription && (
        <p className="mb-2 line-clamp-3 text-sm text-[var(--text-primary)]">
          {service.issueDescription}
        </p>
      )}

      {/* Issue category chips */}
      {(service.issueCategories ?? []).length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {service.issueCategories!.map((cat) => (
            <span
              key={cat}
              className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] text-orange-700"
            >
              {cat}
            </span>
          ))}
        </div>
      )}

      {/* Dispatch notes from admin */}
      {service.dispatchNotes && (
        <p className="mb-2 rounded-lg bg-blue-50 px-3 py-1.5 text-xs text-blue-700">
          📋 {service.dispatchNotes}
        </p>
      )}

      {/* Actions */}
      {!isCompleted && (
        <div className="mt-3 flex gap-2">
          {status === "scheduled" && (
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              disabled={isStarting}
              onClick={() => onStart(service.serviceId)}
            >
              {isStarting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "開始維修"}
            </Button>
          )}
          {(status === "scheduled" || status === "in_progress") && (
            <Button
              size="sm"
              className="flex-1"
              onClick={() => onComplete(service.serviceId)}
            >
              完成維修
            </Button>
          )}
        </div>
      )}

      {/* Completed indicator */}
      {isCompleted && (
        <div className="mt-2 flex items-center gap-1 text-xs text-green-600">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {service.completedDate ? `完工：${service.completedDate}` : "已完成"}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Run all tests**

```bash
npx vitest run
```

Expected: all tests pass (including the new `my-schedule-utils.test.ts`)

- [ ] **Step 5: Commit**

```bash
git add src/app/my-schedule/page.tsx src/app/my-schedule/MyScheduleClient.tsx
git commit -m "feat(schedule): add mobile-first technician schedule page with completion modal"
```

---

## Self-Review

### Spec coverage

| Requirement | Task |
|---|---|
| Mobile-first schedule view | Task 4 — `MyScheduleClient` max-w-lg, full-bleed cards |
| Show own assigned work orders | Task 4 — filter by `assignedTo === user.displayName` |
| Group by date | Task 1 — `groupByDate` + `sortDateGroups` |
| Today → future → past ordering | Task 1 — `sortDateGroups` |
| Clickable phone number | Task 4 — `<a href="tel:...">` |
| Clickable address → Google Maps | Task 4 — `maps/search/` link |
| "查看路線" multi-stop Maps link | Task 1 — `buildMapsUrl`, Task 4 — renders per date group |
| "開始維修" → in_progress | Task 4 — `handleStart` PATCH |
| "完成維修" modal | Task 4 — `CompletionState` + bottom-sheet |
| Completion notes textarea | Task 4 — `<Textarea>` in modal |
| Photo upload (camera on mobile) | Task 4 — `capture="environment"`, `/api/upload` |
| Technician PATCH allowed | Task 2 — `filterTechnicianPatch` in route |
| Auth whitelist | Task 3 — middleware + auth.ts |
| Nav link | Task 3 — nav-links.ts |

### Placeholder scan

No TBDs, no "add appropriate X" patterns. All code blocks are complete and runnable.

### Type consistency

- `AfterSalesService` from `@/lib/types` — same shape in all tasks
- `DateGroup` exported from `schedule-utils.ts` and used consistently
- `filterTechnicianPatch` accepts `Record<string, unknown>` — the route casts `body` to this before calling (safe)
- `buildMapsUrl` returns `string` — used directly in `href`
- `CompletionState.photos: string[]` — matches `completionPhotos: string[]` in the PATCH body
