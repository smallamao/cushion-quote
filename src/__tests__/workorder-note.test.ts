import { describe, expect, it } from "vitest";

import { buildWorkOrderNoteText } from "@/lib/workorder-note";
import type { CustomOrder } from "@/lib/types";

// 以 S1089 實際資料為本（老闆記事本的既有版面）
const base = {
  orderId: "ORD-X",
  orderNumber: "S1089",
  orderTitle: "訂製坐背墊",
  materialName: "貓抓守衛皮",
  materialCode: "5753 奶油波斯貓",
  items: [
    {
      id: "1",
      name: "坐墊",
      foamSpec: "(HRH 5” 硬Q料)",
      dimensions: "W68 x 60 x 13cm *一只\nW72 x 90 x 13cm *二只",
      quantity: "",
    },
  ],
  notes: [
    { id: "a", text: "外布套車拉鍊可拆洗", isWarning: false },
    { id: "b", text: "一只拉鍊頭收合在反向", isWarning: true },
  ],
} as unknown as CustomOrder;

describe("buildWorkOrderNoteText", () => {
  it("編號與材質連著兩行，中間不空行", () => {
    const t = buildWorkOrderNoteText(base);
    expect(t.startsWith("編號：S1089 訂製坐背墊\n材質 貓抓守衛皮 5753 奶油波斯貓")).toBe(true);
  });

  it("🔴 尺寸欄本身是多行，必須逐行輸出不可合併成一行", () => {
    const t = buildWorkOrderNoteText(base);
    expect(t).toContain("• 坐墊 (HRH 5” 硬Q料)\nW68 x 60 x 13cm *一只\nW72 x 90 x 13cm *二只");
  });

  it("警告備註用 ⚠，一般用 ◆", () => {
    const t = buildWorkOrderNoteText(base);
    expect(t).toContain("◆ 外布套車拉鍊可拆洗");
    expect(t).toContain("⚠ 一只拉鍊頭收合在反向");
  });

  it("分組標題（itemType=header）用 ■ 單獨一行", () => {
    const withHeader = {
      ...base,
      items: [
        { id: "h", name: "【大和樂活】單人沙發墊四組", itemType: "header", dimensions: "", quantity: "" },
        { id: "1", name: "坐墊", dimensions: "W60 x 63 x 15cm", quantity: "四只", foamSpec: "" },
      ],
    } as unknown as CustomOrder;
    const t = buildWorkOrderNoteText(withHeader);
    expect(t).toContain("■ 【大和樂活】單人沙發墊四組");
    // 尺寸只有一行且另有數量時，數量接在同一行
    expect(t).toContain("W60 x 63 x 15cm 四只");
  });

  it("空欄位整段不印，不留空標籤", () => {
    const sparse = { orderId: "X", orderNumber: "", orderTitle: "", items: [], notes: [] } as unknown as CustomOrder;
    expect(buildWorkOrderNoteText(sparse)).toBe("");
  });

  it("沒有材質時不印材質那行", () => {
    const noMat = { ...base, materialName: "", materialCode: "" } as unknown as CustomOrder;
    const t = buildWorkOrderNoteText(noMat);
    expect(t).not.toContain("材質");
    expect(t).toContain("編號：S1089");
  });

  it("不加交期、配送、客戶名——老闆的版面沒有這些", () => {
    const t = buildWorkOrderNoteText({ ...base, deadline: "11/20 前", deliveryMethod: "宅配", clientName: "李柏伸" } as unknown as CustomOrder);
    expect(t).not.toContain("交期");
    expect(t).not.toContain("宅配");
    expect(t).not.toContain("李柏伸");
  });
});
