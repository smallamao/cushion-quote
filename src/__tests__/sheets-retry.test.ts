import { describe, expect, it, vi } from "vitest";

import { SHEETS_RETRY_DELAYS_MS, isSheetsQuotaError, withSheetsRetry } from "@/lib/sheets-retry";

function quotaError(): Error & { code: number } {
  return Object.assign(
    new Error("Quota exceeded for quota metric 'Write requests' and limit 'Write requests per minute per user'"),
    { code: 429 },
  );
}

describe("isSheetsQuotaError", () => {
  it("辨識 429 / RESOURCE_EXHAUSTED / Quota exceeded", () => {
    expect(isSheetsQuotaError(quotaError())).toBe(true);
    expect(isSheetsQuotaError(Object.assign(new Error("x"), { code: 429 }))).toBe(true);
    expect(isSheetsQuotaError(Object.assign(new Error("x"), { status: 429 }))).toBe(true);
    expect(isSheetsQuotaError(Object.assign(new Error("x"), { response: { status: 429 } }))).toBe(true);
    expect(isSheetsQuotaError(new Error("RESOURCE_EXHAUSTED: too many"))).toBe(true);
    expect(isSheetsQuotaError(new Error("Quota exceeded"))).toBe(true);
  });

  it("其他錯誤不算", () => {
    expect(isSheetsQuotaError(new Error("Unable to parse range"))).toBe(false);
    expect(isSheetsQuotaError(Object.assign(new Error("x"), { code: 400 }))).toBe(false);
    expect(isSheetsQuotaError(null)).toBe(false);
    expect(isSheetsQuotaError("Quota exceeded")).toBe(true);
  });
});

describe("withSheetsRetry", () => {
  it("退避總長不超過 20 秒", () => {
    expect(SHEETS_RETRY_DELAYS_MS.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(20_000);
  });

  it("成功時直接回傳，不等待", async () => {
    const sleep = vi.fn(async () => {});
    const fn = vi.fn(async () => "ok");
    await expect(withSheetsRetry(fn, { sleep })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("配額錯誤依序等 2s/5s/10s 後重試，成功即回傳", async () => {
    const sleep = vi.fn(async () => {});
    const fn = vi.fn<() => Promise<string>>()
      .mockRejectedValueOnce(quotaError())
      .mockRejectedValueOnce(quotaError())
      .mockResolvedValueOnce("ok");
    await expect(withSheetsRetry(fn, { sleep })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((c) => (c as unknown[])[0])).toEqual([2000, 5000]);
  });

  it("重試用完仍是配額錯誤 → 拋出最後的錯誤", async () => {
    const sleep = vi.fn(async () => {});
    const fn = vi.fn(async () => { throw quotaError(); });
    await expect(withSheetsRetry(fn, { sleep })).rejects.toThrow("Quota exceeded");
    expect(fn).toHaveBeenCalledTimes(SHEETS_RETRY_DELAYS_MS.length + 1);
    expect(sleep.mock.calls.map((c) => (c as unknown[])[0])).toEqual([...SHEETS_RETRY_DELAYS_MS]);
  });

  it("非配額錯誤立即拋出，不重試", async () => {
    const sleep = vi.fn(async () => {});
    const fn = vi.fn(async () => { throw new Error("Unable to parse range"); });
    await expect(withSheetsRetry(fn, { sleep })).rejects.toThrow("Unable to parse range");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("預設使用真實計時器（fake timers 驗證）", async () => {
    vi.useFakeTimers();
    try {
      const fn = vi.fn<() => Promise<string>>()
        .mockRejectedValueOnce(quotaError())
        .mockResolvedValueOnce("ok");
      const promise = withSheetsRetry(fn);
      await vi.advanceTimersByTimeAsync(1999);
      expect(fn).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await expect(promise).resolves.toBe("ok");
      expect(fn).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
