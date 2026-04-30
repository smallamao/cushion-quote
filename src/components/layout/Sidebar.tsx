"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import { navLinks } from "@/components/layout/nav-links";

const STORAGE_KEY = "cq-sidebar-collapsed";

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useCurrentUser();
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  // SSR 沒有 user → 0 links;CSR 拿到後才 render,避免 hydration mismatch。
  const visibleLinks = mounted && user
    ? navLinks.filter((l) => l.roles.includes(user.role))
    : [];

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "true") setCollapsed(true);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem(STORAGE_KEY, String(collapsed));
  }, [collapsed, mounted]);

  useEffect(() => {
    if (!mounted) return;
    document.documentElement.style.setProperty(
      "--sidebar-width",
      collapsed ? "56px" : "220px",
    );
  }, [collapsed, mounted]);

  const toggle = () => setCollapsed((prev) => !prev);

  return (
    <aside
      className="sidebar flex flex-col justify-between bg-[var(--sidebar-bg)] py-5"
      data-collapsed={collapsed}
      style={{ width: collapsed ? 56 : 220 }}
    >
      <div>
        <div
          className="mb-6 overflow-hidden whitespace-nowrap"
          style={{ padding: collapsed ? "0 0 0 14px" : "0 12px" }}
        >
          <div className="text-sm font-semibold text-white tracking-tight">
            {collapsed ? "PS" : "馬鈴薯沙發"}
          </div>
          <div
            className="mt-0.5 text-[11px] text-white transition-opacity duration-200"
            style={{ opacity: collapsed ? 0 : 0.6, height: collapsed ? 0 : "auto" }}
          >
            營運系統 v0.7.0
          </div>
        </div>

        <nav className="space-y-0.5" style={{ padding: collapsed ? "0 6px" : "0 12px" }}>
          {visibleLinks.map((link, index) => {
            const Icon = link.icon;
            const isActive =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href);
            const prev = visibleLinks[index - 1];
            const showDivider = prev && prev.group !== link.group;

            return (
              <div key={link.href}>
                {showDivider && (
                  <div
                    className="my-2"
                    style={{
                      height: 1,
                      background: "rgba(255,255,255,0.12)",
                      marginLeft: collapsed ? 0 : 4,
                      marginRight: collapsed ? 0 : 4,
                    }}
                  />
                )}
                <Link
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  href={link.href as any}
                  title={collapsed ? link.label : undefined}
                  style={{ color: "#FFFFFF" }}
                  className={[
                    "flex items-center rounded-[var(--radius-md)] py-2.5 text-[13px] font-medium transition-colors",
                    "hover:bg-[var(--sidebar-hover)]",
                    isActive ? "bg-[var(--sidebar-active)]" : "",
                    collapsed ? "justify-center px-0" : "gap-2.5 px-3",
                  ].join(" ")}
                >
                  <Icon
                    className="h-4 w-4 shrink-0"
                    style={{ color: "#FFFFFF" }}
                    strokeWidth={1.5}
                  />
                  {!collapsed && (
                    <span className="sidebar-label">{link.label}</span>
                  )}
                </Link>
              </div>
            );
          })}
        </nav>
      </div>

      <div style={{ padding: collapsed ? "0 6px" : "0 12px" }}>
        <button
          type="button"
          onClick={toggle}
          className={[
            "flex items-center w-full rounded-[var(--radius-md)] py-2 text-[12px] font-medium text-white transition-colors",
            "hover:bg-[var(--sidebar-hover)]",
            collapsed ? "justify-center px-0" : "gap-2 px-3",
          ].join(" ")}
          style={{ opacity: 0.7 }}
          aria-label={collapsed ? "展開側邊欄" : "收合側邊欄"}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4 shrink-0" strokeWidth={1.5} />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4 shrink-0" strokeWidth={1.5} />
              <span>收合側邊欄</span>
            </>
          )}
        </button>

        {!collapsed && (
          <div
            className="mt-2 px-3 text-[11px] text-white"
            style={{ opacity: 0.6 }}
          >
            Google Sheets 已連線
          </div>
        )}
      </div>
    </aside>
  );
}
