import { withSentryConfig } from "@sentry/nextjs";
import withPWA from "@ducanh2912/next-pwa";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
};

const withPWAConfig = withPWA({
  dest: "public",
  // 不要快取前端導覽的 HTML/JS：導覽走網路 → 永遠取得引用最新 chunk 的頁面，
  // 避免部署後舊 service worker 服務到已移除的舊 chunk 而造成 client-side exception。
  // （cacheOnFrontEndNav / aggressiveFrontEndNavCaching 預設皆為 false；
  //   skipWaiting / clientsClaim / cleanupOutdatedCaches 預設為 true，會讓新 SW 立即接管並清舊快取）
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === "development",
});

export default withSentryConfig(withPWAConfig(nextConfig), {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
});
