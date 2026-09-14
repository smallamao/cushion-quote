import { describe, expect, it } from "vitest";

import { buildNotionTitle } from "@/lib/notion-title";

describe("buildNotionTitle", () => {
  it("散客帶 S 編號：原樣使用，新案子自然會有新編號", () => {
    expect(buildNotionTitle("S993 鄭鳳珍", "", "")).toBe("S993 鄭鳳珍");
  });

  it("B2B 無 S 編號：補上案名，同公司不同案才不會互相覆蓋", () => {
    expect(buildNotionTitle("禾雅窗飾美學有限公司", "新莊案 臥榻坐墊", "")).toBe(
      "禾雅窗飾美學有限公司｜新莊案 臥榻坐墊",
    );
  });

  it("案名已用公司簡稱開頭時去重，不要出現兩次", () => {
    expect(buildNotionTitle("禾雅窗飾美學有限公司", "禾雅窗飾｜新莊案 臥榻坐墊", "")).toBe(
      "禾雅窗飾美學有限公司｜新莊案 臥榻坐墊",
    );
    expect(
      buildNotionTitle("綜合室內裝修工程行", "綜合室內裝修｜JD-205B 卡座繃布板", ""),
    ).toBe("綜合室內裝修工程行｜JD-205B 卡座繃布板");
  });

  it("沒有案名時退回方案名稱", () => {
    expect(buildNotionTitle("禾雅窗飾美學有限公司", "", "床頭繃布")).toBe(
      "禾雅窗飾美學有限公司｜床頭繃布",
    );
  });

  it("什麼都沒有時就用客戶名", () => {
    expect(buildNotionTitle("禾雅窗飾美學有限公司", "", "")).toBe("禾雅窗飾美學有限公司");
  });
});
