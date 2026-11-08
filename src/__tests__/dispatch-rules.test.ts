import { describe, expect, it } from "vitest";

import {
  HARD_CAP, MAX_ROUTES, MAX_STORAGE_DAYS, SOFT_CAP,
  isStorageOverdue, productionStage, suggestDriver,
} from "@/lib/dispatch-rules";

describe("派車規則（老闆 2026-11-01 口述，經 Trello 歷史驗證）", () => {
  it("容量：軟上限 4、硬上限 6", () => {
    expect(SOFT_CAP).toBe(4);
    expect(HARD_CAP).toBe(6);
    expect(SOFT_CAP).toBeLessThan(HARD_CAP);
  });

  it("一天最多 3 條路線", () => {
    expect(MAX_ROUTES).toBe(3);
  });

  it("東部派阿富、南部派葉先生", () => {
    expect(suggestDriver("花蓮縣").name).toBe("阿富");
    expect(suggestDriver("台東縣").name).toBe("阿富");
    expect(suggestDriver("高雄市").name).toBe("葉先生");
    expect(suggestDriver("高雄市").note).toContain("回頭車");
  });

  it("北部四縣市派阿信，並提示簡先生可支援", () => {
    for (const c of ["台北市", "新北市", "桃園市", "新竹市", "新竹縣"]) {
      const d = suggestDriver(c);
      expect(d.name).toBe("阿信");
      expect(d.note).toContain("簡先生");
    }
  });

  it("臺／台視為同一縣市", () => {
    expect(suggestDriver("臺東縣").name).toBe("阿富");
  });

  it("地址解析不出縣市時不亂建議", () => {
    expect(suggestDriver("").name).toBe("");
    expect(suggestDriver("").note).toContain("人工確認");
  });

  it("完工後超過兩週才算寄放超期", () => {
    expect(isStorageOverdue("2026-10-22", "2026-11-05")).toBe(false); // 剛好 14 天
    expect(isStorageOverdue("2026-10-22", "2026-11-06")).toBe(true);  // 15 天
    expect(isStorageOverdue("2026-10-22", "2026-10-25")).toBe(false);
    expect(MAX_STORAGE_DAYS).toBe(14);
  });

  it("日期壞掉時不得誤報超期", () => {
    expect(isStorageOverdue("", "2026-11-06")).toBe(false);
    expect(isStorageOverdue("2026-10-22", "")).toBe(false);
  });
});

describe("productionStage：製作進度看卡片在哪個清單", () => {
  it("待出貨＝師傅做完了", () => {
    const s = productionStage("5db80ff546d13017935c55a9");
    expect(s.label).toContain("待出貨");
    expect(s.plannable).toBe(true);
  });

  it("還在 Order 訂單是收時段時的正常位置，不可當成異常排除", () => {
    // 實際順序：Order 訂單 → 發叫料確認收時段 → 生成排程工作單 → Production 排程
    const s = productionStage("5cefef9f9c7cca170f5b823b");
    expect(s.key).toBe("pre_production");
    expect(s.plannable).toBe(true);
  });

  it("已出貨卻還掛待排車＝資料沒結案，才是真正的異常", () => {
    expect(productionStage("5f70224034d940207767d3a5").key).toBe("shipped");
    expect(productionStage("5f70224034d940207767d3a5").plannable).toBe(false);
  });

  it("卡片被刪或清單不認得時回「位置不明」，不可當成可排車", () => {
    expect(productionStage(undefined).key).toBe("unknown");
    expect(productionStage("不存在的清單").plannable).toBe(false);
  });
});
