"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * 舊 PWA 圖示的啟動頁保險。
 * iOS/Android 在「加入主畫面」當下就把 start_url 烙進圖示，改 manifest 對
 * 既有圖示無效。這裡偵測「PWA 模式的本次啟動第一頁是 /」時轉向排程出貨；
 * 同一啟動內再點「報價工作台」回 / 不會被轉（sessionStorage 旗標）。
 */
export function StandaloneLaunchRedirect() {
  const router = useRouter();
  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS Safari 專屬旗標
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (!standalone) return;
    if (sessionStorage.getItem("cq-standalone-launched")) return;
    sessionStorage.setItem("cq-standalone-launched", "1");
    router.replace("/shipping-notice");
  }, [router]);
  return null;
}
