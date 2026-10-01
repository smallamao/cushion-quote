import { describe, expect, it } from "vitest";

import {
  CONCRETE_DELIVERY_PERIODS,
  DELIVERY_PERIODS,
  normalizeDeliveryPeriod,
  periodStartHour,
  toDueIso,
  splitOrderCardName,
  type MaterialConfirm,
  isGatingDrift,
  isNonDeliveryDay,
  earliestDeliveryDate,
  holidayName,
  isTestConfirm,
  realCardId,
  TEST_CARD_PREFIX,
} from "@/lib/material-confirm-types";
import {
  SHEET_HEADERS,
  confirmToRow,
  generateToken,
  rowToConfirm,
} from "@/lib/material-confirm-sheet";
import { candidateUrls, productionWindow, rocDateLabel, toTaipeiYmd, weekMonday } from "@/lib/trello-server";

describe("splitOrderCardName", () => {
  it("拆出訂單編號與客戶姓名", () => {
    expect(splitOrderCardName("P6247 劉繼芳")).toEqual({ orderNumber: "P6247", customerName: "劉繼芳" });
  });

  it("興旺板的 S 開頭單也認得", () => {
    expect(splitOrderCardName("S1075 王小明")).toEqual({ orderNumber: "S1075", customerName: "王小明" });
  });

  it("姓名含空白時保留完整姓名", () => {
    expect(splitOrderCardName("P6242  劉 佳穎 ")).toEqual({ orderNumber: "P6242", customerName: "劉 佳穎" });
  });

  it("抓不到編號時整串當姓名，不硬猜編號", () => {
    expect(splitOrderCardName("展示品勿動")).toEqual({ orderNumber: "", customerName: "展示品勿動" });
  });
});

describe("送貨時段", () => {
  it("四個時段加皆可，共五個選項", () => {
    expect(DELIVERY_PERIODS).toHaveLength(5);
    expect(DELIVERY_PERIODS).toContain("上午 10:00-12:00");
    expect(DELIVERY_PERIODS).toContain("傍晚 17:00-19:00");
    expect(DELIVERY_PERIODS).toContain("皆可");
  });

  // 哨兵：到府清潔有「晚上」時段，送貨沒有（老闆 2026-09-26 定案）。
  // 若日後有人為了共用而把清潔的時段表接過來，這條會先擋下。
  it("不可混入到府清潔的「晚上」時段", () => {
    expect(DELIVERY_PERIODS as string[]).not.toContain("晚上");
    expect(normalizeDeliveryPeriod("晚上")).toBe("皆可");
  });

  it("未知或空值一律退回「皆可」，不丟資料也不亂選時段", () => {
    expect(normalizeDeliveryPeriod(undefined)).toBe("皆可");
    expect(normalizeDeliveryPeriod("")).toBe("皆可");
    expect(normalizeDeliveryPeriod("半夜三點")).toBe("皆可");
  });

  it("合法時段原樣保留", () => {
    expect(normalizeDeliveryPeriod("下午 15:00-17:00")).toBe("下午 15:00-17:00");
  });
});

const sample: MaterialConfirm = {
  token: "abc123XYZ_-0",
  cardId: "5f0000000000000000000001",
  orderNumber: "P6247",
  customerName: "劉繼芳",
  status: "confirmed",
  weekKey: "2026-09-28",
  dueDate: "2026-10-03T05:00:00.000Z",
  preferredSlots: [
    { date: "2026-10-05", period: "下午 13:00-15:00" },
    { date: "2026-10-06", period: "皆可" },
  ],
  signerName: "劉繼芳",
  signatureUrl: "https://res.cloudinary.com/x/sig.png",
  confirmedAt: "2026-09-26T15:41:00.000Z",
  disputeNote: "",
  signerIp: "1.2.3.4",
  signerUserAgent: "Mozilla/5.0",
  createdAt: "2026-09-26T10:00:00.000Z",
  updatedAt: "2026-09-26T15:41:00.000Z",
  driverToken: "",
  chosenDate: "",
  chosenPeriod: "",
  notifiedAt: "",
  driverBatchToken: "",
};

describe("叫料確認 工作表列對應", () => {
  it("欄數與表頭一致（欄序是唯一真相，改欄位必須同步）", () => {
    expect(confirmToRow(sample)).toHaveLength(SHEET_HEADERS.length);
    expect(SHEET_HEADERS).toHaveLength(21);
  });

  it("寫出再讀回完全一致", () => {
    expect(rowToConfirm(confirmToRow(sample))).toEqual(sample);
  });

  it("讀到不足長度的舊列不會爆，缺的欄位給安全預設", () => {
    const partial = rowToConfirm(["tok", "card1", "P6001", "陳先生"]);
    expect(partial.token).toBe("tok");
    expect(partial.status).toBe("sent");
    expect(partial.preferredSlots).toEqual([]);
    expect(partial.chosenPeriod).toBe("");
  });

  it("希望時段 JSON 壞掉時回空陣列，不讓整張看板掛掉", () => {
    const row = confirmToRow(sample);
    row[7] = "{壞掉的JSON";
    expect(rowToConfirm(row).preferredSlots).toEqual([]);
  });

  it("希望時段最多只收三組", () => {
    const row = confirmToRow(sample);
    row[7] = JSON.stringify([
      { date: "2026-10-05", period: "皆可" },
      { date: "2026-10-06", period: "皆可" },
      { date: "2026-10-07", period: "皆可" },
      { date: "2026-10-08", period: "皆可" },
    ]);
    expect(rowToConfirm(row).preferredSlots).toHaveLength(3);
  });

  it("時段欄被人工改成清潔的「晚上」時，讀回會正規化成皆可", () => {
    const row = confirmToRow(sample);
    row[7] = JSON.stringify([{ date: "2026-10-05", period: "晚上" }]);
    expect(rowToConfirm(row).preferredSlots[0].period).toBe("皆可");
  });
});

describe("token", () => {
  it("是短的 URL-safe 字串（要貼進 LINE）", () => {
    const t = generateToken();
    expect(t).toHaveLength(12);
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("不重複", () => {
    const set = new Set(Array.from({ length: 200 }, () => generateToken()));
    expect(set.size).toBe(200);
  });
});

// Trello 存 UTC、老闆看台灣時間，差 8 小時會跨日——這是這個專案反覆踩過的坑。
describe("台灣時區換算", () => {
  it("UTC 當日轉台灣同日", () => {
    expect(toTaipeiYmd("2026-09-26T05:00:00.000Z")).toBe("2026-09-26");
  });

  it("UTC 16:00 之後在台灣已經是隔天", () => {
    expect(toTaipeiYmd("2026-09-26T16:00:00.000Z")).toBe("2026-09-27");
  });

  it("空字串或壞值回空字串，不回 1970", () => {
    expect(toTaipeiYmd("")).toBe("");
    expect(toTaipeiYmd("not-a-date")).toBe("");
  });

  it("民國年標籤對齊既有待辦事項寫法", () => {
    expect(rocDateLabel(new Date("2026-09-26T05:00:00.000Z"))).toBe("115/9/26");
  });

  it("民國年標籤也照台灣時區跨日", () => {
    expect(rocDateLabel(new Date("2026-09-26T16:00:00.000Z"))).toBe("115/9/27");
  });

  it("跨年邊界", () => {
    expect(rocDateLabel(new Date("2026-12-31T16:00:00.000Z"))).toBe("116/1/1");
  });
});

// 客人是據這張照片簽名負責的，取圖尺寸不是美觀問題而是看不看得懂的問題。
describe("訂單照片取圖順序", () => {
  // 取自 2026-09-26 P6247 劉繼芳 的真實附件
  const imagePng = {
    id: "a1", name: "image.png", mimeType: "image/png", date: "2026-09-13T00:00:00.000Z",
    isUpload: true, url: "https://trello.com/1/cards/x/attachments/a1/download/image.png",
    downloadUrl: "https://trello.com/1/cards/x/attachments/a1/download/image.png",
    previews: [
      { url: "p70", width: 70, height: 50 },
      { url: "p250", width: 250, height: 150 },
      { url: "p150", width: 150, height: 203 },
      { url: "p300", width: 300, height: 407 },
      { url: "p571", width: 571, height: 774 },
    ],
  };
  const photo = {
    ...imagePng, id: "a2", name: "2026-09-13 17-41.jpeg", mimeType: "image/jpeg",
    url: "https://trello.com/1/cards/x/attachments/a2/download/p.jpeg",
    downloadUrl: "https://trello.com/1/cards/x/attachments/a2/download/p.jpeg",
    previews: [
      { url: "q70", width: 70, height: 50 },
      { url: "q600", width: 600, height: 822 },
      { url: "q1200", width: 1200, height: 1644 },
      { url: "q1230", width: 1230, height: 1685 },
    ],
  };

  it("放大檢視一律先拿原圖（preview 被降到 571x774 會看不清手寫字）", () => {
    expect(candidateUrls(imagePng, true)[0]).toBe(imagePng.downloadUrl);
    expect(candidateUrls(photo, true)[0]).toBe(photo.downloadUrl);
  });

  it("原圖失敗時退回最大的 preview，再往小退", () => {
    expect(candidateUrls(imagePng, true)).toEqual([imagePng.downloadUrl, "p571", "p300", "p250", "p150", "p70"]);
  });

  it("清單縮圖挑最接近 900px 的尺寸，省手機流量", () => {
    expect(candidateUrls(photo, false)[0]).toBe("q600");   // 600 比 1200 更接近 900
    expect(candidateUrls(imagePng, false)[0]).toBe("p571");
  });

  it("清單縮圖把原圖擺最後，不會一進頁面就載全尺寸", () => {
    const list = candidateUrls(photo, false);
    expect(list[list.length - 1]).toBe(photo.downloadUrl);
  });

  it("沒有 preview 的附件也要能取到圖", () => {
    const bare = { ...imagePng, previews: [] };
    expect(candidateUrls(bare, true)).toEqual([bare.downloadUrl]);
    expect(candidateUrls(bare, false)).toEqual([bare.downloadUrl]);
  });
});

// 實查 2026-10-12 那週 10 張單，5 張的出貨日比排程日早（還沒更新）。
// 照 due 顯示會叫客人挑一個東西還沒做完的日期。
// 老闆 2026-09-30 明確指正兩件事：整週共用一個區間、要往後留緩衝。
// 原本每筆用自己的排程日算、due 更晚時取 due，P6202 因此顯示成 10/12～10/26，
// 正確答案是 10/15～10/21。
describe("製作完成區間", () => {
  it("生產週一 10/12 → 10/15 ～ 10/21（老闆給的標準答案）", () => {
    expect(productionWindow("2026-10-12")).toEqual({ start: "2026-10-15", end: "2026-10-21" });
  });

  it("同一週的任何一天都得到同一個區間", () => {
    const want = { start: "2026-10-15", end: "2026-10-21" };
    for (const d of ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"]) {
      expect(productionWindow(d)).toEqual(want);
    }
  });

  it("下一週往後推七天", () => {
    expect(productionWindow("2026-10-19")).toEqual({ start: "2026-10-22", end: "2026-10-28" });
  });

  it("跨月跨年都要算對", () => {
    expect(productionWindow("2026-12-28")).toEqual({ start: "2026-12-31", end: "2027-01-06" });
  });

  it("空值回空字串，不硬編日期", () => {
    expect(productionWindow("")).toEqual({ start: "", end: "" });
  });
});

describe("weekMonday", () => {
  it("週一回自己", () => {
    expect(weekMonday("2026-10-12")).toBe("2026-10-12");
  });

  it("週日算前一個週一（不是隔天）", () => {
    expect(weekMonday("2026-10-18")).toBe("2026-10-12");
  });

  it("週六算同週週一", () => {
    expect(weekMonday("2026-10-17")).toBe("2026-10-12");
  });
});

describe("司機定案：時段 → Trello 出貨日", () => {
  it("出貨日取時段的起始整點（出貨通知再據此算到貨區間）", () => {
    expect(periodStartHour("上午 10:00-12:00")).toBe(10);
    expect(periodStartHour("下午 13:00-15:00")).toBe(13);
    expect(periodStartHour("下午 15:00-17:00")).toBe(15);
    expect(periodStartHour("傍晚 17:00-19:00")).toBe(17);
  });

  // 「皆可」沒有具體時間，硬給一個預設會讓客人在錯的時間等門。
  it("「皆可」沒有起始時間，必須由司機另外指定", () => {
    expect(periodStartHour("皆可")).toBeNull();
    expect(toDueIso("2026-10-29", "皆可")).toBeNull();
  });

  it("換算成 UTC 時扣掉台灣的 8 小時", () => {
    expect(toDueIso("2026-10-29", "下午 13:00-15:00")).toBe("2026-10-29T05:00:00.000Z");
    expect(toDueIso("2026-10-29", "上午 10:00-12:00")).toBe("2026-10-29T02:00:00.000Z");
  });

  it("傍晚時段換算後仍在同一天（不會因時區跨日）", () => {
    expect(toDueIso("2026-10-29", "傍晚 17:00-19:00")).toBe("2026-10-29T09:00:00.000Z");
  });

  it("沒有日期就回 null，不生出一個假的出貨日", () => {
    expect(toDueIso("", "下午 13:00-15:00")).toBeNull();
  });

  it("可挑的具體時段只有四個，不含皆可", () => {
    expect(CONCRETE_DELIVERY_PERIODS).toHaveLength(4);
    expect(CONCRETE_DELIVERY_PERIODS as string[]).not.toContain("皆可");
    CONCRETE_DELIVERY_PERIODS.forEach((p) => expect(periodStartHour(p)).not.toBeNull());
  });
});


// 客人現場還沒好卻只有「確認」「有誤」兩條路 → 他只能不回，整週叫料卡住。
describe("延後備料狀態", () => {
  it("postponed 不可被當成客人已確認", () => {
    const CUSTOMER_DONE = new Set(["confirmed", "scheduled", "driver_rejected"]);
    expect(CUSTOMER_DONE.has("postponed")).toBe(false);
  });

  it("寫進工作表再讀回不會掉", () => {
    const row = confirmToRow({ ...sample, status: "postponed", disputeNote: "裝潢預計月底完成" });
    const back = rowToConfirm(row);
    expect(back.status).toBe("postponed");
    expect(back.disputeNote).toBe("裝潢預計月底完成");
  });
});

describe("對帳差異要不要擋住發連結", () => {
  it("排程日、時段不一致要擋 —— 客人會收到錯週次的確認單", () => {
    expect(isGatingDrift("date")).toBe(true);
    expect(isGatingDrift("slot")).toBe(true);
  });

  it("🔴 出貨日不一致不擋", () => {
    // 客人頁的完工日是從排程日推的；而且客人確認後本機會把 Numbers 的
    // 「日期範圍」改寫成送貨日，本來就不等於 Trello 出貨日。
    // 拿兩個意思不同的東西比對＝假警報，老闆會因此不再信任整個對帳。
    expect(isGatingDrift("due")).toBe(false);
  });

  it("看不懂的差異類型一律當成會擋 —— 寧可多擋不可漏放", () => {
    expect(isGatingDrift("other")).toBe(true);
    expect(isGatingDrift("以後才會有的新類型")).toBe(true);
    expect(isGatingDrift("")).toBe(true);
  });
});

describe("客人可以挑哪幾天收件", () => {
  // 2026-10 月：10/12 一、10/18 日、10/19 一、10/21 三、10/25 日
  it("🔴 最早可選＝製作完成區間的起日，不是結束日", () => {
    // 2026-10-01 真實案例：客人看到「10/15 ~ 10/21 製作完成」卻只能選 10/21 之後，
    // 跑來問「10/19 下午是不行的對嗎？」。老闆：10/15（含）之後都該能選。
    expect(earliestDeliveryDate("2026-10-15", "2026-10-21", "2026-10-01")).toBe("2026-10-15");
  });

  it("起日已經過了就從今天算起", () => {
    expect(earliestDeliveryDate("2026-10-15", "2026-10-21", "2026-10-18")).toBe("2026-10-18");
  });

  it("抓不到製作起日時退回完成日，再沒有就用今天", () => {
    expect(earliestDeliveryDate("", "2026-10-21", "2026-10-01")).toBe("2026-10-21");
    expect(earliestDeliveryDate("", "", "2026-10-01")).toBe("2026-10-01");
  });

  it("週日不配送", () => {
    expect(isNonDeliveryDay("2026-10-18")).toBe(true);
    expect(isNonDeliveryDay("2026-10-25")).toBe(true);
  });

  it("週一到週六都可以", () => {
    for (const d of ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24"]) {
      expect(isNonDeliveryDay(d)).toBe(false);
    }
  });

  it("空值或格式不對不要誤判成週日", () => {
    expect(isNonDeliveryDay("")).toBe(false);
    expect(isNonDeliveryDay("2026/10/18")).toBe(false);
  });

  it("🔴 要用 UTC 解析——伺服器跑在 UTC，用本地時間會把週六判成週日", () => {
    // 這幾天在 UTC-x 時區用 new Date(ymd).getDay() 會整個偏一天
    expect(isNonDeliveryDay("2026-10-17")).toBe(false);  // 週六
    expect(isNonDeliveryDay("2026-10-18")).toBe(true);   // 週日
  });
});

describe("國定假日提示", () => {
  // 🔴 假日是「提示」不是「擋」：司機行程不固定，有些假日跑得了，
  //    硬擋會把他其實能跑的日子也關掉（2026-10-01 老闆拍板）。
  it("認得出國定假日並回傳名稱", () => {
    expect(holidayName("2026-02-17")).toBe("春節");
    expect(holidayName("2026-10-10")).toBe("國慶日");
    expect(holidayName("2026-01-01")).toBe("開國紀念日");
  });

  it("補假也要算（最容易漏的一種）", () => {
    expect(holidayName("2026-10-09")).toBe("補假");
    expect(holidayName("2026-10-26")).toBe("補假");
  });

  it("平常的上班日沒有提示", () => {
    expect(holidayName("2026-10-20")).toBe("");
    expect(holidayName("2026-10-22")).toBe("");
  });

  it("假日不擋送出——只有週日擋", () => {
    expect(isNonDeliveryDay("2026-10-10")).toBe(false); // 國慶日是週六，照樣可選
    expect(isNonDeliveryDay("2026-02-17")).toBe(false); // 春節週二
  });

  it("表外的日期回空字串，不要亂提示", () => {
    expect(holidayName("2099-01-01")).toBe("");
    expect(holidayName("")).toBe("");
  });

  it("假日表不可以是空的（產生器壞掉要被抓到）", () => {
    const names = ["2026-02-16", "2026-02-17", "2026-02-18"].map(holidayName);
    expect(names.every((n) => n.length > 0)).toBe(true);
  });
});

describe("測試用確認單不可以碰到真實資料", () => {
  const REAL = "6abccf955285ec36c06ad7d5";
  const TEST = `${TEST_CARD_PREFIX}${REAL}`;

  it("認得出哪一筆是測試單", () => {
    expect(isTestConfirm(TEST)).toBe(true);
    expect(isTestConfirm(REAL)).toBe(false);
    expect(isTestConfirm("")).toBe(false);
  });

  it("還原得回真卡號（照片、製作區間才讀得到）", () => {
    expect(realCardId(TEST)).toBe(REAL);
    expect(realCardId(REAL)).toBe(REAL);
  });

  it("🔴 測試單的 cardId 不可以等於真卡號", () => {
    // 看板是用真卡號去對照工作表（byCard.get(card.id)）。
    // 一旦相等，測試單就會蓋掉那張卡真正的那一筆，老闆會看到錯的狀態。
    expect(TEST).not.toBe(REAL);
    expect(isTestConfirm(realCardId(TEST))).toBe(false);
  });

  it("前綴不可以是空字串（空字串會讓每一筆都變成測試單）", () => {
    expect(TEST_CARD_PREFIX.length).toBeGreaterThan(0);
    expect(isTestConfirm(REAL)).toBe(false);
  });
});
