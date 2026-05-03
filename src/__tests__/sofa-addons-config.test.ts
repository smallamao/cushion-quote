import { describe, it, expect } from "vitest";
import { calcArmCost, getArmCompat } from "@/lib/sofa-addons-config";

describe("calcArmCost", () => {
  it("none → 0", () => {
    expect(calcArmCost("none", "", "")).toBe(0);
  });
  it("both_same ELEC → 1000 (500×2)", () => {
    expect(calcArmCost("both_same", "ELEC", "ELEC")).toBe(1000);
  });
  it("both_same OBA → 2000 (1000×2)", () => {
    expect(calcArmCost("both_same", "OBA", "OBA")).toBe(2000);
  });
  it("left_only HAILY → 1500", () => {
    expect(calcArmCost("left_only", "HAILY", "")).toBe(1500);
  });
  it("right_only BOOM → 700", () => {
    expect(calcArmCost("right_only", "", "BOOM")).toBe(700);
  });
  it("both_different ELEC+MIKO → 500+800=1300", () => {
    expect(calcArmCost("both_different", "ELEC", "MIKO")).toBe(1300);
  });
  it("unknown code → 0 per side", () => {
    expect(calcArmCost("left_only", "UNKNOWN", "")).toBe(0);
  });
});

describe("getArmCompat", () => {
  it("MULE × BLT → true", () => {
    expect(getArmCompat("MULE", "BLT")?.compatible).toBe(true);
  });
  it("BJ × ELEC → false", () => {
    expect(getArmCompat("BJ", "ELEC")?.compatible).toBe(false);
  });
  it("unknown style → null", () => {
    expect(getArmCompat("ZZZZZ", "ELEC")).toBeNull();
  });
});
