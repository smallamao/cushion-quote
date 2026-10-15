import { describe, it, expect } from "vitest";

import {
  RETURN_TO_FALLBACK,
  canTechnicianAccess,
  isAdminOnly,
  isPublicPath,
  isRateLimitedPublicPath,
  sanitizeReturnTo,
} from "@/lib/permissions";

// 路由決策的表格測試。
//
// 為什麼要有這份測試：2026-10-15 的弱點分析找到 middleware 用「副檔名」放行公開
// 路徑——網址結尾加 .png 就不用登入，而 /api/sheets 底下 80 支端點完全只靠這道門。
// 這個漏洞活了很久而沒有任何測試會抓到，因為路由決策一條測試都沒有。

describe("isPublicPath — 免登入路徑", () => {
  // 🔴 這一組是漏洞本體：結尾加 .png 不能讓 API 變成公開
  const mustRequireAuth = [
    "/api/trello/cards/68f1a2b3c4d5e6f7a8b9c0d1/attachments/68f1a2b3c4d5e6f7a8b9c0d2/download/x.png",
    "/api/trello/cards/anything/x.png",
    "/api/legacy/customers/list.png",
    "/api/legacy/anything.mjs",
    "/api/sheets/orders/ORD-001.png",
    "/api/sheets/clients.png",
    "/api/sheets/settings.mjs",
    "/api/upload.png",
    "/api/sheets/migrate-v12",
    "/api/sheets/purchase-products/migrate-to-25col",
    // 一般後台路徑
    "/orders",
    "/api/sheets/orders",
    "/api/sheets/settings",
    "/api/sheets/users",
    "/api/sheets/reports",
    "/settings",
    "/",
  ];

  it.each(mustRequireAuth)("需要登入：%s", (path) => {
    expect(isPublicPath(path)).toBe(false);
  });

  // public/ 根層的靜態資產：免登入才不會在登入頁破圖、SW 才裝得起來
  const rootAssets = [
    "/logo.png",
    "/icon-192.png",
    "/icon-512.png",
    "/apple-touch-icon.png",
    "/stamp.png",
    "/potato-sofa-logo.jpg",
    "/pdf.min.mjs",
    "/pdf.worker.min.mjs",
    "/favicon.ico",
    "/sw.js",
    "/sw.js.map",
    "/workbox-f1770938.js",
    "/worker-eb0a7c4beba304e1.js",
    "/_next/static/chunks/main.js",
  ];

  it.each(rootAssets)("靜態資產免登入：%s", (path) => {
    expect(isPublicPath(path)).toBe(true);
  });

  // 客人／外部師傅用 token 開的頁面，token 是唯一憑證
  const tokenPages = [
    "/login",
    "/api/auth/login",
    "/api/auth/callback/google",
    "/api/linebot",
    "/sign",
    "/sign/abc123",
    "/s/aB3dE9",
    "/w/SV-0001/deadbeefcafe",
    "/dispatch",
    "/dispatch/SV-0001",
    "/confirm/abcdefghi",
    "/od/abcdef",
    "/d/abcdefghi",
    "/cleaning",
    "/cleaning/abcdefghi",
    "/api/public/order-confirm/abcdef",
  ];

  it.each(tokenPages)("公開頁面：%s", (path) => {
    expect(isPublicPath(path)).toBe(true);
  });

  it("巢狀靜態圖改為需要登入（只用在登入後的說明頁）", () => {
    expect(isPublicPath("/screenshots/01-sidebar-dashboard.png")).toBe(false);
    expect(isPublicPath("/screenshots/template-test/01-settings-template-manager.png")).toBe(false);
  });

  it("副檔名規則只吃根層單一片段", () => {
    expect(isPublicPath("/a.png")).toBe(true);
    expect(isPublicPath("/a/b.png")).toBe(false);
    expect(isPublicPath("/a.png/b")).toBe(false);
    expect(isPublicPath("/a.png.json")).toBe(false);
    expect(isPublicPath("/a.PNG")).toBe(false);
  });
});

describe("canTechnicianAccess — 非 admin 角色", () => {
  const allowed = [
    "/after-sales",
    "/after-sales/SV-0001",
    "/my-schedule",
    "/login",
    "/api/auth/logout",
    "/api/sheets/after-sales",
    "/api/sheets/after-sales/SV-0001",
    "/api/sheets/equipment",
    "/api/sheets/orders/my-installs",
    "/api/upload",
  ];

  it.each(allowed)("師傅可以存取：%s", (path) => {
    expect(canTechnicianAccess(path)).toBe(true);
  });

  // 改價、看成本毛利、刪單、管帳號——師傅直接打 API 也不能做
  const denied = [
    "/api/sheets/settings",
    "/api/sheets/reports",
    "/api/sheets/versions",
    "/api/sheets/quotes-v2",
    "/api/sheets/purchases",
    "/api/sheets/clients",
    "/api/sheets/orders",
    "/api/sheets/users",
    "/api/sheets/suppliers",
    "/api/sheets/einvoices",
    "/settings",
    "/admin",
    "/orders",
    "/",
  ];

  it.each(denied)("師傅不能存取：%s", (path) => {
    expect(canTechnicianAccess(path)).toBe(false);
  });

  it("admin-only 前綴即使誤加進白名單也擋下", () => {
    expect(isAdminOnly("/api/sheets/users")).toBe(true);
    expect(isAdminOnly("/settings")).toBe(true);
    expect(isAdminOnly("/api/sheets/_debug")).toBe(true);
    expect(isAdminOnly("/api/sheets/after-sales")).toBe(false);
  });
});

describe("sanitizeReturnTo — 登入後轉址", () => {
  // 🔴 這一組是漏洞本體：瀏覽器會把反斜線當斜線，所以這些值原本會真的導到站外
  const mustNotEscape = [
    "/\\evil.com",
    "/\\/evil.com",
    "/\t/evil.com",
    "//evil.com",
    "///evil.com",
    "https://evil.com",
    "http://evil.com/path",
    "//evil.com/\\@x",
    "/\\\\evil.com",
    "javascript:alert(1)",
    "\\/evil.com",
  ];

  it.each(mustNotEscape)("不可導到站外：%j", (raw) => {
    const result = sanitizeReturnTo(raw);
    // 不只看字串——用瀏覽器同一套 URL 解析確認它真的留在本站
    expect(new URL(result, "https://ourhost.example").origin).toBe("https://ourhost.example");
  });

  it("站內路徑照樣可用", () => {
    expect(sanitizeReturnTo("/orders")).toBe("/orders");
    expect(sanitizeReturnTo("/orders/ORD-001")).toBe("/orders/ORD-001");
    expect(sanitizeReturnTo("/quotes?tab=draft")).toBe("/quotes?tab=draft");
    expect(sanitizeReturnTo("/")).toBe("/");
  });

  it("空值回預設落點", () => {
    expect(sanitizeReturnTo(null)).toBe(RETURN_TO_FALLBACK);
    expect(sanitizeReturnTo("")).toBe(RETURN_TO_FALLBACK);
  });

  it("不把 hash 帶過去（hash 不會送到伺服器，留著只會混淆）", () => {
    expect(sanitizeReturnTo("/orders#top")).toBe("/orders");
  });
});

describe("isRateLimitedPublicPath — 公開端點限流範圍", () => {
  // token 就是唯一憑證的路徑，沒有次數限制等於開放無限次猜測
  const limited = [
    "/api/public/sign/abc",
    "/api/public/order-confirm/abcdef",
    "/api/public/material-confirm/xyz/photo/0",
    "/api/public/delivery/batch/abc",
    "/sign/abc123",
    "/s/aB3dE9xYz0",
    "/confirm/abcdefghi",
    "/od/abcdef",
    "/d/abcdefghi",
    "/cleaning/abcdefghi",
    "/w/SV-0001/deadbeefcafe",
  ];

  it.each(limited)("要限流：%s", (path) => {
    expect(isRateLimitedPublicPath(path)).toBe(true);
    // 這些必須同時是公開路徑，否則限流判斷永遠不會被執行到
    expect(isPublicPath(path)).toBe(true);
  });

  // 登入流程與靜態資產不能被限流——擋住登入比被猜密碼更糟
  const notLimited = [
    "/login",
    "/api/auth/login",
    "/api/auth/callback/google",
    "/logo.png",
    "/icon-192.png",
    "/pdf.min.mjs",
    "/sw.js",
    "/_next/static/chunks/main.js",
    "/api/sheets/orders",
    "/orders",
  ];

  it.each(notLimited)("不限流：%s", (path) => {
    expect(isRateLimitedPublicPath(path)).toBe(false);
  });
});
