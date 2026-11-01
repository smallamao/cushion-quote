"use client";

import type { Route } from "next";
import Link from "next/link";

import { useCurrentUser } from "@/hooks/useCurrentUser";

// 工廠師傅（craftsman）的頂部分頁：生產訂單｜售後服務。
// 師傅只有這兩個地方可去，放在頁面頂端比藏在漢堡選單裡好找。
// 放頂部而非底部：生產訂單詳細頁的底部是操作列（工單／製作中／已完成）。
// 只對 craftsman 顯示；admin、技師照舊走側邊欄。

type CraftsmanTab = "production" | "after-sales";

const TABS: readonly { key: CraftsmanTab; href: Route; label: string }[] = [
  { key: "production", href: "/production-orders", label: "生產訂單" },
  { key: "after-sales", href: "/after-sales", label: "售後服務" },
];

export function CraftsmanTabBar({ active, productionCount }: { active: CraftsmanTab; productionCount?: number }) {
  const { user } = useCurrentUser();
  if (user?.role !== "craftsman") return null;

  return (
    <nav className="mb-4 flex border-b border-[var(--border)] bg-[var(--bg-elevated)]" aria-label="師傅分頁">
      {TABS.map((t) => {
        const isActive = t.key === active;
        return (
          <Link
            key={t.key}
            href={t.href}
            aria-current={isActive ? "page" : undefined}
            className={`-mb-px flex h-12 flex-1 items-center justify-center gap-1.5 border-b-2 text-[17px] transition-colors ${
              isActive
                ? "border-[var(--accent)] font-bold text-[var(--accent)]"
                : "border-transparent font-medium text-[var(--text-secondary)]"
            }`}
          >
            {t.label}
            {t.key === "production" && productionCount !== undefined && productionCount > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--error)] px-1.5 text-xs font-bold leading-none text-white">
                {productionCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
