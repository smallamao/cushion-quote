import { withSentryConfig } from "@sentry/nextjs";
import withPWA from "@ducanh2912/next-pwa";
import type { NextConfig } from "next";

/** 網址本身就是憑證的公開頁面（token 在路徑裡），Referer 不可外洩 */
const TOKEN_PATHS = [
  "/sign/:path*", // 客人簽報價單
  "/s/:path*", // 簽署短網址
  "/w/:path*", // 師傅派工單
  "/dispatch/:path*", // 派工單舊路徑
  "/confirm/:path*", // 叫料確認
  "/od/:path*", // 線上下訂確認
  "/d/:path*", // 司機配送時段
  "/cleaning/:path*", // 清潔時段
  "/api/public/:path*",
] as const;

const nextConfig: NextConfig = {
  typedRoutes: true,
  // 客戶簽署短網址：/s/{code} 對外，內部走 /sign/{code}（同一頁、同一 token）
  async rewrites() {
    return [{ source: "/s/:code", destination: "/sign/:code" }];
  },
  async headers() {
    return [
      {
        // 全站安全標頭
        source: "/:path*",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=()",
          },
        ],
      },
      // 帶 token 的公開頁面：Referer 一律不外洩。
      // 這些頁面的網址本身就是唯一憑證（token 在路徑裡），只要頁面載入任何外部
      // 資源，完整網址就會透過 Referer 送給那個第三方，等於把簽署／派工連結交出去。
      // 新增這類 token 頁面時要補進 TOKEN_PATHS。
      ...TOKEN_PATHS.map((source) => ({
        source,
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      })),
    ];
  },
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
