import { describe, it, expect } from "vitest";

import {
  absoluteLink,
  buildNotificationText,
  buildReplyText,
  shouldNotifyReply,
  splitForTelegram,
} from "@/lib/telegram";

// 老闆 2026-11-10：通知改推 Telegram（免費、不吃 LINE 月額度），
// 師傅與同事在售後單的回覆也要推；自己回的不推給自己。

const ORIGIN = "https://cushion-quote.vercel.app";

describe("absoluteLink", () => {
  it("站內路徑補成完整網址；已經是完整網址或空的照舊", () => {
    expect(absoluteLink("/settings?tab=maintenance", ORIGIN)).toBe(`${ORIGIN}/settings?tab=maintenance`);
    expect(absoluteLink("https://s.potatosofa.com/abc", ORIGIN)).toBe("https://s.potatosofa.com/abc");
    expect(absoluteLink("", ORIGIN)).toBe("");
  });
});

describe("buildNotificationText", () => {
  it("標題、內容、連結各一段", () => {
    const text = buildNotificationText(
      { title: "報價已簽署", body: "禾雅窗飾 簽署 CA-202611-002-Q02（$1,785）", link: "/quotes" },
      ORIGIN,
    );
    expect(text).toBe(`🔔 報價已簽署\n禾雅窗飾 簽署 CA-202611-002-Q02（$1,785）\n${ORIGIN}/quotes`);
  });

  it("沒有連結就不留空行", () => {
    expect(buildNotificationText({ title: "T", body: "B", link: "" }, ORIGIN)).toBe("🔔 T\nB");
  });
});

describe("buildReplyText", () => {
  it("寫出單號、客人、誰回的、內容與附件數，連到那張售後單", () => {
    const text = buildReplyText(
      {
        serviceId: "AS-20261013-01",
        clientName: "王小姐",
        author: "阿伸",
        content: "已到府清潔完成，客人很滿意",
        attachmentCount: 3,
      },
      ORIGIN,
    );
    expect(text).toBe(
      `💬 售後回覆 AS-20261013-01（王小姐）\n阿伸：已到府清潔完成，客人很滿意\n📎 附件 3 個\n${ORIGIN}/after-sales/AS-20261013-01`,
    );
  });

  it("內容太長截斷，避免整篇對話塞進一則通知", () => {
    const text = buildReplyText(
      { serviceId: "AS-1", clientName: "", author: "Angela", content: "字".repeat(500), attachmentCount: 0 },
      ORIGIN,
    );
    expect(text).toContain("…");
    expect(text).not.toContain("（）");
    expect(text).not.toContain("📎");
    expect(text.length).toBeLessThan(400);
  });
});

describe("shouldNotifyReply", () => {
  it("老闆自己回的不推；別人回的推；大小寫不影響", () => {
    expect(shouldNotifyReply("Boss@Gmail.com", "boss@gmail.com")).toBe(false);
    expect(shouldNotifyReply("angela@x.com", "boss@gmail.com")).toBe(true);
  });
  it("沒設定老闆 email 時照推（寧可多推不可漏推）", () => {
    expect(shouldNotifyReply("boss@gmail.com", "")).toBe(true);
  });
});

describe("splitForTelegram", () => {
  it("超過上限從換行處切開", () => {
    const line = "a".repeat(1000);
    const chunks = splitForTelegram([line, line, line, line, line].join("\n"));
    expect(chunks.length).toBe(2);
    expect(chunks.every((c) => c.length <= 3800)).toBe(true);
  });
});
