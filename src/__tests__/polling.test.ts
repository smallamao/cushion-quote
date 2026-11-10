import { describe, it, expect } from "vitest";

import { IDLE_AFTER_MS, POLL_INTERVAL_MS, isStale, shouldPollNow } from "@/lib/polling";

// 2026-11-10 Vercel Hobby 因 Fluid Active CPU 超過每月 4 小時被暫停到 12/9。
// 常駐開著的系統視窗：未讀回覆每 15 秒、通知每 30 秒各打一次伺服器，人不在也照跑。
// 改成：2 分鐘一次、5 分鐘沒操作就停、回來立刻補查。

const NOW = 1_800_000_000_000;

describe("shouldPollNow", () => {
  it("畫面可見、5 分鐘內有操作 → 照常查", () => {
    expect(shouldPollNow({ visible: true, lastActivityMs: NOW - 60_000, nowMs: NOW })).toBe(true);
  });

  it("畫面在背景 → 不查", () => {
    expect(shouldPollNow({ visible: false, lastActivityMs: NOW, nowMs: NOW })).toBe(false);
  });

  it("視窗開著但人不在（超過 5 分鐘沒動）→ 不查", () => {
    expect(shouldPollNow({ visible: true, lastActivityMs: NOW - IDLE_AFTER_MS - 1, nowMs: NOW })).toBe(false);
    expect(shouldPollNow({ visible: true, lastActivityMs: NOW - IDLE_AFTER_MS, nowMs: NOW })).toBe(true);
  });
});

describe("isStale", () => {
  it("回到畫面時，上次查詢超過 30 秒才補查（避免來回切視窗狂打）", () => {
    expect(isStale(NOW - 31_000, NOW)).toBe(true);
    expect(isStale(NOW - 10_000, NOW)).toBe(false);
    expect(isStale(0, NOW)).toBe(true);
  });
});

describe("間隔", () => {
  it("至少 2 分鐘一次，比原本 15／30 秒少 4～8 倍", () => {
    expect(POLL_INTERVAL_MS).toBeGreaterThanOrEqual(120_000);
    expect(IDLE_AFTER_MS).toBe(5 * 60_000);
  });
});
