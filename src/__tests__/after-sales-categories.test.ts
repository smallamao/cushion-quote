import { describe, it, expect } from "vitest";
import { ISSUE_CATEGORIES } from "@/lib/types";

describe("ISSUE_CATEGORIES", () => {
  it("has at least 5 entries", () => {
    expect(ISSUE_CATEGORIES.length).toBeGreaterThanOrEqual(5);
  });

  it("ends with 其他", () => {
    expect(ISSUE_CATEGORIES[ISSUE_CATEGORIES.length - 1]).toBe("其他");
  });

  it("has no duplicate values", () => {
    const unique = new Set(ISSUE_CATEGORIES);
    expect(unique.size).toBe(ISSUE_CATEGORIES.length);
  });

  it("contains the core category names", () => {
    const set = new Set(ISSUE_CATEGORIES);
    expect(set.has("皮革損壞")).toBe(true);
    expect(set.has("骨架/木框")).toBe(true);
    expect(set.has("五金件")).toBe(true);
  });
});
