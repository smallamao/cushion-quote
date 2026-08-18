import type { Metadata, Viewport } from "next";
import { DM_Sans } from "next/font/google";
import { headers } from "next/headers";
import type { ReactNode } from "react";

import { HeaderUserMenu } from "@/components/layout/HeaderUserMenu";
import { MobileDrawer } from "@/components/layout/MobileDrawer";
import { FloatingImageViewer } from "@/components/layout/FloatingImageViewer";
import { FloatingAssistant } from "@/components/assistant/FloatingAssistant";
import { PWAUpdateBanner } from "@/components/layout/PWAUpdateBanner";
import { Sidebar } from "@/components/layout/Sidebar";
import "@/app/globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-dm-sans",
});

export const viewport: Viewport = {
  themeColor: "#E85D28",
  width: "device-width",
  initialScale: 1,
  // iPad 站立式使用常需要雙指縮放看工單/照片，不鎖定 maximumScale
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "馬鈴薯沙發營運系統",
  description: "CushionQuote v2.1 - 馬鈴薯沙發營運管理系統",
  applicationName: "馬鈴薯沙發營運系統",
  authors: [{ name: "馬鈴薯沙發" }],
  keywords: ["沙發", "繃布", "報價", "馬鈴薯沙發"],
  manifest: "/manifest.json",
  icons: {
    apple: "/apple-touch-icon.png",
  },
  // iOS / iPadOS 不讀 manifest 的 display 設定，靠這組 Apple 專屬 meta 才會以
  // 全螢幕 App 形式（無網址列）從主畫面開啟；少了它「加到主畫面」只是書籤。
  appleWebApp: {
    capable: true,
    title: "沙發營運",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
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

export default async function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  // 客戶簽署頁（/sign）不需登入、不套營運後台的側邊欄/頁首，直接裸版呈現。
  const pathname = (await headers()).get("x-pathname") ?? "";
  const bare = pathname === "/sign" || pathname.startsWith("/sign/") || pathname.startsWith("/s/");

  return (
    <html lang="zh-Hant" className={dmSans.variable} suppressHydrationWarning>
      <body>
        {bare ? (
          children
        ) : (
          <>
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
            <PWAUpdateBanner />
            <FloatingImageViewer />
            <FloatingAssistant />
          </>
        )}
      </body>
    </html>
  );
}
