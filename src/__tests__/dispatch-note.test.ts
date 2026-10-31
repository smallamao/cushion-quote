import { describe, expect, it } from "vitest";

import { buildDispatchNoteText, formatNoteDate } from "@/lib/dispatch-note";
import type { AfterSalesService } from "@/lib/types";

const base = {
  serviceId: "AS-20261031-01",
  receivedDate: "2026-10-31",
  relatedOrderNo: "P5037",
  shipmentDate: "",
  clientName: "王詩婷",
  clientPhone: "0952800396",
  clientContact2: "劉邦彥",
  clientPhone2: "0985955884",
  deliveryAddress: "桃園市桃園區文中一路25巷27號11F",
  modelCode: "",
  modelNameSnapshot: "沙發 265cm 三件式 L型一組",
  issueDescription: "到府清潔（客戶編號）\n布料：528系列 冰絲涼感布 528-72 白橡木",
  issuePhotos: [],
  status: "scheduled",
  assignedTo: "",
  scheduledDate: "2026-11-21",
  scheduledTime: "下午（14:00）",
  dispatchNotes: "",
  completedDate: "",
  completionNotes: "",
  completionPhotos: [],
  issueCategories: ["到府清潔"],
  createdAt: "",
  updatedAt: "",
  createdBy: "",
} as unknown as AfterSalesService;

describe("buildDispatchNoteText", () => {
  it("星期由程式算（2026-11-21 是週六）", () => {
    expect(formatNoteDate("2026-11-21")).toBe("11/21（六）");
    expect(formatNoteDate("")).toBe("");
    expect(formatNoteDate("壞資料")).toBe("壞資料");
  });

  it("把整段文字組好，含預定時間與派工連結", () => {
    const t = buildDispatchNoteText(base, "https://s.potatosofa.com/w/AS-20261031-01/sig");
    expect(t).toContain("服務單號 AS-20261031-01　填單日期 2026-10-31");
    expect(t).toContain("主要聯絡人 王詩婷　主要電話 0952800396");
    expect(t).toContain("送貨地址 桃園市桃園區文中一路25巷27號11F");
    expect(t).toContain("到府清潔");
    expect(t).toContain("布料：528系列 冰絲涼感布 528-72 白橡木");
    expect(t).toContain("11/21（六） 下午（14:00）");
    expect(t).toContain("https://s.potatosofa.com/w/AS-20261031-01/sig");
  });

  it("🔴 LINE 客服對話連結不可出現在給師傅的文案裡", () => {
    const withLine = {
      ...base,
      issueDescription:
        "到府清潔\n布料：冰絲涼感布\nLINE 對話：https://chat.line.biz/U123/chat/U456",
    } as AfterSalesService;
    const t = buildDispatchNoteText(withLine, "u");
    expect(t).not.toContain("chat.line.biz");
    expect(t).not.toContain("LINE 對話");
    expect(t).toContain("布料：冰絲涼感布");
  });

  it("空欄位整行不印，不留空白標籤", () => {
    const sparse = {
      ...base,
      clientContact2: "",
      clientPhone2: "",
      relatedOrderNo: "",
      modelCode: "",
    } as AfterSalesService;
    const t = buildDispatchNoteText(sparse, "u");
    expect(t).not.toContain("次要聯絡人");
    expect(t).not.toContain("訂單編號");
    expect(t).not.toContain("款式編號");
    expect(t).toContain("款式名稱 沙發 265cm 三件式 L型一組");
  });

  it("沒給連結就不出現連結那一段", () => {
    const t = buildDispatchNoteText(base);
    expect(t).not.toContain("師傅專用連結");
  });

  it("有負責師傅與派工備註時要印出來", () => {
    const full = { ...base, assignedTo: "BARRY 彭", dispatchNotes: "一樓有門禁，請先電話聯繫" } as AfterSalesService;
    const t = buildDispatchNoteText(full, "u");
    expect(t).toContain("負責師傅 BARRY 彭");
    expect(t).toContain("一樓有門禁，請先電話聯繫");
  });
});
