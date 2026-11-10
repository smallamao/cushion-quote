import { describe, expect, it } from "vitest";

import {
  HARD_CAP, MAX_STORAGE_DAYS, SOFT_CAP,
  NOTIFY_LEAD_DAYS,
  driverLoad, isStorageOverdue, productionStage,
  shouldRemindDeliveryNotice, shouldRemindProductionOverdue, suggestDriver,
} from "@/lib/dispatch-rules";
import { productionWindow } from "@/lib/production-window";
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

  /**
   * 🔴 2026-11-10 改了錨點：原本吃卡片的 dueDate，而那是專案自己宣告不可信的
   *    欄位（實測準確度 29%、誤差 −20～+18 天）。現在吃生產週，由
   *    productionWindow() 推出製作完成日（生產週一 +9）。
   *    2026-10-22 是週四 → 該週週一 10-19 → 完工日 10-29（2026-11-10 起完工區間改為週一+4，完工日＝週一+10）。
   */
  it("從製作完成日（生產週一+10）起算，超過兩週才算寄放超期", () => {
    const WEEK = "2026-10-22";                       // 該週完工日 = 2026-10-29
    expect(productionWindow(WEEK).end).toBe("2026-10-29");  // 先確認前提
    expect(isStorageOverdue(WEEK, "2026-11-12")).toBe(false); // 剛好 14 天
    expect(isStorageOverdue(WEEK, "2026-11-13")).toBe(true);  // 15 天
    expect(isStorageOverdue(WEEK, "2026-10-30")).toBe(false); // 2 天
    expect(MAX_STORAGE_DAYS).toBe(14);
  });

  it("同一生產週的任何一天都得到同樣的完工日（整週共用區間）", () => {
    // 老闆 2026-09-30：同一週一起生產，不看各筆排程日
    const days = ["2026-10-19", "2026-10-20", "2026-10-22", "2026-10-25"]; // 週一～週日
    const results = days.map((d) => isStorageOverdue(d, "2026-11-13"));
    expect(new Set(results).size, "同週不同天算出不同答案").toBe(1);
    expect(results[0]).toBe(true);
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

  /**
   * 🔴 2026-11-09 審查抓到的漏報：司機標籤是內勤處理出貨通知時才掛上的，
   *    所以「還沒處理的未來日子」大多沒標籤。只看 peak 會把
   *    「5 趟未指派 + 1 趟阿信」算成 1 趟，完全不示警。
   *    worstCase 不猜人，只承認這些趟可能落在同一個人身上。
   */
  it("worstCase＝最忙的司機 ＋ 全部未指派（補上只看 peak 的漏報）", () => {
    const r = driverLoad([
      ...Array.from({ length: 5 }, () => ({ assignedDriver: "" })),
      { assignedDriver: "阿信" },
    ]);
    expect(r.peak).toEqual({ name: "阿信", trips: 1 });
    expect(r.unassigned).toBe(5);
    expect(r.worstCase).toBe(6);        // ← 才是該用來示警的數字
  });

  it("全部都有指派時，worstCase 等於 peak（不會憑空加料）", () => {
    const r = driverLoad([
      { assignedDriver: "阿信" }, { assignedDriver: "阿信" }, { assignedDriver: "阿富" },
    ]);
    expect(r.worstCase).toBe(2);
    expect(r.worstCase).toBe(r.peak?.trips);
  });

  it("全部未指派時，worstCase 等於總趟數", () => {
    const r = driverLoad(Array.from({ length: 4 }, () => ({ assignedDriver: "" })));
    expect(r.peak).toBeNull();
    expect(r.worstCase).toBe(4);
  });

  it("空的一天 worstCase 為 0", () => {
    expect(driverLoad([]).worstCase).toBe(0);
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
  const READY = TRELLO.LISTS.WAIT_SHIPPING;
  const PROD = TRELLO.LISTS.PRODUCTION;
  const base = {
    status: "scheduled", today: "2026-11-09", idList: READY, alreadyNotified: false,
    readyList: READY, productionList: PROD,
  };

  it("待出貨＋進入通知期（剩 3 天以內）→ 催去發通知", () => {
    for (const [date, days] of [["2026-11-12", 3], ["2026-11-11", 2], ["2026-11-10", 1]] as const) {
      const r = shouldRemindDeliveryNotice({ ...base, chosenDate: date });
      expect(r.remind, date).toBe(true);
      expect(r.daysLeft).toBe(days);
      expect(r.kind).toBe("notify");
    }
  });

  it("今天就要配送＝最緊急，一定要提醒", () => {
    const r = shouldRemindDeliveryNotice({ ...base, chosenDate: "2026-11-09" });
    expect(r.remind).toBe(true);
    expect(r.daysLeft).toBe(0);
    expect(r.reason).toContain("今天");
  });

  /**
   * 🔴 這條是 2026-11-09 審查抓到的：原本只判斷「在不在板上」，而作廢的卡
   *    **還在板上**。同一支 cron 的自動取消刻意不動 confirmed／scheduled
   *    （客人簽名的存證），所以一張簽過名又被拖進作廢的單會被天天催四天。
   */
  it("卡片在「Fail 作廢」清單 → 一律不催（即使狀態還沒變成 cancelled）", () => {
    const r = shouldRemindDeliveryNotice({
      ...base, chosenDate: "2026-11-10", idList: TRELLO.LISTS.FAILED, status: "scheduled",
    });
    expect(r.remind).toBe(false);
    expect(r.kind).toBe("none");
  });

  it("還在「生產中」→ 要提醒，但動作是看進度不是發通知", () => {
    const r = shouldRemindDeliveryNotice({ ...base, chosenDate: "2026-11-10", idList: PROD });
    expect(r.remind).toBe(true);
    expect(r.kind).toBe("production_behind");
  });

  it("已出貨／待驗收／完成／還沒進生產的清單都不催", () => {
    for (const list of [
      TRELLO.LISTS.SHIPPED, TRELLO.LISTS.WAIT_REVIEW,
      TRELLO.LISTS.COMPLETED, TRELLO.LISTS.ORDER, TRELLO.LISTS.REQUEST,
    ]) {
      const r = shouldRemindDeliveryNotice({ ...base, chosenDate: "2026-11-10", idList: list });
      expect(r.remind, list).toBe(false);
    }
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
    expect(shouldRemindDeliveryNotice({ ...base, chosenDate: "2026-11-08" }).remind).toBe(false);
  });

  it("卡片不在板上（已封存）時不吵——判斷不了就別發假警報", () => {
    const r = shouldRemindDeliveryNotice({ ...base, chosenDate: "2026-11-10", idList: "" });
    expect(r.remind).toBe(false);
    expect(r.reason).toContain("板上");
  });

  it("取消的單不提醒", () => {
    expect(shouldRemindDeliveryNotice({ ...base, chosenDate: "2026-11-10", status: "cancelled" }).remind).toBe(false);
  });

  it("還沒排配送日的不提醒", () => {
    expect(shouldRemindDeliveryNotice({ ...base, chosenDate: "" }).remind).toBe(false);
  });

  it("壞日期不丟錯、也不亂發", () => {
    expect(shouldRemindDeliveryNotice({ ...base, chosenDate: "not-a-date" }).remind).toBe(false);
  });

  it("門檻跟著 NOTIFY_LEAD_DAYS 走，不是寫死的 3", () => {
    // 🔴 日期加減一律用 UTC 午夜當基準：先前這裡用 `+08:00` 解析再 toISOString()，
    //    等於把結果轉回 UTC，少 8 小時就少一天，測試自己算錯而不是實作錯。
    const addDays = (ymd: string, n: number) =>
      new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
    expect(shouldRemindDeliveryNotice({ ...base, chosenDate: addDays("2026-11-09", NOTIFY_LEAD_DAYS) }).remind).toBe(true);
    expect(shouldRemindDeliveryNotice({ ...base, chosenDate: addDays("2026-11-09", NOTIFY_LEAD_DAYS + 1) }).remind).toBe(false);
  });
});

/**
 * 🔴 2026-11-09 審查抓到：現役司機的事實來源是司機設定表（Sheets，老闆可從
 *    設定頁新增並填 labelId）。原本這裡是一張硬編碼對照表，等於第三份真相——
 *    從設定頁新增的司機會永遠被算成「未指派」。
 */
describe("driverNameFromLabelIds — 現役名單由外部傳入", () => {
  it("認得設定表新增的司機（不在程式的 DRIVER_LIST 裡）", () => {
    const roster = [{ labelId: "brand-new-label-id", title: "新來的王先生 (小貨車)[ABC-1234]" }];
    expect(driverNameFromLabelIds(["brand-new-label-id"], roster)).toBe("新來的王先生");
  });

  it("括號與車號會被去掉，徽章才放得下", () => {
    const roster = [{ labelId: "L1", title: "阿信 (兩人）[BXH-6828]" }];
    expect(driverNameFromLabelIds(["L1"], roster)).toBe("阿信");
  });

  it("即使傳了新名單，仍認得已停止配合的歷史標籤", () => {
    const roster = [{ labelId: "L1", title: "阿信" }];
    expect(driverNameFromLabelIds([TRELLO.LABELS.DRIVER_LOU], roster)).toBe("羅先生");
    expect(driverNameFromLabelIds([TRELLO.LABELS.DRIVER_FAN], roster)).toBe("范先生");
  });

  it("不傳名單時退回 DRIVER_LIST", () => {
    expect(driverNameFromLabelIds([TRELLO.LABELS.DRIVER_FU])).toBe("阿富");
  });

  it("名單裡 labelId 空白的司機不會誤配到沒有標籤的卡", () => {
    const roster = [{ labelId: "", title: "還沒設標籤的人" }];
    expect(driverNameFromLabelIds([], roster)).toBe("");
    expect(driverNameFromLabelIds([""], roster)).toBe("");
  });
});

/**
 * 🔴 2026-11-10 實查 P6282 王祖均：製作完成已過 6 天、還沒排配送日，
 *    但它穿過了全部三道既有催辦——叫料催辦只掃 status==="sent"（它是
 *    confirmed_offline）、配送通知催辦要有 chosenDate（它沒有）、
 *    自動結案只處理已出貨的卡。於是完全隱形。
 *
 *    但同一天也有 6 張超期的單，其中 5 張通知已發、最近還有動作——
 *    那是有人在處理的老單。全部都催就是每天 6 則噪音。
 */
describe("shouldRemindProductionOverdue — 完工了卻沒排配送", () => {
  const READY = TRELLO.LISTS.WAIT_SHIPPING;
  const PROD = TRELLO.LISTS.PRODUCTION;
  const base = {
    productionEnd: "2026-11-04", today: "2026-11-10", chosenDate: "",
    status: "confirmed_offline", alreadyNotified: false,
    idList: PROD, readyList: READY, productionList: PROD,
  };

  it("完工區間已過、沒排配送、沒通知 → 要催（P6282 的情形）", () => {
    const r = shouldRemindProductionOverdue(base);
    expect(r.remind).toBe(true);
    expect(r.overdueDays).toBe(6);
  });

  it("待出貨清單也算（做完了但沒排車一樣會卡住）", () => {
    expect(shouldRemindProductionOverdue({ ...base, idList: READY }).remind).toBe(true);
  });

  it("已排定配送日 → 不催（歸配送通知那一類，避免兩邊都響）", () => {
    const r = shouldRemindProductionOverdue({ ...base, chosenDate: "2026-11-15" });
    expect(r.remind).toBe(false);
    expect(r.reason).toContain("配送通知");
  });

  it("出貨通知已發 → 不催（有人在處理的老單，就是那 5 張）", () => {
    const r = shouldRemindProductionOverdue({ ...base, alreadyNotified: true });
    expect(r.remind).toBe(false);
    expect(r.reason).toContain("有人在處理");
  });

  it("還在製作區間內 → 不催", () => {
    expect(shouldRemindProductionOverdue({ ...base, productionEnd: "2026-11-20" }).remind).toBe(false);
    // 剛好今天完工也不算超期
    expect(shouldRemindProductionOverdue({ ...base, productionEnd: "2026-11-10" }).remind).toBe(false);
  });

  it("排程日沒填 → 算不出完工日，不猜也不催", () => {
    const r = shouldRemindProductionOverdue({ ...base, productionEnd: "" });
    expect(r.remind).toBe(false);
    expect(r.reason).toContain("不猜");
  });

  it("取消的不催", () => {
    expect(shouldRemindProductionOverdue({ ...base, status: "cancelled" }).remind).toBe(false);
  });

  it("已出貨／完成等清單不催", () => {
    for (const list of [TRELLO.LISTS.SHIPPED, TRELLO.LISTS.COMPLETED, TRELLO.LISTS.ORDER, TRELLO.LISTS.FAILED]) {
      expect(shouldRemindProductionOverdue({ ...base, idList: list }).remind, list).toBe(false);
    }
  });

  it("壞日期不丟錯、也不亂催", () => {
    expect(shouldRemindProductionOverdue({ ...base, productionEnd: "bad" }).remind).toBe(false);
    expect(shouldRemindProductionOverdue({ ...base, today: "bad" }).remind).toBe(false);
  });
});
