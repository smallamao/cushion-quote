"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3,
  Briefcase,
  CircleHelp,
  Calculator,
  ChevronLeft,
  ChevronRight,
  FileText,
  HandCoins,
  LogOut,
  Package,
  Palette,
  Settings,
  ShoppingCart,
  Stethoscope,
} from "lucide-react";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import type { UserRole } from "@/lib/types";

const STORAGE_KEY = "cq-sidebar-collapsed";

type LinkDef = {
  href: string;
  label: string;
  icon: typeof Calculator;
  roles: UserRole[];
};

const links: LinkDef[] = [
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

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useCurrentUser();
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  const visibleLinks = user
    ? links.filter((l) => l.roles.includes(user.role))
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
            報價系統 v0.4.0
          </div>
        </div>

        <nav className="space-y-0.5" style={{ padding: collapsed ? "0 6px" : "0 12px" }}>
          {visibleLinks.map((link) => {
            const Icon = link.icon;
            const isActive =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href);

            return (
              <Link
                key={link.href}
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

        {user && (
          <div className="mt-3 border-t border-white/10 pt-3">
            {!collapsed && (
              <div className="mb-1 px-3 text-[11px] text-white" style={{ opacity: 0.7 }}>
                <div className="truncate">{user.displayName}</div>
                <div className="truncate text-[10px]" style={{ opacity: 0.6 }}>
                  {user.role === "admin" ? "管理員" : "技師"}
                </div>
              </div>
            )}
            <a
              href="/api/auth/logout"
              className={[
                "flex items-center rounded-[var(--radius-md)] py-2 text-[12px] font-medium text-white transition-colors",
                "hover:bg-[var(--sidebar-hover)]",
                collapsed ? "justify-center px-0" : "gap-2 px-3",
              ].join(" ")}
              style={{ opacity: 0.7 }}
              title={collapsed ? "登出" : undefined}
            >
              <LogOut className="h-4 w-4 shrink-0" strokeWidth={1.5} />
              {!collapsed && <span>登出</span>}
            </a>
          </div>
        )}
      </div>
    </aside>
  );
}
