import { describe, expect, it } from "vitest";

import {
  DELIVERY_PERIODS,
  normalizeDeliveryPeriod,
  splitOrderCardName,
  type MaterialConfirm,
} from "@/lib/material-confirm-types";
import {
  SHEET_HEADERS,
  confirmToRow,
  generateToken,
  rowToConfirm,
} from "@/lib/material-confirm-sheet";
import { candidateUrls, pickEstimatedDate, rocDateLabel, toTaipeiYmd } from "@/lib/trello-server";

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
};

describe("叫料確認 工作表列對應", () => {
  it("欄數與表頭一致（欄序是唯一真相，改欄位必須同步）", () => {
    expect(confirmToRow(sample)).toHaveLength(SHEET_HEADERS.length);
    expect(SHEET_HEADERS).toHaveLength(19);
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
describe("客人看到的預計完工日", () => {
  it("出貨日晚於排程日時用出貨日", () => {
    expect(pickEstimatedDate("2026-10-20", "2026-10-14")).toBe("2026-10-20");
  });

  it("出貨日還沒更新（早於排程日）時改用排程日，不給客人不可能的日期", () => {
    // P6260 戴逸萍：排程 10/13、出貨仍是舊的 10/03
    expect(pickEstimatedDate("2026-10-03", "2026-10-13")).toBe("2026-10-13");
  });

  it("兩者相同就是那天", () => {
    expect(pickEstimatedDate("2026-10-14", "2026-10-14")).toBe("2026-10-14");
  });

  it("只有其中一個就用那個", () => {
    expect(pickEstimatedDate("", "2026-10-13")).toBe("2026-10-13");
    expect(pickEstimatedDate("2026-10-20", "")).toBe("2026-10-20");
  });

  it("都沒有就回空字串，不硬編一個日期", () => {
    expect(pickEstimatedDate("", "")).toBe("");
  });
});
