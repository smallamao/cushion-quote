import { describe, it, expect } from "vitest";

import { PUBLIC_LINK_TTL_DAYS, isPublicLinkExpired } from "@/lib/public-link-expiry";

const DAY = 86_400_000;
const NOW = Date.parse("2026-10-16T00:00:00Z");

// 🔴 2026-10-16：叫料確認、配送時段、清潔時段這三種客人連結完全沒有過期機制。
//    實查線上資料：叫料確認 32 條、清潔時段 5 條，最舊的 2026-09-26 發出，
//    其中 24 條客人早就確認完了，連結照樣能開——而且這個數字只會一直長。
//    對照組：線上下訂（order-confirm）本來就有 90 天期限並回 410。
describe("isPublicLinkExpired", () => {
  it("期限內不算過期", () => {
    expect(isPublicLinkExpired(new Date(NOW - 10 * DAY).toISOString(), NOW)).toBe(false);
    expect(isPublicLinkExpired(new Date(NOW - 89 * DAY).toISOString(), NOW)).toBe(false);
  });

  it("超過期限就過期", () => {
    expect(isPublicLinkExpired(new Date(NOW - 91 * DAY).toISOString(), NOW)).toBe(true);
    expect(isPublicLinkExpired(new Date(NOW - 365 * DAY).toISOString(), NOW)).toBe(true);
  });

  it("期限與線上下訂一致（90 天），不另外發明數字", () => {
    expect(PUBLIC_LINK_TTL_DAYS).toBe(90);
  });

  it("建立時間是空的或壞的 → 當成過期（預設拒絕）", () => {
    // 舊資料可能沒有建立時間。這時不能當成「永遠有效」，
    // 否則最舊、最該失效的那批反而繼續開著。
    expect(isPublicLinkExpired("", NOW)).toBe(true);
    expect(isPublicLinkExpired("not a date", NOW)).toBe(true);
    expect(isPublicLinkExpired(undefined, NOW)).toBe(true);
  });

  it("未來的時間不算過期（時鐘誤差容忍）", () => {
    expect(isPublicLinkExpired(new Date(NOW + 60_000).toISOString(), NOW)).toBe(false);
  });

  it("剛好在邊界上不算過期", () => {
    expect(isPublicLinkExpired(new Date(NOW - PUBLIC_LINK_TTL_DAYS * DAY).toISOString(), NOW)).toBe(false);
  });
});
