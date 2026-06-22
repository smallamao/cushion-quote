# Issue Category Tags (問題分類標籤) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-select issue category tags to each after-sales work order so operators can classify problem types (皮革損壞, 五金件, etc.) and filter the list by category to identify quality hotspots over time.

**Architecture:** Add an `issueCategories: string[]` field to `AfterSalesService`, stored as a JSON array in a new Google Sheets column AE (index 30). The predefined tag list is a readonly constant exported from `types.ts`. Tags are toggled in the editor with pill buttons; the list page gains a category filter row and displays the tags inline on each row.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, Google Sheets API (via `after-sales-sheet.ts`), Vitest for tests.

---

## File Map

| File | Change |
|------|--------|
| `src/lib/types.ts` | Add `ISSUE_CATEGORIES` constant + `issueCategories?: string[]` to `AfterSalesService` |
| `src/lib/after-sales-sheet.ts` | Extend ranges to `A:AE`, update `rowToService` index 30, `serviceToRow` index 30, range literals in create/update |
| `src/app/api/sheets/after-sales/[serviceId]/route.ts` | Add `issueCategories?: string[]` to `PatchBody` |
| `src/app/api/sheets/after-sales/route.ts` | Add `issueCategories?: string[]` to `CreateBody`; pass to `createService` |
| `src/app/after-sales/AfterSalesEditorClient.tsx` | Import constant; update `emptyDraft()`, edit-mode load, and add tag selector UI after `issueDescription` |
| `src/app/after-sales/AfterSalesListClient.tsx` | Import constant; add `issueCategoryFilter` state, filter logic, filter buttons row, tag chips in table and mobile cards |
| `src/__tests__/after-sales-categories.test.ts` | **Create** — tests for `ISSUE_CATEGORIES` constant invariants |

---

### Task 1: Extend the type, sheet mapping, and API routes

**Files:**
- Modify: `src/lib/types.ts:112–166`
- Modify: `src/lib/after-sales-sheet.ts:12–99` and `:180–215`
- Modify: `src/app/api/sheets/after-sales/[serviceId]/route.ts:55–82`
- Modify: `src/app/api/sheets/after-sales/route.ts:34–98`
- Create: `src/__tests__/after-sales-categories.test.ts`

- [ ] **Step 1: Write the failing test first**

Create `src/__tests__/after-sales-categories.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { ISSUE_CATEGORIES } from "@/lib/types";

describe("ISSUE_CATEGORIES", () => {
  it("has at least 5 entries", () => {
    expect(ISSUE_CATEGORIES.length).toBeGreaterThanOrEqual(5);
  });

  it("ends with 其他", () => {
    expect(ISSUE_CATEGORIES[ISSUE_CATEGORIES.length - 1]).toBe("其他");
  });

  it("has no duplicate values", () => {
    const unique = new Set(ISSUE_CATEGORIES);
    expect(unique.size).toBe(ISSUE_CATEGORIES.length);
  });

  it("contains the core category names", () => {
    const set = new Set(ISSUE_CATEGORIES);
    expect(set.has("皮革損壞")).toBe(true);
    expect(set.has("骨架/木框")).toBe(true);
    expect(set.has("五金件")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價
npx vitest run src/__tests__/after-sales-categories.test.ts
```

Expected: FAIL — `ISSUE_CATEGORIES` not exported from `@/lib/types`

- [ ] **Step 3: Add `ISSUE_CATEGORIES` constant and `issueCategories` field to `src/lib/types.ts`**

In `src/lib/types.ts`, add the constant **before** the `AfterSalesService` interface (around line 112), and add the field inside the interface:

```typescript
// Add before AfterSalesService interface:
export const ISSUE_CATEGORIES = [
  "皮革損壞",
  "布料問題",
  "骨架/木框",
  "五金件",
  "電動功能",
  "填充物",
  "縫線/車縫",
  "其他",
] as const;

// Inside AfterSalesService interface, after itemDescription?:
  issueCategories?: string[];
```

The full `AfterSalesService` interface after the edit should look like:

```typescript
export const ISSUE_CATEGORIES = [
  "皮革損壞",
  "布料問題",
  "骨架/木框",
  "五金件",
  "電動功能",
  "填充物",
  "縫線/車縫",
  "其他",
] as const;

export interface AfterSalesService {
  serviceId: string;
  receivedDate: string;
  relatedOrderNo: string;
  shipmentDate: string;
  clientName: string;
  clientPhone: string;
  clientContact2: string;
  clientPhone2: string;
  deliveryAddress: string;
  modelCode: string;
  modelNameSnapshot: string;
  issueDescription: string;
  issuePhotos: string[];
  status: AfterSalesStatus;
  assignedTo: string;
  scheduledDate: string;
  dispatchNotes: string;
  completedDate: string;
  completionNotes: string;
  completionPhotos: string[];
  customerSignature?: string;
  customerSignedAt?: string;
  serviceType?: AfterSalesServiceType;
  outsourcedVendor?: string;
  outsourcedNote?: string;
  itemLocation?: string;
  itemDescription?: string;
  issueCategories?: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/__tests__/after-sales-categories.test.ts
```

Expected: PASS — all 4 tests green

- [ ] **Step 5: Extend sheet mapping in `src/lib/after-sales-sheet.ts`**

**5a — Update range constants** (lines 12–13):

```typescript
const MAIN_RANGE_FULL = `${MAIN_SHEET}!A:AE`;
const MAIN_RANGE_DATA = `${MAIN_SHEET}!A2:AE`;
```

**5b — Add `issueCategories` to `rowToService`** (after `itemDescription: row[29]`):

```typescript
function rowToService(row: string[]): AfterSalesService {
  return {
    serviceId: row[0] ?? "",
    receivedDate: row[1] ?? "",
    relatedOrderNo: row[2] ?? "",
    shipmentDate: row[3] ?? "",
    clientName: row[4] ?? "",
    clientPhone: row[5] ?? "",
    clientContact2: row[6] ?? "",
    clientPhone2: row[7] ?? "",
    deliveryAddress: row[8] ?? "",
    modelCode: row[9] ?? "",
    modelNameSnapshot: row[10] ?? "",
    issueDescription: row[11] ?? "",
    issuePhotos: parseJsonArray(row[12]),
    status: (row[13] as AfterSalesStatus) || "pending",
    assignedTo: row[14] ?? "",
    scheduledDate: row[15] ?? "",
    dispatchNotes: row[16] ?? "",
    completedDate: row[17] ?? "",
    completionNotes: row[18] ?? "",
    completionPhotos: parseJsonArray(row[19]),
    customerSignature: row[23] || undefined,
    customerSignedAt: row[24] || undefined,
    serviceType: (row[25] as AfterSalesServiceType) || undefined,
    outsourcedVendor: row[26] || undefined,
    outsourcedNote: row[27] || undefined,
    itemLocation: row[28] || undefined,
    itemDescription: row[29] || undefined,
    issueCategories: parseJsonArray(row[30]),
    createdAt: row[20] ?? "",
    updatedAt: row[21] ?? "",
    createdBy: row[22] ?? "",
  };
}
```

**5c — Add `issueCategories` to `serviceToRow`** (append as the last element, index 30):

```typescript
function serviceToRow(s: AfterSalesService): string[] {
  return [
    s.serviceId,
    s.receivedDate,
    s.relatedOrderNo,
    s.shipmentDate,
    s.clientName,
    s.clientPhone,
    s.clientContact2,
    s.clientPhone2,
    s.deliveryAddress,
    s.modelCode,
    s.modelNameSnapshot,
    s.issueDescription,
    JSON.stringify(s.issuePhotos),
    s.status,
    s.assignedTo,
    s.scheduledDate,
    s.dispatchNotes,
    s.completedDate,
    s.completionNotes,
    JSON.stringify(s.completionPhotos),
    s.createdAt,
    s.updatedAt,
    s.createdBy,
    s.customerSignature ?? "",
    s.customerSignedAt ?? "",
    s.serviceType ?? "",
    s.outsourcedVendor ?? "",
    s.outsourcedNote ?? "",
    s.itemLocation ?? "",
    s.itemDescription ?? "",
    JSON.stringify(s.issueCategories ?? []),
  ];
}
```

**5d — Update range literals in `createService` and `updateService`**

In `createService` (around line 184), change:
```typescript
range: `${MAIN_SHEET}!A${nextRow}:AD${nextRow}`,
```
to:
```typescript
range: `${MAIN_SHEET}!A${nextRow}:AE${nextRow}`,
```

In `updateService` (around line 215), change:
```typescript
range: `${MAIN_SHEET}!A${sheetRow}:AD${sheetRow}`,
```
to:
```typescript
range: `${MAIN_SHEET}!A${sheetRow}:AE${sheetRow}`,
```

- [ ] **Step 6: Add `issueCategories` to API route bodies**

In `src/app/api/sheets/after-sales/[serviceId]/route.ts`, add to the `PatchBody` interface (around line 75, after `itemDescription?`):

```typescript
    issueCategories?: string[];
```

In `src/app/api/sheets/after-sales/route.ts`, add to the `CreateBody` interface (around line 58, after `itemDescription?`):

```typescript
    issueCategories?: string[];
```

And in the `createService` call (around line 96, after `itemDescription`), add:

```typescript
        issueCategories: body.issueCategories ?? [],
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add src/lib/types.ts src/lib/after-sales-sheet.ts \
  src/app/api/sheets/after-sales/route.ts \
  src/app/api/sheets/after-sales/\[serviceId\]/route.ts \
  src/__tests__/after-sales-categories.test.ts
git commit -m "feat(after-sales): add issueCategories field — type, sheet column AE, API routes"
```

---

### Task 2: Add multi-select tag UI in the editor

**Files:**
- Modify: `src/app/after-sales/AfterSalesEditorClient.tsx`

Context: The editor has a `DraftService` type (an Omit of `AfterSalesService`) so `issueCategories` is already present after Task 1. The form is in `AfterSalesEditorClient` inside a section called `客戶報修資訊`. The tag selector goes after the `issueDescription` textarea and before the 問題照片 block.

- [ ] **Step 1: Update `emptyDraft()` to include `issueCategories: []`**

In `src/app/after-sales/AfterSalesEditorClient.tsx`, find the `emptyDraft()` function and add the new field:

```typescript
function emptyDraft(): DraftService {
  const today = new Date().toISOString().slice(0, 10);
  return {
    receivedDate: today,
    relatedOrderNo: "",
    shipmentDate: "",
    clientName: "",
    clientPhone: "",
    clientContact2: "",
    clientPhone2: "",
    deliveryAddress: "",
    modelCode: "",
    modelNameSnapshot: "",
    issueDescription: "",
    issuePhotos: [],
    status: "pending",
    assignedTo: "",
    scheduledDate: "",
    dispatchNotes: "",
    completedDate: "",
    completionNotes: "",
    completionPhotos: [],
    customerSignature: "",
    customerSignedAt: "",
    serviceType: "client" as AfterSalesServiceType,
    issueCategories: [],
  };
}
```

- [ ] **Step 2: Update edit-mode data load to map `issueCategories`**

In the `useEffect` that loads edit-mode data (around line 262), find the `setDraft({...})` call and add after `serviceType`:

```typescript
    issueCategories: service.issueCategories ?? [],
```

The relevant section should look like:

```typescript
        setDraft({
          receivedDate: service.receivedDate,
          relatedOrderNo: service.relatedOrderNo,
          shipmentDate: service.shipmentDate,
          clientName: service.clientName,
          clientPhone: service.clientPhone,
          clientContact2: service.clientContact2,
          clientPhone2: service.clientPhone2,
          deliveryAddress: service.deliveryAddress,
          modelCode: service.modelCode,
          modelNameSnapshot: service.modelNameSnapshot,
          issueDescription: service.issueDescription,
          issuePhotos: service.issuePhotos ?? [],
          status: service.status,
          assignedTo: service.assignedTo,
          scheduledDate: service.scheduledDate,
          dispatchNotes: service.dispatchNotes,
          completedDate: service.completedDate,
          completionNotes: service.completionNotes,
          completionPhotos: service.completionPhotos ?? [],
          customerSignature: service.customerSignature ?? "",
          customerSignedAt: service.customerSignedAt ?? "",
          serviceType: service.serviceType ?? "client",
          outsourcedVendor: service.outsourcedVendor ?? "",
          outsourcedNote: service.outsourcedNote ?? "",
          itemLocation: service.itemLocation ?? "",
          itemDescription: service.itemDescription ?? "",
          issueCategories: service.issueCategories ?? [],
        });
```

- [ ] **Step 3: Add the `ISSUE_CATEGORIES` import**

At the top of `AfterSalesEditorClient.tsx`, update the import from `@/lib/types`:

```typescript
import type {
  AfterSalesReply,
  AfterSalesService,
  AfterSalesServiceType,
  AfterSalesStatus,
} from "@/lib/types";
import { ISSUE_CATEGORIES } from "@/lib/types";
```

- [ ] **Step 4: Add the tag selector UI**

In the JSX, find the `issueDescription` textarea block (around line 832). Immediately after the closing `</div>` of the `issueDescription` section and before the `{/* 問題照片 / 影片 */}` comment, add the tag selector:

```tsx
        {/* 問題分類標籤 */}
        <div className="mt-4">
          <Label>問題分類</Label>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {ISSUE_CATEGORIES.map((cat) => {
              const selected = (draft.issueCategories ?? []).includes(cat);
              return (
                <button
                  key={cat}
                  type="button"
                  disabled={readOnly}
                  onClick={() => {
                    const current = draft.issueCategories ?? [];
                    update(
                      "issueCategories",
                      selected
                        ? current.filter((c) => c !== cat)
                        : [...current, cat],
                    );
                  }}
                  className={[
                    "rounded-full px-2.5 py-1 text-xs transition-colors",
                    selected
                      ? "bg-[var(--accent)] text-white"
                      : "bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]",
                    readOnly ? "opacity-50 cursor-not-allowed" : "",
                  ].join(" ")}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </div>
```

- [ ] **Step 5: Verify TypeScript compiles and build passes**

```bash
npx tsc --noEmit && npx next build 2>&1 | tail -10
```

Expected: no TypeScript errors, build succeeds

- [ ] **Step 6: Manual smoke test**

Start the dev server: `npx next dev`

1. Go to `/after-sales/new`
2. Scroll to 問題描述 — you should see 問題分類 tag buttons below it
3. Click 皮革損壞 → it turns orange/accent colour
4. Click it again → it deselects (back to grey)
5. Select 皮革損壞 + 五金件 → both highlighted
6. Fill required fields and click 建立 → confirm it saves without error
7. Open the saved record → both tags should still be selected

- [ ] **Step 7: Commit**

```bash
git add src/app/after-sales/AfterSalesEditorClient.tsx
git commit -m "feat(after-sales): add issue category tag selector in editor"
```

---

### Task 3: Show tags in list and add category filter

**Files:**
- Modify: `src/app/after-sales/AfterSalesListClient.tsx`

Context: The list page has status filter pills and service-type filter pills. We add a third row for category filter. Each list row (both desktop table and mobile card) needs to show the selected tags as small chips. The filter uses single-select (one category at a time, or "全部類型") — multi-select filtering would complicate the URL and add little value initially.

- [ ] **Step 1: Add import and state**

At the top of `AfterSalesListClient.tsx`, add `ISSUE_CATEGORIES` to the import:

```typescript
import type { AfterSalesServiceType, AfterSalesStatus } from "@/lib/types";
import { ISSUE_CATEGORIES } from "@/lib/types";
```

In the component body, after the `typeFilter` state, add:

```typescript
const [categoryFilter, setCategoryFilter] = useState<string | "all">("all");
```

Also add `categoryFilter` to the `useEffect` that resets page to 1:

```typescript
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, typeFilter, categoryFilter]);
```

- [ ] **Step 2: Add category filtering to `filtered` memo**

In the `filtered` useMemo, add a `.filter()` after the type filter:

```typescript
  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return services
      .filter((s) => {
        if (statusFilter === "all") return true;
        if (statusFilter === "pending_scheduled") return s.status === "pending" || s.status === "scheduled";
        return s.status === statusFilter;
      })
      .filter((s) => typeFilter === "all" || (s.serviceType ?? "client") === typeFilter)
      .filter((s) => {
        if (categoryFilter === "all") return true;
        return (s.issueCategories ?? []).includes(categoryFilter);
      })
      .filter((s) => {
        if (!q) return true;
        return (
          s.serviceId.toLowerCase().includes(q) ||
          s.clientName.toLowerCase().includes(q) ||
          s.clientPhone.includes(q) ||
          s.relatedOrderNo.toLowerCase().includes(q) ||
          s.modelCode.toLowerCase().includes(q) ||
          s.modelNameSnapshot.toLowerCase().includes(q) ||
          s.issueDescription.toLowerCase().includes(q) ||
          (s.outsourcedVendor ?? "").toLowerCase().includes(q) ||
          (s.itemDescription ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.serviceId.localeCompare(a.serviceId));
  }, [services, debouncedSearch, statusFilter, typeFilter, categoryFilter]);
```

- [ ] **Step 3: Compute category counts**

After the `statusCounts` useMemo, add:

```typescript
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of services) {
      for (const cat of s.issueCategories ?? []) {
        counts[cat] = (counts[cat] ?? 0) + 1;
      }
    }
    return counts;
  }, [services]);
```

- [ ] **Step 4: Add category filter buttons row**

In the JSX, after the service-type filter `</div>` (the second filter row that ends around line 191), add:

```tsx
        {/* 問題分類篩選 */}
        <div className="flex w-full flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setCategoryFilter("all")}
            className={[
              "inline-flex items-center justify-center gap-1 rounded-full px-3 py-1 text-xs transition-colors",
              categoryFilter === "all"
                ? "bg-[var(--accent)] text-white"
                : "bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]",
            ].join(" ")}
          >
            全部問題類型
          </button>
          {ISSUE_CATEGORIES.filter((cat) => (categoryCounts[cat] ?? 0) > 0).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(categoryFilter === cat ? "all" : cat)}
              className={[
                "inline-flex items-center justify-center gap-1 rounded-full px-3 py-1 text-xs transition-colors",
                categoryFilter === cat
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]",
              ].join(" ")}
            >
              {cat}
              <span className="opacity-70">{categoryCounts[cat]}</span>
            </button>
          ))}
        </div>
```

Note: categories with zero records are hidden (the `.filter((cat) => (categoryCounts[cat] ?? 0) > 0)`) to keep the UI clean at first. Once data accumulates they appear automatically.

- [ ] **Step 5: Show tags in desktop table rows**

In the desktop table, find the `<td>` that shows `issueDescription` (around line 333):

```tsx
                    <td className="px-3 py-2">
                      <div className="max-w-xs truncate text-xs text-[var(--text-secondary)]">
                        {s.issueDescription}
                      </div>
                    </td>
```

Replace it with:

```tsx
                    <td className="px-3 py-2">
                      <div className="max-w-xs truncate text-xs text-[var(--text-secondary)]">
                        {s.issueDescription}
                      </div>
                      {(s.issueCategories ?? []).length > 0 && (
                        <div className="mt-0.5 flex flex-wrap gap-0.5">
                          {(s.issueCategories ?? []).map((cat) => (
                            <span
                              key={cat}
                              className="rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] text-orange-700"
                            >
                              {cat}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
```

- [ ] **Step 6: Show tags in mobile cards**

In the mobile card section, find the block that shows `modelNameSnapshot` and `issueDescription` (around line 246):

```tsx
                {(s.modelNameSnapshot || s.issueDescription) && (
                  <div className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">
                    {s.modelNameSnapshot && (
                      <span>{s.modelNameSnapshot}</span>
                    )}
                    {s.modelNameSnapshot && s.issueDescription && (
                      <span className="mx-1">—</span>
                    )}
                    {s.issueDescription && (
                      <span>{s.issueDescription}</span>
                    )}
                  </div>
                )}
```

Add the category chips **after** this block (before the date/assignedTo footer row):

```tsx
                {(s.issueCategories ?? []).length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-0.5">
                    {(s.issueCategories ?? []).map((cat) => (
                      <span
                        key={cat}
                        className="rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] text-orange-700"
                      >
                        {cat}
                      </span>
                    ))}
                  </div>
                )}
```

- [ ] **Step 7: Verify TypeScript compiles and build passes**

```bash
npx tsc --noEmit && npx next build 2>&1 | tail -10
```

Expected: no TypeScript errors, build succeeds

- [ ] **Step 8: Manual smoke test**

1. Go to `/after-sales` — the third filter row should now show "全部問題類型" (other categories hidden until data exists)
2. Open any work order → add some category tags → save
3. Return to the list → the tags now appear as orange chips in the row
4. Click the category filter pill → list filters to only those with that category
5. Click the same pill again → deselects, shows all
6. Run the test suite to confirm nothing broke:

```bash
npx vitest run
```

Expected: all tests pass

- [ ] **Step 9: Commit**

```bash
git add src/app/after-sales/AfterSalesListClient.tsx
git commit -m "feat(after-sales): show issue category chips in list and add category filter"
```

---

## Self-Review

**Spec coverage:**
- ✅ 多選標籤：皮革損壞、布料問題、骨架/木框、五金件、電動功能、填充物、縫線/車縫、其他
- ✅ 工單編輯頁 tag selector (Task 2)
- ✅ 列表篩選 (Task 3)
- ✅ 列表顯示 tags (Task 3)
- ✅ 長期統計基礎：count badges on filter pills; data is in Sheets for future export

**Backwards compatibility:**
- Old rows without column AE: `row[30]` → `undefined` → `parseJsonArray(undefined)` → `[]`. No migration needed.

**Placeholder scan:** None found.

**Type consistency:**
- `issueCategories` is `string[]` (not `IssueCategory[]`) intentionally — keeps the data flexible if tag names are renamed without a migration.
- `ISSUE_CATEGORIES` used as readonly const for UI; stored values are plain strings matching the label.
