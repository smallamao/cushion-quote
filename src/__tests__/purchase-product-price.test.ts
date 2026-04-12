import { describe, expect, test } from "vitest";

import {
  calculateAdjustedPrice,
  validateAdjustedPrice,
  validatePriceAdjustment,
} from "@/lib/purchase-product-price";

describe("purchase-product-price", () => {
  test("adds percentage increase and rounds to integer", () => {
    expect(
      calculateAdjustedPrice(125, {
        mode: "percentage",
        value: 10,
        isIncrease: true,
      }),
    ).toBe(138);
  });

  test("subtracts fixed amount", () => {
    expect(
      calculateAdjustedPrice(200, {
        mode: "fixed",
        value: 50,
        isIncrease: false,
      }),
    ).toBe(150);
  });

  test("sets absolute value directly", () => {
    expect(
      calculateAdjustedPrice(999, {
        mode: "absolute",
        value: 320,
      }),
    ).toBe(320);
  });

  test("rejects negative adjustment values", () => {
    expect(
      validatePriceAdjustment({
        mode: "fixed",
        value: -1,
        isIncrease: true,
      }),
    ).toBe("調整值不可為負數");
  });

  test("rejects adjusted prices above max", () => {
    expect(validateAdjustedPrice(100001)).toBe("計算後價格不可超過 100,000 元");
  });
});
