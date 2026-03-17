import Link from "next/link";
import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import { Calculator, FileText, Palette, Settings, Users } from "lucide-react";
import type { ReactNode } from "react";

import "@/app/globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-dm-sans",
});

export const metadata: Metadata = {
  title: "馬鈴薯沙發報價系統",
  description: "CushionQuote v2.1",
};

const links = [
  { href: "/", label: "報價工作台", icon: Calculator },
  { href: "/clients", label: "客戶管理", icon: Users },
  { href: "/materials", label: "材質資料庫", icon: Palette },
  { href: "/quotes", label: "報價紀錄", icon: FileText },
  { href: "/settings", label: "系統設定", icon: Settings },
] as const;

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-Hant" className={dmSans.variable}>
      <body>
        <div className="app-shell">
          <aside className="flex flex-col justify-between bg-[var(--sidebar-bg)] px-3 py-5">
            <div>
              <div className="mb-6 px-3">
                <div className="text-sm font-semibold text-white tracking-tight">
                  馬鈴薯沙發
                </div>
                <div className="mt-0.5 text-[11px] text-white" style={{ opacity: 0.6 }}>
                  報價系統 v2.1
                </div>
              </div>
              <nav className="space-y-0.5">
                {links.map((link) => {
                  const Icon = link.icon;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      style={{ color: "#FFFFFF" }}
                      className="flex items-center gap-2.5 rounded-[var(--radius-md)] px-3 py-2.5 text-[13px] font-medium transition-colors hover:bg-[var(--sidebar-hover)]"
                    >
                      <Icon className="h-4 w-4" style={{ color: "#FFFFFF" }} strokeWidth={1.5} />
                      {link.label}
                    </Link>
                  );
                })}
              </nav>
            </div>
            <div className="px-3 text-[11px] text-white" style={{ opacity: 0.6 }}>
              Google Sheets 已連線
            </div>
          </aside>
          <div className="main-area">
            <header className="sticky top-0 z-20 flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-elevated)] px-8 py-3">
              <div className="text-sm font-semibold text-[var(--text-primary)]">
                馬鈴薯沙發
              </div>
              <div className="text-xs text-[var(--text-tertiary)]">
                CushionQuote
              </div>
            </header>
            <main className="page-container">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
