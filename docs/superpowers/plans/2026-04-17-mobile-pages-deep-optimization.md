# Mobile Pages Deep Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all 9 main pages fully usable on iPhone (375-430px) by switching data tables to card views and adapting forms/dropdowns for mobile — without changing desktop behavior.

**Architecture:** Each page uses a shared `useIsMobile()` hook to conditionally render mobile card layouts vs desktop table layouts. Complex editors (QuoteEditor, PurchaseEditor) get dedicated mobile card components. Simpler list pages inline the card markup. All changes are CSS/JSX only — no API or data model changes.

**Tech Stack:** Next.js 15, React, Tailwind CSS, Lucide icons, TanStack React Table (desktop only), dnd-kit (desktop only)

**Spec:** `docs/superpowers/specs/2026-04-17-mobile-pages-deep-optimization-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/hooks/useIsMobile.ts` | Create | Shared hook: returns true when viewport ≤768px |
| `src/components/quote-editor/MobileQuoteItemCard.tsx` | Create | Mobile card for a single quote line item |
| `src/components/purchases/MobilePurchaseItemCard.tsx` | Create | Mobile card for a single purchase line item |
| `src/components/quote-editor/QuoteEditor.tsx` | Modify | Conditional mobile/desktop item rendering |
| `src/app/quotes/QuotesClient.tsx` | Modify | Card view for quotes list |
| `src/app/cases/CasesClient.tsx` | Modify | Card view for cases list |
| `src/app/purchases/PurchasesClient.tsx` | Modify | Card view + scrollable status filters |
| `src/app/purchases/PurchaseEditorClient.tsx` | Modify | Mobile form stacking + item cards |
| `src/components/purchases/ProductCombobox.tsx` | Modify | Responsive width + touch-friendly items |
| `src/components/materials/MaterialTable.tsx` | Modify | Card view for materials |
| `src/app/commissions/CommissionsClient.tsx` | Modify | Hide secondary table columns on mobile |
| `src/app/after-sales/AfterSalesListClient.tsx` | Modify | Card view + simplified pagination |

---

### Task 1: Create useIsMobile hook

**Files:**
- Create: `src/hooks/useIsMobile.ts`

- [ ] **Step 1: Create the hook**

Create `src/hooks/useIsMobile.ts`:

```ts
"use client";

import { useEffect, useState } from "react";

const MOBILE_BREAKPOINT = "(max-width: 768px)";

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_BREAKPOINT);
    setIsMobile(mql.matches);

    function handleChange(e: MediaQueryListEvent) {
      setIsMobile(e.matches);
    }

    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, []);

  return isMobile;
}
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價 && npx next build --no-lint 2>&1 | tail -20`

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useIsMobile.ts
git commit -m "feat(hooks): add useIsMobile hook

Returns true when viewport ≤768px. Uses matchMedia for performance
and consistency with CSS breakpoints."
```

---

### Task 2: Create MobileQuoteItemCard

**Files:**
- Create: `src/components/quote-editor/MobileQuoteItemCard.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/quote-editor/MobileQuoteItemCard.tsx`. This component receives the same props as `SortableQuoteItemRow` (defined at QuoteEditor.tsx:280-293) but renders as a card instead of a table row.

Read `src/components/quote-editor/QuoteEditor.tsx` lines 280-293 to see the `SortableQuoteItemRowProps` interface and lines 324-540 to see the current row rendering. Then create the card component that:

1. Renders a `<div>` card with rounded border, padding 14px
2. Top row: item index number on left, notes toggle + delete button on right
3. Full-width textarea for `item.name` (商品名稱)
4. Full-width input for `item.spec` (規格)
5. 3-column grid for `item.qty`, `item.unit` (Select), `item.unitPrice`
6. Bottom row: "小計" label + `formatCurrency(item.amount)`
7. Expandable section (when `expanded` is true): notes textarea, costPerUnit input (if applicable), image upload, spec image upload

The component must import the same UI components used in QuoteEditor: `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem` from `@/components/ui/select`, `Input` from `@/components/ui/input`, and icons from `lucide-react`.

Use the same `UNIT_OPTIONS` array: `["只", "式", "件", "才", "組", "碼", "張", "片"]`. Import it or define locally.

Match the existing design system: `var(--border)`, `var(--radius-md)`, `var(--text-primary)`, `var(--text-tertiary)`, `var(--accent)`, `var(--error)`, `var(--bg-subtle)` CSS variables.

Export the props interface as `MobileQuoteItemCardProps` (same shape as `SortableQuoteItemRowProps` but without `colWidths`).

- [ ] **Step 2: Verify build**

Run: `cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價 && npx next build --no-lint 2>&1 | tail -20`

- [ ] **Step 3: Commit**

```bash
git add src/components/quote-editor/MobileQuoteItemCard.tsx
git commit -m "feat(quote-editor): add MobileQuoteItemCard

Card layout for quote line items on mobile. Full-width fields,
3-col grid for qty/unit/price, expandable notes/images section."
```

---

### Task 3: Wire mobile cards into QuoteEditor

**Files:**
- Modify: `src/components/quote-editor/QuoteEditor.tsx`

- [ ] **Step 1: Add imports and hook**

In `src/components/quote-editor/QuoteEditor.tsx`, add these imports:

```ts
import { useIsMobile } from "@/hooks/useIsMobile";
import { MobileQuoteItemCard } from "@/components/quote-editor/MobileQuoteItemCard";
```

Inside the main `QuoteEditor` function component, add near the top (with other hooks):

```ts
const isMobile = useIsMobile();
```

- [ ] **Step 2: Conditional rendering for items section**

Find the section that renders the items table (the `<div className="overflow-x-auto">` wrapping the `<table>` with `<DndContext>`). Wrap it in a conditional:

- If `isMobile`: render a `<div className="space-y-3">` containing `items.map()` → `<MobileQuoteItemCard>` for each item, plus an "新增品項" button at the bottom.
- If `!isMobile`: render the existing `<DndContext>` + `<table>` code unchanged.

The mobile branch should NOT include DndContext or SortableContext — no drag-and-drop on mobile.

Pass the same props to MobileQuoteItemCard as SortableQuoteItemRow receives, minus `colWidths`.

- [ ] **Step 3: Mobile-friendly button bar**

Find the button bar below the items table (the div with Undo, Redo, Add, Calculator, Templates buttons). Add `md:` responsive classes:

- Button text labels: add `hidden md:inline` to hide text on mobile, keeping only icons
- Or wrap the entire button bar in a scrollable container: `overflow-x-auto flex-nowrap` on mobile

- [ ] **Step 4: Verify build**

Run: `cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價 && npx next build --no-lint 2>&1 | tail -20`

- [ ] **Step 5: Commit**

```bash
git add src/components/quote-editor/QuoteEditor.tsx
git commit -m "feat(quote-editor): mobile card view for line items

Mobile: renders MobileQuoteItemCard per item, no drag-and-drop.
Desktop: unchanged table with DnD. Button bar text hidden on mobile."
```

---

### Task 4: ProductCombobox responsive width

**Files:**
- Modify: `src/components/purchases/ProductCombobox.tsx`

- [ ] **Step 1: Fix dropdown width**

In `src/components/purchases/ProductCombobox.tsx`, line 138, change the dropdown div class:

```tsx
// Before:
className="absolute left-0 top-[calc(100%+2px)] z-50 w-[380px] rounded-md border border-[var(--border)] bg-white shadow-lg"

// After:
className="absolute left-0 top-[calc(100%+2px)] z-50 w-[380px] max-w-[calc(100vw-2rem)] rounded-md border border-[var(--border)] bg-white shadow-lg"
```

- [ ] **Step 2: Increase touch target for result items**

Line 172, change the result button padding:

```tsx
// Before:
className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs ${

// After:
className={`flex w-full items-center gap-2 px-2 py-2.5 text-left text-xs ${
```

- [ ] **Step 3: Verify build**

Run: `cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價 && npx next build --no-lint 2>&1 | tail -20`

- [ ] **Step 4: Commit**

```bash
git add src/components/purchases/ProductCombobox.tsx
git commit -m "feat(combobox): responsive width + larger touch targets

Dropdown max-width capped at viewport. Result item padding increased
from py-1.5 to py-2.5 for better touch targets."
```

---

### Task 5: QuotesClient mobile card view

**Files:**
- Modify: `src/app/quotes/QuotesClient.tsx`

- [ ] **Step 1: Add useIsMobile and build mobile card rendering**

Read `src/app/quotes/QuotesClient.tsx` fully to understand the data shape (`sorted` array items have: `quoteId`, `versionId`, `caseId`, `quoteName`, `clientName`, `contactName`, `createdAt`, `totalAmount`, `versionStatus`).

Add `import { useIsMobile } from "@/hooks/useIsMobile";` and `const isMobile = useIsMobile();` in the component.

Find where the table is rendered (the `<div className="overflow-x-auto">` wrapping the TanStack table). Add a conditional:

If `isMobile`, render a `<div className="space-y-3">` with cards:

```tsx
{sorted.map((row) => {
  const statusInfo = VERSION_STATUS_MAP[row.versionStatus] ?? VERSION_STATUS_MAP.draft;
  return (
    <div key={row.versionId} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-[var(--accent)]">{row.quoteId}</span>
        <span className={`badge ${statusInfo.className}`}>{statusInfo.label}</span>
      </div>
      <div className="mt-2 text-sm font-semibold">{row.clientName || row.contactName} — {row.quoteName}</div>
      <div className="mt-1 text-xs text-[var(--text-tertiary)]">{row.createdAt}</div>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-base font-semibold">{formatCurrency(row.totalAmount)}</span>
        <div className="flex gap-1.5">
          <Button size="icon" variant="outline" onClick={() => openVersion(row.versionId, row.caseId, row.quoteId)} title="編輯">
            <Edit className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="outline" onClick={() => void handleDuplicate(row)} title="複製">
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
})}
```

If `!isMobile`, render the existing TanStack table unchanged.

- [ ] **Step 2: Responsive filter area**

Find the filter section. The date range inputs should stack on mobile:
- Change the container from `flex ... lg:flex-row` to include `flex-col md:flex-row` so it stacks on mobile.
- The search input is already full-width — no change needed.

- [ ] **Step 3: Verify build**

Run: `cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價 && npx next build --no-lint 2>&1 | tail -20`

- [ ] **Step 4: Commit**

```bash
git add src/app/quotes/QuotesClient.tsx
git commit -m "feat(quotes): mobile card view for quote records

Mobile: card layout showing ID, status, client, date, amount.
Desktop: unchanged TanStack resizable table."
```

---

### Task 6: CasesClient mobile card view

**Files:**
- Modify: `src/app/cases/CasesClient.tsx`

- [ ] **Step 1: Understand the data and rendering**

Read `src/app/cases/CasesClient.tsx` fully. Understand the data shape of each case row and the expand/collapse mechanism. Note the main table columns and the expanded detail section.

- [ ] **Step 2: Add mobile card view**

Add `import { useIsMobile } from "@/hooks/useIsMobile";` and `const isMobile = useIsMobile();`.

Find where the main table is rendered. Add a conditional:

If `isMobile`, render cards for each case:
- Card shows: case name + status badge, customer name, lead source, created date, edit button
- Clicking the card toggles expand (reuse the existing expand state)
- Expanded section renders the same detail content but in a mobile-friendly stacked layout (full-width, no nested tables)

If `!isMobile`, render the existing table unchanged.

Key fields to show on cards: `caseName`, `customerName`, `status`, `leadSource` (label only), `createdAt`
Hidden on mobile cards (visible in expanded): `latestSentAt`, `nextFollowUp`, detailed cost breakdown

- [ ] **Step 3: Verify build**

Run: `cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價 && npx next build --no-lint 2>&1 | tail -20`

- [ ] **Step 4: Commit**

```bash
git add src/app/cases/CasesClient.tsx
git commit -m "feat(cases): mobile card view with expandable details

Mobile: card per case with tap-to-expand details.
Desktop: unchanged table with nested expansion."
```

---

### Task 7: PurchasesClient mobile card view

**Files:**
- Modify: `src/app/purchases/PurchasesClient.tsx`

- [ ] **Step 1: Understand the page**

Read `src/app/purchases/PurchasesClient.tsx` fully. Note the status filter buttons and the table structure.

- [ ] **Step 2: Add mobile cards + scrollable filters**

Add `import { useIsMobile } from "@/hooks/useIsMobile";` and `const isMobile = useIsMobile();`.

Status filter buttons: wrap the button container in `overflow-x-auto` and add `flex-nowrap` so pills scroll horizontally instead of wrapping to multiple lines.

Table: add conditional rendering. If `isMobile`, render cards:
- Card shows: order number + status badge, supplier name, date + total amount
- Notes column hidden on mobile
- Card is a clickable link to the purchase detail page

If `!isMobile`, render the existing table unchanged.

- [ ] **Step 3: Verify build**

Run: `cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價 && npx next build --no-lint 2>&1 | tail -20`

- [ ] **Step 4: Commit**

```bash
git add src/app/purchases/PurchasesClient.tsx
git commit -m "feat(purchases): mobile card view + scrollable status filters

Mobile: card layout, horizontal scroll for status pills.
Desktop: unchanged table."
```

---

### Task 8: PurchaseEditorClient mobile layout

**Files:**
- Modify: `src/app/purchases/PurchaseEditorClient.tsx`
- Create: `src/components/purchases/MobilePurchaseItemCard.tsx`

- [ ] **Step 1: Create MobilePurchaseItemCard**

Read `src/app/purchases/PurchaseEditorClient.tsx` fully to understand the line item structure and props. Create `src/components/purchases/MobilePurchaseItemCard.tsx` with a card layout:

- Card shows: item index + delete button, ProductCombobox (full-width), 3-col grid for qty/unit/unitPrice, notes input, subtotal
- Uses the same ProductCombobox, Input, and Select components as the desktop version
- Export a props interface matching what the existing item row receives

- [ ] **Step 2: Wire into PurchaseEditorClient**

Add `import { useIsMobile } from "@/hooks/useIsMobile";` and `const isMobile = useIsMobile();`.

For the supplier info form section: add `grid-cols-1 md:grid-cols-2` (or whatever the current multi-column grid is) to stack fields vertically on mobile.

For the line items table: conditional rendering — mobile renders `MobilePurchaseItemCard` per item, desktop renders existing table.

- [ ] **Step 3: Verify build**

Run: `cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價 && npx next build --no-lint 2>&1 | tail -20`

- [ ] **Step 4: Commit**

```bash
git add src/components/purchases/MobilePurchaseItemCard.tsx src/app/purchases/PurchaseEditorClient.tsx
git commit -m "feat(purchase-editor): mobile card items + stacked form

Mobile: vertical form fields, card per line item.
Desktop: unchanged grid form and item table."
```

---

### Task 9: MaterialTable mobile card view

**Files:**
- Modify: `src/components/materials/MaterialTable.tsx`

- [ ] **Step 1: Add mobile cards**

Read `src/components/materials/MaterialTable.tsx` fully. Add `useIsMobile` hook.

If `isMobile`, render cards per material:
- Card shows: brand/series, color code/name, cost per yard + list price per yard, edit + deactivate buttons
- Category column hidden on mobile

If `!isMobile`, render existing table unchanged.

- [ ] **Step 2: Verify build**

Run: `cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價 && npx next build --no-lint 2>&1 | tail -20`

- [ ] **Step 3: Commit**

```bash
git add src/components/materials/MaterialTable.tsx
git commit -m "feat(materials): mobile card view

Mobile: card per material showing brand, color, prices.
Desktop: unchanged table."
```

---

### Task 10: CommissionsClient column hiding

**Files:**
- Modify: `src/app/commissions/CommissionsClient.tsx`

- [ ] **Step 1: Hide secondary columns on mobile**

Read `src/app/commissions/CommissionsClient.tsx` fully. Add `useIsMobile` hook.

In the settlements table, conditionally hide the "付款日期" (payment date) column on mobile by wrapping the `<th>` and corresponding `<td>` with `{!isMobile && ...}`.

In the reports tab partner table, similarly hide the least critical columns (e.g., pending/paid breakdown) on mobile, showing only partner name + total amount.

- [ ] **Step 2: Verify build**

Run: `cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價 && npx next build --no-lint 2>&1 | tail -20`

- [ ] **Step 3: Commit**

```bash
git add src/app/commissions/CommissionsClient.tsx
git commit -m "feat(commissions): hide secondary table columns on mobile

Mobile: show only key columns (ID, partner, amount, status).
Desktop: all columns visible."
```

---

### Task 11: AfterSalesListClient mobile card view + pagination

**Files:**
- Modify: `src/app/after-sales/AfterSalesListClient.tsx`

- [ ] **Step 1: Understand the page**

Read `src/app/after-sales/AfterSalesListClient.tsx` fully. Note the 8-column table, status filter pills, and pagination component.

- [ ] **Step 2: Add mobile card view**

Add `useIsMobile` hook. Conditional rendering:

If `isMobile`, render cards for each service request:
- Card shows: serviceId + status badge, customer name + phone, model name + issue description (truncated), received date + assigned technician
- Entire card is clickable (uses `router.push`)
- Hidden on mobile: order number column

Status filter pills: same as PurchasesClient — wrap in `overflow-x-auto flex-nowrap`.

- [ ] **Step 3: Simplify pagination on mobile**

In the pagination section:
- Hide "上一頁"/"下一頁" text labels on mobile, show only arrow icons: add `hidden md:inline` to the text spans
- Hide per-page size selector on mobile: wrap with `{!isMobile && ...}`
- Page number display: show compact `{page}/{totalPages}` format on mobile

- [ ] **Step 4: Verify build**

Run: `cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價 && npx next build --no-lint 2>&1 | tail -20`

- [ ] **Step 5: Commit**

```bash
git add src/app/after-sales/AfterSalesListClient.tsx
git commit -m "feat(after-sales): mobile card view + compact pagination

Mobile: card layout, scrollable status pills, icon-only pagination.
Desktop: unchanged table with full pagination."
```

---

### Task 12: Final integration test

**Files:** None (verification only)

- [ ] **Step 1: Full build**

Run: `cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價 && npx next build --no-lint 2>&1 | tail -30`

Expected: Build succeeds.

- [ ] **Step 2: Mobile testing in dev server**

Run: `cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價 && npx next dev`

Chrome DevTools → Device toolbar → iPhone SE (375px):

Checklist per page:
- [ ] **報價編輯器**: items render as cards, qty/unit/price in 3-col grid, notes expandable, add/delete works
- [ ] **報價紀錄**: card list with ID/status/client/amount, filters stack vertically
- [ ] **案件紀錄**: card list with tap-to-expand details
- [ ] **採購單列表**: card list, status pills scroll horizontally
- [ ] **採購單編輯器**: form fields stacked, items as cards, ProductCombobox fits screen
- [ ] **ProductCombobox**: dropdown doesn't overflow, items have adequate touch area
- [ ] **材質資料庫**: card list with brand/color/prices
- [ ] **佣金結算**: table shows key columns only, stats cards unchanged
- [ ] **售後服務**: card list, pagination compact

Desktop verification (1200px+):
- [ ] All pages render exactly as before Phase 2
- [ ] QuoteEditor drag-and-drop works
- [ ] QuotesClient resizable columns work
- [ ] All tables show all columns

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix(responsive): integration test fixes for mobile pages"
```
