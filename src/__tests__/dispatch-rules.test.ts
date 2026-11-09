import { describe, expect, it } from "vitest";

import {
  HARD_CAP, MAX_STORAGE_DAYS, SOFT_CAP,
  NOTIFY_LEAD_DAYS,
  driverLoad, isStorageOverdue, productionStage,
  shouldRemindDeliveryNotice, suggestDriver,
} from "@/lib/dispatch-rules";
import { driverNameFromLabelIds, TRELLO } from "@/lib/trello-constants";

describe("派車規則（老闆 2026-11-01 口述，經 Trello 歷史驗證）", () => {
  /**
   * 🔴 這裡原本是 `expect(SOFT_CAP).toBe(4)` 這類恆真句——把常數抄進測試
   *    不驗任何行為，改常數時只會多一個要一起改的地方。
   *    留下來的是「兩者的關係」：常態必須小於能力上限，否則示警邏輯
   *    （overSoft = 超過常態但未超上限）會永遠算不出中間那一檔。
   */
  it("常態門檻必須低於能力上限，否則示警分不出兩檔", () => {
    expect(SOFT_CAP).toBeLessThan(HARD_CAP);
  });

  it("能力上限要容得下歷史最大值（阿信單日 7 趟，做過兩次）", () => {
    expect(HARD_CAP).toBeGreaterThanOrEqual(7);
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

/**
 * 🔴 容量改成「每位司機各自算」（老闆 2026-11-09 拍板）。
 *    先前算當天總趟數，兩種情況都會錯：
 *      - 阿富跑台東那一趟吃掉台北的額度 → 誤報
 *      - 5 趟全壓在阿信身上，看起來跟兩人各 2-3 趟一樣安全 → 該報的沒報
 */
describe("driverLoad — 趟數分到各司機頭上", () => {
  it("同一位司機的趟數要累加，peak 取最高的那位", () => {
    const r = driverLoad([
      { assignedDriver: "阿信" }, { assignedDriver: "阿信" },
      { assignedDriver: "阿信" }, { assignedDriver: "簡先生" },
    ]);
    expect(r.peak).toEqual({ name: "阿信", trips: 3 });
    expect(r.perDriver).toEqual([{ name: "阿信", trips: 3 }, { name: "簡先生", trips: 1 }]);
    expect(r.unassigned).toBe(0);
  });

  it("阿富的台東單不會算進阿信的額度（這是改動的主因）", () => {
    // 總數 5 趟會超過 SOFT_CAP=4，但沒有任何一位司機超過
    const r = driverLoad([
      { assignedDriver: "阿信" }, { assignedDriver: "阿信" },
      { assignedDriver: "阿信" }, { assignedDriver: "阿信" },
      { assignedDriver: "阿富" },
    ]);
    expect(r.peak?.trips).toBe(4);
    expect(r.peak!.trips).toBeLessThanOrEqual(SOFT_CAP); // 不該示警
  });

  it("反過來：全部壓在一個人身上要抓出來", () => {
    const r = driverLoad(Array.from({ length: 9 }, () => ({ assignedDriver: "阿信" })));
    expect(r.peak?.trips).toBe(9);
    expect(r.peak!.trips).toBeGreaterThan(HARD_CAP); // 要示警
  });

  it("未指派的不併進任何人，單獨回報（猜成主力會算錯別人的帳）", () => {
    const r = driverLoad([
      { assignedDriver: "" }, { assignedDriver: "" }, { assignedDriver: "阿信" },
    ]);
    expect(r.unassigned).toBe(2);
    expect(r.peak).toEqual({ name: "阿信", trips: 1 });
    expect(r.perDriver).toHaveLength(1);
  });

  it("空的一天：peak 為 null，呼叫端不能當成 0 趟以外的東西", () => {
    const r = driverLoad([]);
    expect(r.peak).toBeNull();
    expect(r.perDriver).toEqual([]);
    expect(r.unassigned).toBe(0);
  });
});

describe("driverNameFromLabelIds — 從卡片標籤認司機", () => {
  it("認得現役四位司機", () => {
    expect(driverNameFromLabelIds([TRELLO.LABELS.DRIVER_SHIN])).toBe("阿信");
    expect(driverNameFromLabelIds([TRELLO.LABELS.DRIVER_FU])).toBe("阿富");
    expect(driverNameFromLabelIds([TRELLO.LABELS.DRIVER_YA])).toBe("葉先生");
    expect(driverNameFromLabelIds([TRELLO.LABELS.DRIVER_JIAN])).toBe("簡先生");
  });

  it("認得已停止配合的羅先生／范先生——歷史卡片上還掛著", () => {
    expect(driverNameFromLabelIds([TRELLO.LABELS.DRIVER_LOU])).toBe("羅先生");
    expect(driverNameFromLabelIds([TRELLO.LABELS.DRIVER_FAN])).toBe("范先生");
  });

  it("沒有司機標籤回空字串，不猜成主力司機", () => {
    expect(driverNameFromLabelIds([TRELLO.LABELS.URGENT])).toBe("");
    expect(driverNameFromLabelIds([])).toBe("");
    expect(driverNameFromLabelIds(undefined)).toBe("");
  });

  it("夾雜其他標籤時仍找得到司機", () => {
    expect(driverNameFromLabelIds([TRELLO.LABELS.URGENT, TRELLO.LABELS.ASSEMBLY, TRELLO.LABELS.DRIVER_FU]))
      .toBe("阿富");
  });
});

/**
 * 🔴 老闆的「排定後提前 2-3 天通知客人」原本是死規則：NOTIFY_LEAD_DAYS 被
 *    import、被序列化給前端、被存進 useState，卻沒有一行拿它做判斷。
 *    2026-11-09 才做得到——因為那天才知道 Trello 的 dueComplete 就是
 *    「出貨通知已發」的標記，在那之前系統裡沒有「已通知」狀態可以比對。
 */
describe("shouldRemindDeliveryNotice — 配送前通知客人", () => {
  const base = { status: "scheduled", today: "2026-11-09", cardOnBoard: true, alreadyNotified: false };

  it("進入通知期（剩 3 天以內）要提醒", () => {
    for (const [date, days] of [["2026-11-12", 3], ["2026-11-11", 2], ["2026-11-10", 1]] as const) {
      const r = shouldRemindDeliveryNotice({ ...base, chosenDate: date });
      expect(r.remind, date).toBe(true);
      expect(r.daysLeft).toBe(days);
    }
  });

  it("今天就要配送＝最緊急，一定要提醒", () => {
    const r = shouldRemindDeliveryNotice({ ...base, chosenDate: "2026-11-09" });
    expect(r.remind).toBe(true);
    expect(r.daysLeft).toBe(0);
    expect(r.reason).toContain("今天");
  });

  it("還太早（剩 4 天）先不吵", () => {
    const r = shouldRemindDeliveryNotice({ ...base, chosenDate: "2026-11-13" });
    expect(r.remind).toBe(false);
    expect(r.daysLeft).toBe(4);
  });

  it("出貨通知已發就不再提醒", () => {
    const r = shouldRemindDeliveryNotice({ ...base, chosenDate: "2026-11-10", alreadyNotified: true });
    expect(r.remind).toBe(false);
    expect(r.reason).toContain("已發");
  });

  it("配送日已過不歸這一類（那是遲到，另有機制）", () => {
    const r = shouldRemindDeliveryNotice({ ...base, chosenDate: "2026-11-08" });
    expect(r.remind).toBe(false);
  });

  it("卡片不在板上時不吵——判斷不了就別發假警報", () => {
    const r = shouldRemindDeliveryNotice({ ...base, chosenDate: "2026-11-10", cardOnBoard: false });
    expect(r.remind).toBe(false);
    expect(r.reason).toContain("板上");
  });

  it("取消的單不提醒", () => {
    const r = shouldRemindDeliveryNotice({ ...base, chosenDate: "2026-11-10", status: "cancelled" });
    expect(r.remind).toBe(false);
  });

  it("還沒排配送日的不提醒", () => {
    expect(shouldRemindDeliveryNotice({ ...base, chosenDate: "" }).remind).toBe(false);
  });

  it("壞日期不丟錯、也不亂發", () => {
    expect(shouldRemindDeliveryNotice({ ...base, chosenDate: "not-a-date" }).remind).toBe(false);
  });

  it("門檻跟著 NOTIFY_LEAD_DAYS 走，不是寫死的 3", () => {
    // 剛好等於門檻要發、超過一天不發——這組斷言在常數被調整時仍然成立。
    // 🔴 日期加減一律用 UTC 午夜當基準：先前這裡用 `+08:00` 解析再 toISOString()，
    //    等於把結果轉回 UTC，少 8 小時就少一天，測試自己算錯而不是實作錯。
    const addDays = (ymd: string, n: number) =>
      new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
    const onEdge = addDays("2026-11-09", NOTIFY_LEAD_DAYS);
    const past = addDays("2026-11-09", NOTIFY_LEAD_DAYS + 1);
    expect(shouldRemindDeliveryNotice({ ...base, chosenDate: onEdge }).remind).toBe(true);
    expect(shouldRemindDeliveryNotice({ ...base, chosenDate: past }).remind).toBe(false);
  });
});
