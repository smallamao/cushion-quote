import { describe, expect, it } from "vitest";

import { shouldSubmitOnEnter, type EnterKeyContext } from "@/lib/chat-input";

/** 桌機、非選字中、單純按 Enter */
function ctx(overrides: Partial<EnterKeyContext> = {}): EnterKeyContext {
  return { key: "Enter", shiftKey: false, isComposing: false, touchDevice: false, ...overrides };
}

describe("shouldSubmitOnEnter", () => {
  it("桌機按 Enter 送出", () => {
    expect(shouldSubmitOnEnter(ctx())).toBe(true);
  });

  it("桌機 Shift+Enter 不送出（留給換行）", () => {
    expect(shouldSubmitOnEnter(ctx({ shiftKey: true }))).toBe(false);
  });

  it("中文選字中的 Enter 不送出——那一下是確認選字，不是送出", () => {
    expect(shouldSubmitOnEnter(ctx({ isComposing: true }))).toBe(false);
  });

  it("選字中就算沒按 Shift 也不送出（送出後文字被 IME 寫回來的殘留成因）", () => {
    expect(shouldSubmitOnEnter(ctx({ isComposing: true, shiftKey: false }))).toBe(false);
  });

  it("手機 Enter 一律換行，不送出", () => {
    expect(shouldSubmitOnEnter(ctx({ touchDevice: true }))).toBe(false);
  });

  it("手機接實體鍵盤按 Shift+Enter 也不送出，維持單一規則", () => {
    expect(shouldSubmitOnEnter(ctx({ touchDevice: true, shiftKey: true }))).toBe(false);
  });

  it("其他按鍵一律不送出", () => {
    for (const key of ["a", "Escape", "Tab", "NumpadEnter"]) {
      expect(shouldSubmitOnEnter(ctx({ key }))).toBe(false);
    }
  });
});
