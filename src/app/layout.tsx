import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import type { ReactNode } from "react";

import { HeaderUserMenu } from "@/components/layout/HeaderUserMenu";
import { MobileDrawer } from "@/components/layout/MobileDrawer";
import { Sidebar } from "@/components/layout/Sidebar";
import "@/app/globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-dm-sans",
});

export const metadata: Metadata = {
  title: "馬鈴薯沙發營運系統",
  description: "CushionQuote v2.1 - 馬鈴薯沙發營運管理系統",
  applicationName: "馬鈴薯沙發營運系統",
  authors: [{ name: "馬鈴薯沙發" }],
  keywords: ["沙發", "繃布", "報價", "馬鈴薯沙發"],
  themeColor: "#E85D28",
  manifest: "/manifest.json",
  openGraph: {
    title: "馬鈴薯沙發營運系統",
    description: "馬鈴薯沙發營運管理系統",
    siteName: "馬鈴薯沙發",
    type: "website",
    images: [
      {
        url: "/logo.png",
        width: 1200,
        height: 1200,
        alt: "馬鈴薯沙發 Logo",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-Hant" className={dmSans.variable}>
      <body>
        {/* Runs before React hydrates to avoid sidebar-width flash */}
        <script
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var c=localStorage.getItem('cq-sidebar-collapsed');document.documentElement.style.setProperty('--sidebar-width',c==='true'?'56px':'220px')}catch(e){}})()`,
          }}
        />
        <div className="app-shell">
          <Sidebar />
          <div className="main-area">
            <header className="sticky top-0 z-20 flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 md:px-8">
              <div className="flex items-center">
                <MobileDrawer />
                <div className="text-sm font-semibold text-[var(--text-primary)]">
                  馬鈴薯沙發
                </div>
              </div>
              <HeaderUserMenu />
            </header>
            <main className="page-container">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
