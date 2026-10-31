import { describe, it, expect } from "vitest";

import {
  composeScheduledTime,
  isCleaningLinkExpired,
  isConfirmablePeriod,
  validateProposedSlots,
} from "@/lib/cleaning-schedule";

// 🔴 2026-10-19 實際踩到：Fiona 三個時段填「10/21 上午、10/21 下午、10/22 皆可」，
//    師傅點了 10/22 那格 → 確認結果變成「10/22 皆可」，售後單的 scheduledTime 空白。
//    師傅其實是說「週四 13:00 後可以」，但系統沒有地方存得下。
//    後端早就支援 body.period 覆寫，是師傅那頁沒給他輸入的地方。
describe("isConfirmablePeriod — 皆可不能當成確認結果", () => {
  it("具體時段可以確認", () => {
    expect(isConfirmablePeriod("上午")).toBe(true);
    expect(isConfirmablePeriod("下午")).toBe(true);
    expect(isConfirmablePeriod("晚上")).toBe(true);
  });

  it("「皆可」不行——那不是一個可執行的時間", () => {
    expect(isConfirmablePeriod("皆可")).toBe(false);
  });

  it("空值或亂填也不行（預設拒絕）", () => {
    expect(isConfirmablePeriod("")).toBe(false);
    expect(isConfirmablePeriod(undefined)).toBe(false);
    expect(isConfirmablePeriod("隨便")).toBe(false);
  });
});

describe("composeScheduledTime — 寫進售後單的時段字串", () => {
  it("沒有備註就只有時段", () => {
    expect(composeScheduledTime("下午", "")).toBe("下午");
    expect(composeScheduledTime("上午", undefined)).toBe("上午");
  });

  it("有備註就一起寫進去，師傅的實際限制才留得住", () => {
    expect(composeScheduledTime("下午", "13:00 後")).toBe("下午（13:00 後）");
  });

  it("備註前後空白要去掉", () => {
    expect(composeScheduledTime("下午", "  13:00 後  ")).toBe("下午（13:00 後）");
  });

  it("備註太長要截斷，不要把整段對話貼進欄位", () => {
    const long = "一".repeat(80);
    const out = composeScheduledTime("下午", long);
    expect(out.length).toBeLessThanOrEqual(60);
    expect(out.startsWith("下午（")).toBe(true);
  });

  it("備註已經含括號不會變成雙層括號", () => {
    expect(composeScheduledTime("下午", "（13:00 後）")).toBe("下午（13:00 後）");
  });
});

describe("isCleaningLinkExpired — 媒合完成後七天失效", () => {
  // 老闆 2026-10-19：「客戶端、師傅端都確認完成代表媒合成功，售後服務單也成立了，
  // 這兩個連結應該七天後失效」。
  //
  // 實作成「確認日 或 預約到府日，取晚的那個 +7 天」——如果客人約的是三週後，
  // 照確認日算連結會在師傅到府之前就死掉，當天查無地址電話。
  const NOW = Date.parse("2026-10-19T03:00:00Z");
  const DAY = 86_400_000;
  const base = {
    createdAt: "2026-10-19T02:30:00Z",
    updatedAt: "2026-10-19T02:54:00Z",
    confirmedDate: "2026-10-22",
  };

  it("還沒確認 → 沿用 90 天的通用規則，不受七天影響", () => {
    expect(isCleaningLinkExpired({ ...base, status: "awaiting_customer" }, NOW)).toBe(false);
    expect(isCleaningLinkExpired({ ...base, status: "awaiting_tech" }, NOW)).toBe(false);
    // 但超過 90 天還是要過期
    const old = { ...base, createdAt: "2026-01-01T00:00:00Z", status: "awaiting_customer" as const };
    expect(isCleaningLinkExpired(old, NOW)).toBe(true);
  });

  it("剛確認完 → 還有效（師傅要靠它拿地址電話）", () => {
    expect(isCleaningLinkExpired({ ...base, status: "confirmed" }, NOW)).toBe(false);
  });

  it("到府日之後七天內 → 還有效", () => {
    const sixDaysAfterVisit = Date.parse("2026-10-22T00:00:00Z") + 6 * DAY;
    expect(isCleaningLinkExpired({ ...base, status: "confirmed" }, sixDaysAfterVisit)).toBe(false);
  });

  it("到府日之後超過七天 → 失效", () => {
    const eightDaysAfterVisit = Date.parse("2026-10-22T00:00:00Z") + 8 * DAY;
    expect(isCleaningLinkExpired({ ...base, status: "confirmed" }, eightDaysAfterVisit)).toBe(true);
  });

  it("遠期預約不會在到府前失效（這是照確認日算會出的事）", () => {
    const farVisit = { ...base, confirmedDate: "2026-11-15", status: "confirmed" as const };
    // 確認後第 10 天：照「確認日+7」早就死了，照「到府日+7」還活著
    expect(isCleaningLinkExpired(farVisit, NOW + 10 * DAY)).toBe(false);
    // 到府日過後第 8 天才失效
    expect(isCleaningLinkExpired(farVisit, Date.parse("2026-11-15T00:00:00Z") + 8 * DAY)).toBe(true);
  });

  it("師傅回報都不行 → 不算媒合成功，沿用 90 天", () => {
    expect(isCleaningLinkExpired({ ...base, status: "tech_rejected" }, NOW + 10 * DAY)).toBe(false);
  });

  it("確認了卻沒有日期（異常資料）→ 用更新時間算，不要變成永久有效", () => {
    const noDate = { ...base, confirmedDate: "", status: "confirmed" as const };
    expect(isCleaningLinkExpired(noDate, NOW)).toBe(false);
    expect(isCleaningLinkExpired(noDate, NOW + 8 * DAY)).toBe(true);
  });
});

describe("validateProposedSlots", () => {
  const d = (date: string) => ({ date });

  it("三組不同日期：通過", () => {
    expect(validateProposedSlots([d("2026-11-03"), d("2026-11-04"), d("2026-11-05")])).toBeNull();
  });

  it("只填一組：擋下（老闆 2026-10-31：客人只選一組後續很困擾）", () => {
    expect(validateProposedSlots([d("2026-11-03")])).toBe("請完整填寫三組方便的日期時段");
  });

  it("只填兩組：一樣擋下", () => {
    expect(validateProposedSlots([d("2026-11-03"), d("2026-11-04")])).toBe("請完整填寫三組方便的日期時段");
  });

  it("空白日期不算一組", () => {
    expect(validateProposedSlots([d("2026-11-03"), d(""), d("2026-11-05")])).toBe(
      "請完整填寫三組方便的日期時段",
    );
  });

  it("三組填同一天：等於沒給選擇，擋下", () => {
    expect(validateProposedSlots([d("2026-11-03"), d("2026-11-03"), d("2026-11-03")])).toBe(
      "三組請填不同的日期，師傅才有得選",
    );
  });

  it("其中兩組重複：也擋下", () => {
    expect(validateProposedSlots([d("2026-11-03"), d("2026-11-03"), d("2026-11-05")])).toBe(
      "三組請填不同的日期，師傅才有得選",
    );
  });

  it("超過三組且日期互異：通過（API 會先截成三組）", () => {
    expect(
      validateProposedSlots([d("2026-11-03"), d("2026-11-04"), d("2026-11-05"), d("2026-11-06")]),
    ).toBeNull();
  });
});
