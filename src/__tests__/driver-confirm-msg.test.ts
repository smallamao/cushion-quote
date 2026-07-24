import { describe, it, expect } from "vitest";
import { buildShippingMsg, type ShippingMsgOptions, type TrelloCard } from "@/lib/trello-helpers";
import { TRELLO } from "@/lib/trello-constants";

// 對照老闆提供的手機 App 司機通知格式（測試卡 P9999）：
//   阿信哥～
//   115/07/25 星期六
//   20:00 - 21:00
//   #P9999
//   台北市内湖區東湖路7巷47號7樓
//   0937365190 梁蘭芬 測試卡
//   (空行)
//   沙發2000cm一只
//
// 時間與確切日字串隨測試機時區而異，故只驗「結構＋欄位對應」（時區無關）。

function mkOpts(over: Partial<ShippingMsgOptions> = {}): ShippingMsgOptions {
  return {
    timeRangeHours: 1,
    driverTitle: "阿信 (兩人）[BXH-6828]",
    driverGreeting: "阿信哥～",
    driverPhone: "0958640520",
    driverKey: "shin",
    finalPayment: 0,
    receiveAccount: "jinshuei",
    sofaRecycle: false,
    sofaRecycleFree: false,
    isDriverConfirm: true,
    isBackShipping: false,
    isCleaning: false,
    ...over,
  };
}

const CARD: TrelloCard = {
  id: "5fc8f3dc4c48bd7b9cdf254b",
  name: "P9999 測試卡",
  // desc[0]=地址, desc[1]=品項, desc[2]=電話+聯絡人（順序刻意打亂以驗證偵測）
  desc: "台北市内湖區東湖路7巷47號7樓\n沙發2000cm一只\n0937365190 梁蘭芬",
  due: "2026-07-25T12:00:00.000Z",
  dueComplete: false,
  idList: "",
  idBoard: TRELLO.BOARD_ID,
  labels: [
    { id: "1", name: "排程/暘", color: "" },
    { id: "2", name: "成交/訂製維修", color: "" },
    { id: "3", name: "出貨/信", color: "" },
  ],
  badges: { checkItems: 0, checkItemsChecked: 0 },
};

describe("司機確認訊息（對齊手機 App 格式）", () => {
  const msg = buildShippingMsg(CARD, [], mkOpts());

  it("開頭是稱呼，緊接民國年日期（中間無空行）", () => {
    expect(msg.startsWith("阿信哥～\n115/")).toBe(true);
  });

  it("日期(民國年+星期)、時段、#工單號 各自獨立成行且依序", () => {
    expect(msg).toMatch(/\n115\/\d{2}\/\d{2} 星期[日一二三四五六]\n\d{2}:\d{2} - \d{2}:\d{2}\n#P9999\n/);
  });

  it("#工單號不再帶品項分類（訂製維修）", () => {
    expect(msg).not.toContain("訂製維修");
  });

  it("地址下一行正確組出「電話 聯絡人 客戶註記」", () => {
    expect(msg).toContain("\n台北市内湖區東湖路7巷47號7樓\n0937365190 梁蘭芬 測試卡\n");
  });

  it("品項只出現一次（不再重複），且在訊息最後、前有空行", () => {
    expect(msg.match(/沙發2000cm一只/g)?.length).toBe(1);
    expect(msg.trimEnd().endsWith("\n\n沙發2000cm一只")).toBe(true);
  });

  it("先前的 bug：品項不會被誤當電話（不出現「沙發2000cm一只 測試卡」）", () => {
    expect(msg).not.toContain("沙發2000cm一只 測試卡");
  });

  it("有款式標籤（PRODUCTS 查得到）時，單號行帶款式名：#P6166  MULE 沐樂", () => {
    const card2: TrelloCard = {
      ...CARD,
      name: "P6166 蘇家涵",
      desc: "新北市中和區員山路387巷14號9F\n0939828391 蘇家涵\n沙發344cm一字型一只",
      labels: [{ id: "a", name: "成交/MULE", color: "" }],
    };
    const m = buildShippingMsg(card2, [], mkOpts());
    expect(m).toContain("\n#P6166  MULE 沐樂\n");
  });

  it("分類標籤（訂製維修，PRODUCTS 查不到）維持只放單號", () => {
    // CARD 本身帶 成交/訂製維修 標籤
    const m = buildShippingMsg(CARD, [], mkOpts());
    expect(m).toMatch(/\n#P9999\n/);
    expect(m).not.toContain("訂製維修");
  });

  it("卡名＝客戶姓名時，聯絡人行不重複（0963024376 許惠婷 許惠婷 → 一次）", () => {
    const card2: TrelloCard = {
      ...CARD,
      name: "P6163 許惠婷",
      desc: "新北市土城區青和街61號9F\n0963024376 許惠婷\n沙發210cm二件式一字型一只",
    };
    const m = buildShippingMsg(card2, [], mkOpts());
    expect(m).toContain("\n0963024376 許惠婷\n");
    expect(m).not.toContain("許惠婷 許惠婷");
  });

  it("desc 第二組電話行（斜線格式/市話）：升級為次要聯絡人、不混入品項", () => {
    const card2: TrelloCard = {
      ...CARD,
      name: "P6159 彭智榮",
      desc: [
        "新北市土城區延和路76巷10號4F",
        "0928130034 彭智榮",
        "沙發286cm二件式一字型+主人椅",
        "0222610253/彭德添",
      ].join("\n"),
    };
    const m = buildShippingMsg(card2, [], mkOpts());
    // 斜線轉空白、緊接主要聯絡人之後
    expect(m).toContain("\n0928130034 彭智榮\n0222610253 彭德添\n");
    // 品項乾淨，不再拖著電話行
    expect(m.trimEnd().endsWith("沙發286cm二件式一字型+主人椅")).toBe(true);
    expect(m).not.toContain("0222610253/彭德添");
  });

  it("custom field 已有次要聯絡人時，desc 的電話行不重複出現", () => {
    const card2: TrelloCard = {
      ...CARD,
      name: "P6163 許惠婷",
      desc: [
        "新北市土城區青和街61號9F",
        "0963024376 許惠婷",
        "沙發210cm二件式一字型一只",
        "0958575724/許惠婷",
      ].join("\n"),
    };
    const cfs = [
      { id: "a", idCustomField: TRELLO.CUSTOM_FIELDS.SECONDARY_CONTACT_PHONE, value: { text: "0958575724" } },
      { id: "b", idCustomField: TRELLO.CUSTOM_FIELDS.SECONDARY_CONTACT_NAME, value: { text: "許惠婷" } },
    ];
    const m = buildShippingMsg(card2, cfs, mkOpts());
    expect(m.match(/0958575724/g)?.length).toBe(1);
    expect(m.trimEnd().endsWith("沙發210cm二件式一字型一只")).toBe(true);
  });

  it("desc 無品項時，退回沙發款式（成交/ 標籤）", () => {
    const card2: TrelloCard = {
      ...CARD,
      name: "P1234 王小明",
      desc: "新北市板橋區文化路一段1號\n0912345678 王小明",
      labels: [{ id: "a", name: "成交/MULE", color: "" }],
    };
    const m2 = buildShippingMsg(card2, [], mkOpts());
    expect(m2).toContain("\n0912345678 王小明");
    // 品項退回款式碼（MULE）
    expect(m2.trimEnd().split("\n").pop()).toContain("MULE");
  });
});
