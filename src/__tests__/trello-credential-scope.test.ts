import { describe, it, expect } from "vitest";

import { shouldSendTrelloCredentials } from "@/lib/trello-server";

// 🔴 2026-10-15 第二輪稽核：fetchAttachmentImage 原本的判斷是「只要不是 S3 就附上
//    公司的 TRELLO_KEY／TRELLO_TOKEN」。Trello 卡片的附件可以是任意連結，指向誰
//    的伺服器都行——只要有人在板上加一個連到自己主機的附件，公司的 Trello 憑證
//    就會跟著 Authorization header 送過去。
//    改成白名單：只有 Trello 自家網域才給憑證，其餘一律不給。
describe("shouldSendTrelloCredentials", () => {
  it("Trello 自家網域才給憑證", () => {
    expect(shouldSendTrelloCredentials("https://api.trello.com/1/cards/x/attachments/y/download/z.png")).toBe(true);
    expect(shouldSendTrelloCredentials("https://trello.com/1/cards/abc")).toBe(true);
    expect(shouldSendTrelloCredentials("https://trello-attachments.s3.amazonaws.com/x.png")).toBe(false);
  });

  it("任意外部主機一律不給", () => {
    for (const url of [
      "https://evil.example/collect.png",
      "http://192.168.1.50/x.png",
      "https://api.trello.com.evil.example/x.png", // 後綴偽裝
      "https://nottrello.com/x.png",
      "https://eviltrello.com/x.png",
      "https://trello.com.evil.example/x.png",
    ]) {
      expect(shouldSendTrelloCredentials(url), url).toBe(false);
    }
  });

  it("子網域要真的是 trello.com 底下才算", () => {
    expect(shouldSendTrelloCredentials("https://images.trello.com/x.png")).toBe(true);
  });

  it("非 https 不給（憑證不走明文）", () => {
    expect(shouldSendTrelloCredentials("http://api.trello.com/x.png")).toBe(false);
  });

  it("壞網址不給，而且不丟錯", () => {
    expect(shouldSendTrelloCredentials("not a url")).toBe(false);
    expect(shouldSendTrelloCredentials("")).toBe(false);
  });
});
