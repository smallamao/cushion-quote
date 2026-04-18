# Mobile Shell Responsive UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all pages navigable and operable on iPhone (375-430px) by adding a mobile navigation drawer, responsive header, and global touch-target upgrades — without changing desktop behavior.

**Architecture:** Shell-first approach. Extract shared nav links, add a MobileDrawer component with bottom-sheet pattern, adjust header/button/input sizing via Tailwind responsive classes, and establish a 3-tier breakpoint system (mobile ≤768px / tablet 769-1080px / desktop ≥1081px).

**Tech Stack:** Next.js 15, React, Tailwind CSS, Lucide icons, class-variance-authority (cva)

**Spec:** `docs/superpowers/specs/2026-04-17-mobile-ui-optimization-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/components/layout/nav-links.ts` | Create | Shared nav link definitions + types |
| `src/components/layout/MobileDrawer.tsx` | Create | Mobile bottom-sheet drawer with hamburger trigger |
| `src/components/layout/Sidebar.tsx` | Modify | Import links from shared module |
| `src/app/layout.tsx` | Modify | Add MobileDrawer, responsive header padding |
| `src/components/layout/HeaderUserMenu.tsx` | Modify | Responsive dropdown widths, larger touch targets |
| `src/components/ui/button.tsx` | Modify | Responsive touch sizes |
| `src/components/ui/input.tsx` | Modify | Responsive touch sizes |
| `src/app/globals.css` | Modify | Mobile breakpoint, page-container padding |

---

### Task 1: Extract shared nav links

**Files:**
- Create: `src/components/layout/nav-links.ts`
- Modify: `src/components/layout/Sidebar.tsx:1-46`

- [ ] **Step 1: Create the shared nav-links module**

Create `src/components/layout/nav-links.ts`:

```ts
import {
  BarChart3,
  Briefcase,
  Calculator,
  CircleHelp,
  FileText,
  HandCoins,
  Package,
  Palette,
  Settings,
  ShoppingCart,
  Stethoscope,
} from "lucide-react";

import type { UserRole } from "@/lib/types";

export type NavLinkDef = {
  href: string;
  label: string;
  icon: typeof Calculator;
  roles: UserRole[];
};

export const navLinks: NavLinkDef[] = [
  { href: "/", label: "報價工作台", icon: Calculator, roles: ["admin"] },
  { href: "/cases", label: "案件紀錄", icon: Briefcase, roles: ["admin"] },
  { href: "/materials", label: "材質資料庫", icon: Palette, roles: ["admin"] },
  { href: "/quotes", label: "報價紀錄", icon: FileText, roles: ["admin"] },
  { href: "/commissions", label: "佣金結算", icon: HandCoins, roles: ["admin"] },
  { href: "/purchases", label: "採購單", icon: ShoppingCart, roles: ["admin"] },
  { href: "/purchase-products", label: "採購商品", icon: Package, roles: ["admin"] },
  { href: "/reports", label: "採購報表", icon: BarChart3, roles: ["admin"] },
  { href: "/after-sales", label: "售後服務", icon: Stethoscope, roles: ["admin", "technician"] },
  { href: "/settings", label: "系統設定", icon: Settings, roles: ["admin"] },
  { href: "/help", label: "使用說明", icon: CircleHelp, roles: ["admin"] },
];
```

- [ ] **Step 2: Update Sidebar to import from shared module**

In `src/components/layout/Sidebar.tsx`, replace the icon imports, type definition, and `links` array with:

```ts
// Remove these imports from Sidebar.tsx:
// - All lucide icon imports EXCEPT ChevronLeft, ChevronRight
// - The LinkDef type
// - The links array

// Add this import:
import { navLinks, type NavLinkDef } from "@/components/layout/nav-links";

// Keep these icon imports (used by Sidebar only):
import { ChevronLeft, ChevronRight } from "lucide-react";
```

Then replace all references to `links` with `navLinks` and `LinkDef` with `NavLinkDef`:
- Line 54: `const visibleLinks = user ? navLinks.filter(...)` (was `links.filter(...)`)

- [ ] **Step 3: Verify the app still compiles**

Run: `cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價 && npx next build --no-lint 2>&1 | tail -20`

Expected: Build succeeds, no import errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/nav-links.ts src/components/layout/Sidebar.tsx
git commit -m "refactor(layout): extract nav links to shared module

Prepares for MobileDrawer to reuse the same navigation definitions."
```

---

### Task 2: Add mobile breakpoint and page-container responsive padding

**Files:**
- Modify: `src/app/globals.css:229-235`

- [ ] **Step 1: Replace the existing responsive section**

In `src/app/globals.css`, replace the `/* ===== Responsive ===== */` section (lines 229-235) with:

```css
/* ===== Responsive ===== */

@media (max-width: 768px) {
  .app-shell {
    grid-template-columns: 1fr;
  }

  .sidebar {
    display: none;
  }

  .page-container {
    padding: var(--space-4);
  }
}

@media (min-width: 769px) and (max-width: 1080px) {
  .app-shell {
    grid-template-columns: 56px minmax(0, 1fr);
  }
}
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價 && npx next build --no-lint 2>&1 | tail -20`

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(responsive): add mobile/tablet breakpoints

Mobile (≤768px): hide sidebar, reduce page padding.
Tablet (769-1080px): force sidebar to icon-only 56px."
```

---

### Task 3: Create MobileDrawer component

**Files:**
- Create: `src/components/layout/MobileDrawer.tsx`

- [ ] **Step 1: Create MobileDrawer.tsx**

Create `src/components/layout/MobileDrawer.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import { navLinks } from "@/components/layout/nav-links";

export function MobileDrawer() {
  const pathname = usePathname();
  const { user } = useCurrentUser();
  const [open, setOpen] = useState(false);

  const visibleLinks = user
    ? navLinks.filter((l) => l.roles.includes(user.role))
    : [];

  // Close drawer on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      {/* Hamburger button — visible only on mobile */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mr-3 flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] transition-colors hover:bg-[var(--bg-subtle)] md:hidden"
        aria-label="開啟選單"
      >
        <Menu className="h-5 w-5 text-[var(--text-primary)]" strokeWidth={1.5} />
      </button>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/30 md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Bottom-sheet drawer */}
      <div
        className={[
          "fixed inset-x-0 bottom-0 z-50 transform transition-transform duration-250 ease-out md:hidden",
          open ? "translate-y-0" : "translate-y-full",
        ].join(" ")}
      >
        <div className="rounded-t-2xl bg-[var(--sidebar-bg)] px-3 pb-8 pt-3">
          {/* Drag indicator */}
          <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-white/30" />

          {/* Close button */}
          <div className="mb-3 flex items-center justify-between px-2">
            <span className="text-sm font-semibold text-white">選單</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white/10"
              aria-label="關閉選單"
            >
              <X className="h-4 w-4 text-white" strokeWidth={1.5} />
            </button>
          </div>

          {/* Nav grid — 2 columns */}
          <nav className="grid grid-cols-2 gap-1">
            {visibleLinks.map((link) => {
              const Icon = link.icon;
              const isActive =
                link.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(link.href);

              return (
                <Link
                  key={link.href}
                  href={link.href as never}
                  className={[
                    "flex items-center gap-2.5 rounded-[var(--radius-md)] px-3 py-3 text-[13px] font-medium text-white transition-colors",
                    "hover:bg-white/12",
                    isActive ? "bg-white/18" : "",
                  ].join(" ")}
                >
                  <Icon className="h-4 w-4 shrink-0 text-white" strokeWidth={1.5} />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價 && npx next build --no-lint 2>&1 | tail -20`

Expected: Build succeeds (component not yet mounted).

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/MobileDrawer.tsx
git commit -m "feat(layout): add MobileDrawer bottom-sheet component

Bottom-sheet nav drawer for mobile. 2-column grid, 48px touch targets,
auto-close on navigation. Not yet mounted in layout."
```

---

### Task 4: Mount MobileDrawer in layout and adjust header

**Files:**
- Modify: `src/app/layout.tsx:1-60`

- [ ] **Step 1: Update layout.tsx**

In `src/app/layout.tsx`, add the import:

```ts
import { MobileDrawer } from "@/components/layout/MobileDrawer";
```

Then replace the `<header>` element (line 48) with:

```tsx
<header className="sticky top-0 z-20 flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 md:px-8">
  <div className="flex items-center">
    <MobileDrawer />
    <div className="text-sm font-semibold text-[var(--text-primary)]">
      馬鈴薯沙發
    </div>
  </div>
  <HeaderUserMenu />
</header>
```

Key changes:
- `px-8` → `px-4 py-3 md:px-8` (reduce mobile padding)
- Wrap left side in flex container with `<MobileDrawer />` (renders hamburger on mobile)
- `<div>馬鈴薯沙發</div>` wrapped in flex container

- [ ] **Step 2: Verify build**

Run: `cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價 && npx next build --no-lint 2>&1 | tail -20`

Expected: Build succeeds.

- [ ] **Step 3: Manual test in browser**

Run: `cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價 && npx next dev`

Test checklist:
- Open Chrome DevTools, toggle device toolbar (Ctrl+Shift+M)
- iPhone SE (375px): hamburger visible, sidebar hidden, tap hamburger opens drawer, tap link navigates and closes drawer, tap overlay closes drawer
- iPad (768px boundary): verify breakpoint behavior
- Desktop (1200px+): hamburger hidden, sidebar visible, no visual changes

- [ ] **Step 4: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat(layout): mount MobileDrawer and responsive header padding

Hamburger menu appears on mobile (≤768px). Header padding reduced
from 32px to 16px on mobile."
```

---

### Task 5: Responsive HeaderUserMenu dropdowns

**Files:**
- Modify: `src/components/layout/HeaderUserMenu.tsx`

- [ ] **Step 1: Update notification bell touch target**

In `src/components/layout/HeaderUserMenu.tsx`, line 133, change the bell button class:

```tsx
// Before:
className="relative flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-[var(--bg-subtle)]"

// After:
className="relative flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-[var(--bg-subtle)]"
```

- [ ] **Step 2: Update notification panel width**

Line 36, change the notification panel outer div class:

```tsx
// Before:
className="absolute right-0 top-full mt-1 w-80 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-elevated)] shadow-[var(--shadow-lg)]"

// After:
className="fixed inset-x-4 top-auto mt-1 w-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-elevated)] shadow-[var(--shadow-lg)] md:absolute md:inset-auto md:right-0 md:top-full md:w-80"
```

- [ ] **Step 3: Update user menu dropdown width**

Line 179, change the user menu dropdown class:

```tsx
// Before:
className="absolute right-0 top-full mt-1 w-52 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-elevated)] py-1 shadow-[var(--shadow-lg)]"

// After:
className="fixed inset-x-4 top-auto mt-1 w-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-elevated)] py-1 shadow-[var(--shadow-lg)] md:absolute md:inset-auto md:right-0 md:top-full md:w-52"
```

- [ ] **Step 4: Verify build and test**

Run: `cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價 && npx next build --no-lint 2>&1 | tail -20`

Then in dev server, test on iPhone SE (375px):
- Tap notification bell: panel should be near full-width with 16px margin each side
- Tap user avatar: menu should be near full-width
- Desktop: both dropdowns unchanged (w-80 / w-52, absolute positioned)

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/HeaderUserMenu.tsx
git commit -m "feat(header): responsive notification/user dropdowns

Mobile: full-width fixed dropdowns with 16px side margins.
Desktop: unchanged absolute positioning."
```

---

### Task 6: Responsive button touch sizes

**Files:**
- Modify: `src/components/ui/button.tsx`

- [ ] **Step 1: Update button size variants**

In `src/components/ui/button.tsx`, replace the `size` variants object (lines 25-29):

```ts
// Before:
size: {
  default: "h-9",
  sm: "h-8 px-3 text-xs",
  lg: "h-10 px-5",
  icon: "h-8 w-8 p-0",
},

// After:
size: {
  default: "h-11 md:h-9",
  sm: "h-10 md:h-8 px-3 text-xs",
  lg: "h-12 md:h-10 px-5",
  icon: "h-10 w-10 md:h-8 md:w-8 p-0",
},
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價 && npx next build --no-lint 2>&1 | tail -20`

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/button.tsx
git commit -m "feat(ui): responsive button touch targets

Mobile: 44px default, 40px sm, 48px lg, 40px icon.
Desktop: unchanged (36px, 32px, 40px, 32px)."
```

---

### Task 7: Responsive input touch sizes

**Files:**
- Modify: `src/components/ui/input.tsx`

- [ ] **Step 1: Update input height**

In `src/components/ui/input.tsx`, line 12, change the className:

```ts
// Before:
"flex h-9 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-tertiary)] focus:border-[var(--border-focus)] focus:ring-1 focus:ring-[var(--accent)]"

// After:
"flex h-11 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-tertiary)] focus:border-[var(--border-focus)] focus:ring-1 focus:ring-[var(--accent)] md:h-9"
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價 && npx next build --no-lint 2>&1 | tail -20`

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/input.tsx
git commit -m "feat(ui): responsive input touch target

Mobile: 44px height. Desktop: unchanged 36px."
```

---

### Task 8: Final integration test

**Files:** None (verification only)

- [ ] **Step 1: Full build verification**

Run: `cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價 && npx next build --no-lint 2>&1 | tail -30`

Expected: Build succeeds with no errors.

- [ ] **Step 2: Mobile test in dev server**

Run: `cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價 && npx next dev`

Open Chrome DevTools → Device toolbar → iPhone SE (375px):

Checklist:
- [ ] Sidebar hidden
- [ ] Hamburger button visible in header
- [ ] Tap hamburger → drawer slides up from bottom
- [ ] All 11 nav links visible in 2-column grid
- [ ] Tap a nav link → navigates and drawer closes
- [ ] Tap overlay → drawer closes
- [ ] Notification bell: larger touch target (40px)
- [ ] Tap bell → notification panel is near full-width
- [ ] Tap avatar → user menu is near full-width
- [ ] Buttons are 44px tall
- [ ] Input fields are 44px tall
- [ ] Page content padding is 16px

Switch to iPad (768px boundary):
- [ ] At 768px: sidebar hidden, hamburger visible
- [ ] At 769px: sidebar visible (icon-only 56px), hamburger hidden

Switch to Desktop (1200px):
- [ ] Sidebar fully expanded (220px)
- [ ] All elements match pre-change appearance
- [ ] No hamburger button visible
- [ ] Dropdowns are w-80 / w-52 absolute positioned

- [ ] **Step 3: Commit any fixes if needed, then tag completion**

If all checks pass, no additional commit needed. If fixes were made, commit them:

```bash
git add -A
git commit -m "fix(responsive): integration test fixes for mobile shell"
```
