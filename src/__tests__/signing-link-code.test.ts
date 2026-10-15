import { describe, it, expect } from "vitest";

import {
  CODE_ALPHABET,
  LEGACY_SHORT_CODE_LEN,
  SHORT_CODE_LEN,
  generateShortCode,
} from "@/lib/signing-link-code";

describe("signing-link-code", () => {
  it("新碼長度是 10（舊的 6 碼約 34 bits，太好猜）", () => {
    expect(SHORT_CODE_LEN).toBe(10);
    expect(LEGACY_SHORT_CODE_LEN).toBe(6);
    expect(generateShortCode(SHORT_CODE_LEN)).toHaveLength(10);
  });

  it("只用字母表裡的字元，不含易混淆的 0/O/1/l/I", () => {
    for (const ch of "0O1lI") expect(CODE_ALPHABET).not.toContain(ch);
    for (let i = 0; i < 200; i++) {
      for (const ch of generateShortCode(SHORT_CODE_LEN)) {
        expect(CODE_ALPHABET).toContain(ch);
      }
    }
  });

  it("不會重複（2000 組全不同）", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) seen.add(generateShortCode(SHORT_CODE_LEN));
    expect(seen.size).toBe(2000);
  });

  it("任意長度都產得出來（舊碼長度也要能產，相容測試要用）", () => {
    for (const len of [1, 6, 10, 32]) {
      expect(generateShortCode(len)).toHaveLength(len);
    }
  });

  it("字元分佈沒有明顯偏差（拒絕取樣，不是 byte % 54）", () => {
    // 模數偏差會讓字母表前 40 個字元比後 14 個多出約 25%。
    // 抽 54,000 個字元，期望每個字元約 1,000 次。
    const counts = new Map<string, number>();
    for (let i = 0; i < 5400; i++) {
      for (const ch of generateShortCode(10)) {
        counts.set(ch, (counts.get(ch) ?? 0) + 1);
      }
    }
    const head = CODE_ALPHABET.slice(0, 40);
    const tail = CODE_ALPHABET.slice(40);
    const avg = (chars: string) =>
      [...chars].reduce((sum, c) => sum + (counts.get(c) ?? 0), 0) / chars.length;
    const ratio = avg(head) / avg(tail);
    // 有偏差時 ratio ≈ 1.25；無偏差時應該貼近 1
    expect(ratio).toBeGreaterThan(0.9);
    expect(ratio).toBeLessThan(1.1);
  });
});
