import { describe, expect, it } from "vitest";

import { BRAND_LOGO_DATA_URI } from "@/lib/brand-logo";

/**
 * 採購單 logo 回歸（2026-09-05 老闆回報「採購單左上角沒有 LOGO」）
 *
 * 原本 logo 走兩條路徑、結果不一致：
 *   網頁按產生 → 瀏覽器解析 `/logo.png` → 有 logo
 *   排程系統呼叫 API → `fs.readFileSync(process.cwd()/public/logo.png)` 在 Vercel 讀不到
 *     （public/ 只做靜態站，不會進 lambda 檔案系統）→ 回 undefined
 *     → 退回預設值 `/logo.png` 相對網址 → 伺服器解析不了 → **靜默沒有 logo**
 *
 * 老闆原話：「我原本以為是觸發繃布那邊執行，所以產出結果會相同」——
 * 這個期待是對的，所以改成兩端共用內嵌常數。
 */
describe("採購單品牌 logo", () => {
  it("是可直接嵌入的 PNG data URI", () => {
    expect(BRAND_LOGO_DATA_URI.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("有實際內容（不是空字串或佔位符）", () => {
    const b64 = BRAND_LOGO_DATA_URI.split(",")[1] ?? "";
    expect(b64.length).toBeGreaterThan(5000);          // 256px PNG 約 29KB base64
    expect(Buffer.from(b64, "base64").subarray(0, 8))  // PNG magic number
      .toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  });

  it("🔴 版型的預設 logo 不可退回相對路徑（那就是伺服器端失效的原因）", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync("src/components/pdf/PurchaseOrderDocument.tsx", "utf-8"));
    expect(src).toContain("logoSrc = BRAND_LOGO_DATA_URI");
    expect(src).not.toContain('logoSrc = "/logo.png"');
  });

  it("🔴 伺服器端不可再用 fs 讀 public/logo.png（Vercel 讀不到且會靜默失敗）", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync("src/lib/purchase-order-pdf-server.tsx", "utf-8"));
    expect(src).not.toContain("loadLogoDataUri");
    expect(src).not.toMatch(/readFileSync\([^)]*logo/);
  });
});
