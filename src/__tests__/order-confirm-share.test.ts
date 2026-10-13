import { describe, expect, it } from "vitest";

import { buildOrderConfirmShareMessage } from "@/lib/order-deposit-payment";

describe("buildOrderConfirmShareMessage", () => {
  const url = "https://s.potatosofa.com/od/abc123";

  it("帶訂單編號時，訊息會標出編號並包含連結", () => {
    const msg = buildOrderConfirmShareMessage(url, { orderNo: "P6275" });
    expect(msg).toContain("訂單編號 P6275");
    expect(msg).toContain(url);
  });

  it("客人要知道該做什麼：四個步驟都在，且有「不對就先別簽」的退路", () => {
    const msg = buildOrderConfirmShareMessage(url, { orderNo: "P6275" });
    for (const step of ["①", "②", "③", "④", "⑤"]) expect(msg).toContain(step);
    expect(msg).toContain("請先別簽名");
  });

  it("要客人回報末五碼——這是對帳的入口，且客人就是在 LINE 回覆", () => {
    const msg = buildOrderConfirmShareMessage(url, { orderNo: "P6275" });
    expect(msg).toContain("末五碼");
  });

  it("沒有編號時不會留下「訂單編號 」這種半截字串", () => {
    const msg = buildOrderConfirmShareMessage(url, { orderNo: "" });
    expect(msg).not.toContain("訂單編號");
    expect(msg).toContain(url);
  });

  it("不重複匯款帳號——頁面上已有，兩邊各寫一份遲早不一致", () => {
    const msg = buildOrderConfirmShareMessage(url, { orderNo: "P6275" });
    expect(msg).not.toContain("16600400697189");
    expect(msg).not.toContain("永豐");
  });
});
