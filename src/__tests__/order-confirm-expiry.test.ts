import { describe, expect, it } from "vitest";

import {
  isOrderConfirmExpired,
  ORDER_CONFIRM_TTL_DAYS,
} from "@/lib/order-confirm-types";

const DAY = 86_400_000;
const NOW = Date.parse("2026-10-13T00:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW - n * DAY).toISOString();

describe("isOrderConfirmExpired", () => {
  it("存活期是 90 天", () => {
    expect(ORDER_CONFIRM_TTL_DAYS).toBe(90);
  });

  it("剛建立、以及期限內的單都還有效", () => {
    for (const d of [0, 1, 7, 30, 89]) {
      expect(isOrderConfirmExpired(daysAgo(d), NOW)).toBe(false);
    }
  });

  it("超過 90 天就失效——兩年後的連結一定打不開", () => {
    for (const d of [91, 180, 730]) {
      expect(isOrderConfirmExpired(daysAgo(d), NOW)).toBe(true);
    }
  });

  it("剛好第 90 天仍有效，不要在邊界把正常單誤殺", () => {
    expect(isOrderConfirmExpired(daysAgo(90), NOW)).toBe(false);
  });

  it("createdAt 壞掉或空白時視為未過期，寧可不擋也不要誤殺正常客人", () => {
    for (const bad of ["", "not-a-date", undefined as unknown as string]) {
      expect(isOrderConfirmExpired(bad, NOW)).toBe(false);
    }
  });
});
