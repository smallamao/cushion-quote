"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Briefcase,
  CircleHelp,
  Calculator,
  ChevronLeft,
  ChevronRight,
  FileText,
  HandCoins,
  Palette,
  Settings,
  Users,
} from "lucide-react";

const STORAGE_KEY = "cq-sidebar-collapsed";

const links = [
  { href: "/", label: "報價工作台", icon: Calculator },
  { href: "/clients", label: "客戶管理", icon: Users },
  { href: "/cases", label: "案件管理", icon: Briefcase },
  { href: "/materials", label: "材質資料庫", icon: Palette },
  { href: "/quotes", label: "報價紀錄", icon: FileText },
  { href: "/commissions", label: "佣金結算", icon: HandCoins },
  { href: "/settings", label: "系統設定", icon: Settings },
  { href: "/help", label: "使用說明", icon: CircleHelp },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

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
            報價系統 v0.3.3
          </div>
        </div>

        <nav className="space-y-0.5" style={{ padding: collapsed ? "0 6px" : "0 12px" }}>
          {links.map((link) => {
            const Icon = link.icon;
            const isActive =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href);

            return (
              <Link
                key={link.href}
                href={link.href}
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
      </div>
    </aside>
  );
}
