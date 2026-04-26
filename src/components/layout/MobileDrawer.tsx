"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import { navLinks } from "@/components/layout/nav-links";
import type { NavGroup } from "@/components/layout/nav-links";

const GROUP_LABELS: Record<NavGroup, string> = {
  daily: "日常操作",
  reference: "資料管理",
  system: "系統功能",
};

export function MobileDrawer() {
  const pathname = usePathname();
  const { user } = useCurrentUser();
  const [open, setOpen] = useState(false);

  const visibleLinks = user
    ? navLinks.filter((l) => l.roles.includes(user.role))
    : [];

  const dailyLinks = visibleLinks.filter((l) => l.group === "daily");
  const secondaryGroups: NavGroup[] = ["reference", "system"];

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

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

  function isActive(href: string) {
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
  }

  return (
    <>
      {/* Hamburger button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mr-3 flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] transition-colors hover:bg-[var(--bg-subtle)] md:hidden"
        aria-label="開啟選單"
      >
        <Menu className="h-5 w-5 text-[var(--text-primary)]" strokeWidth={1.5} />
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/50 md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Bottom-sheet — light background for maximum readability */}
      <div
        className={[
          "fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col transform bg-[var(--bg-elevated)] transition-transform duration-250 ease-out md:hidden",
          open ? "translate-y-0" : "translate-y-full",
        ].join(" ")}
      >
        {/* Fixed header */}
        <div className="shrink-0 rounded-t-2xl border-b border-[var(--border)] bg-[var(--bg-subtle)] px-5 pt-3 pb-3">
          <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-[var(--text-tertiary)]/40" />
          <div className="flex items-center justify-between">
            <div>
              <div className="text-base font-semibold text-[var(--text-primary)]">馬鈴薯沙發</div>
              <div className="mt-0.5 text-xs text-[var(--text-tertiary)]">營運系統</div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--bg-hover)] transition-colors hover:bg-[var(--border)]"
              aria-label="關閉選單"
            >
              <X className="h-4 w-4 text-[var(--text-secondary)]" strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* Scrollable nav */}
        <div
          className="flex-1 overflow-y-auto px-3 pt-2"
          style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
        >
          {/* Daily — full-width rows */}
          {dailyLinks.length > 0 && (
            <nav className="space-y-0.5">
              {dailyLinks.map((link) => {
                const Icon = link.icon;
                const active = isActive(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href as never}
                    className={[
                      "flex items-center gap-3 rounded-xl px-3 py-3 text-[15px] font-medium transition-colors",
                      active
                        ? "bg-[var(--accent)] text-white"
                        : "text-[var(--text-primary)] hover:bg-[var(--bg-hover)]",
                    ].join(" ")}
                  >
                    <Icon
                      className={["h-5 w-5 shrink-0", active ? "text-white" : "text-[var(--text-secondary)]"].join(" ")}
                      strokeWidth={1.5}
                    />
                    <span>{link.label}</span>
                  </Link>
                );
              })}
            </nav>
          )}

          {/* Secondary — grouped 2-col */}
          <div className="mt-3 border-t border-[var(--border)] pt-3">
            {secondaryGroups.map((group) => {
              const links = visibleLinks.filter((l) => l.group === group);
              if (links.length === 0) return null;
              return (
                <div key={group} className="mb-4">
                  <div className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-tertiary)]">
                    {GROUP_LABELS[group]}
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {links.map((link) => {
                      const Icon = link.icon;
                      const active = isActive(link.href);
                      return (
                        <Link
                          key={link.href}
                          href={link.href as never}
                          className={[
                            "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-colors",
                            active
                              ? "bg-[var(--accent)] text-white"
                              : "text-[var(--text-primary)] hover:bg-[var(--bg-hover)]",
                          ].join(" ")}
                        >
                          <Icon
                            className={["h-4 w-4 shrink-0", active ? "text-white" : "text-[var(--text-secondary)]"].join(" ")}
                            strokeWidth={1.5}
                          />
                          <span>{link.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
