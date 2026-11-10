import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { generateShortCode } from "@/lib/signing-link-code";
import {
  CODE_ALPHABET,
  LEGACY_SHORT_CODE_LEN,
  SHORT_CODE_LEN,
  shortCodeFromPath,
} from "@/lib/signing-link-format";

/**
 * 🔴 2026-11-10 修的真 bug：短網域（s.potatosofa.com）的根路徑原本用
 *    `/^\/([A-Za-z0-9]{6,32})\/?$/` 判斷是不是簽署短碼。於是後台頁面
 *    /orders、/quotes、/settings、/receivables 全部被改寫成 /sign/{那串字}，
 *    線上實測回 200（送出公開簽署頁）而不是導向登入——頁面打不開，
 *    而且完全沒有錯誤訊息可循。
 *
 *    收緊成「長度剛好 10 或 6、且只含 CODE_ALPHABET」之後就不會誤吃，
 *    因為字母表排除了 0/1/i/l/o/O/I/L，含這些字母的頁面名稱自動安全。
 */
describe("短網域根路徑：哪些算簽署短碼", () => {
  it("真實產生的短碼一定認得（新碼 10 碼、舊碼 6 碼）", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateShortCode(SHORT_CODE_LEN);
      expect(shortCodeFromPath(`/${code}`), code).toBe(code);
    }
    for (let i = 0; i < 50; i++) {
      const legacy = generateShortCode(LEGACY_SHORT_CODE_LEN);
      expect(shortCodeFromPath(`/${legacy}`), legacy).toBe(legacy);
    }
  });

  it("結尾斜線也要認得（貼進 LINE 常會多一個）", () => {
    const code = generateShortCode(SHORT_CODE_LEN);
    expect(shortCodeFromPath(`/${code}/`)).toBe(code);
  });

  it("後台頁面不能被當成短碼（這就是當初壞掉的那幾個）", () => {
    for (const p of ["/orders", "/quotes", "/settings", "/receivables", "/cleaning"]) {
      expect(shortCodeFromPath(p), p).toBeNull();
    }
  });

  it("長度不對的一律不算（7、8、9、11 碼）", () => {
    for (const len of [1, 2, 5, 7, 8, 9, 11, 12, 20]) {
      const s = CODE_ALPHABET.slice(0, 1).repeat(len);
      expect(shortCodeFromPath(`/${s}`), `${len} 碼`).toBeNull();
    }
  });

  it("含字母表以外字元的不算（易混淆字元與連字號）", () => {
    for (const p of ["/0bcdef", "/1bcdef", "/ibcdef", "/lbcdef", "/obcdef", "/ab-def", "/ab_def", "/ab.def"]) {
      expect(shortCodeFromPath(p), p).toBeNull();
    }
  });

  it("多段路徑不算（客人的 /cleaning/{token}、/sign/{code} 都要原樣通過）", () => {
    for (const p of ["/cleaning/abcdef", "/sign/abcdef", "/s/abcdef", "/od/abcdef", "/a/b"]) {
      expect(shortCodeFromPath(p), p).toBeNull();
    }
  });

  it("根路徑與空字串不算", () => {
    expect(shortCodeFromPath("/")).toBeNull();
    expect(shortCodeFromPath("")).toBeNull();
  });

  /**
   * 🔴 這一條是防呆的重點：不要靠人記得「新增頁面時檢查會不會撞短碼」。
   *    直接掃 src/app 的實際頂層路由，撞到就讓測試紅。
   *
   *    會撞的條件是「名稱剛好 6 或 10 字，且完全不含 0/1/i/l/o」，
   *    例如 `/search`。真的需要那個名字時，要嘛改名，要嘛在
   *    signing-link-format.ts 加保留字判斷——但不要默默放過。
   */
  it("src/app 的頂層路由沒有一個會被誤判成短碼", () => {
    const appDir = path.join(process.cwd(), "src", "app");
    const routes = fs
      .readdirSync(appDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      // 略過 Next.js 的特殊目錄：(group)、_private、[dynamic]、@parallel
      .filter((d) => !/^[([_@]/.test(d.name))
      .map((d) => d.name);

    expect(routes.length).toBeGreaterThan(10); // 掃錯目錄時要失敗，不要靜默通過

    const collisions = routes.filter((r) => shortCodeFromPath(`/${r}`) !== null);
    expect(collisions, `這些路由會被短網域吃掉：${collisions.join(", ")}`).toEqual([]);
  });
});
