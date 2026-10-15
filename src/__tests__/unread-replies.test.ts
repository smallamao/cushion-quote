import { describe, it, expect } from "vitest";

import { selectUnreadReplies } from "@/lib/unread-replies";

// row: [0]=replyId [1]=serviceId [2]=occurredAt [3]=author [4]=content [5]=attachments [6]=createdAt
const ROWS = [
  ["R1", "SV-001", "2026-10-15T10:00:00Z", "客人A", "我的單什麼時候到？"],
  ["R2", "SV-002", "2026-10-15T11:00:00Z", "客人B", "別人的單的對話內容"],
  ["R3", "SV-001", "2026-10-15T12:00:00Z", "阿明", "我自己寫的回覆"],
  ["R4", "SV-003", "2026-10-15T13:00:00Z", "客人C", "完全無關的單"],
];

describe("selectUnreadReplies — 師傅只能看到自己的單", () => {
  // 🔴 2026-10-15 第二輪稽核：原本只比對「時間 > 上次已讀」和「作者不是自己」，
  //    完全沒有比對這張單是不是你的。師傅因此看得到所有單的回覆前 80 字，
  //    包含其他師傅的案子與客人對話。
  it("技師只拿得到被指派給自己的單", () => {
    const items = selectUnreadReplies(ROWS, {
      lastRead: "2026-10-15T09:00:00Z",
      displayName: "阿明",
      isAdmin: false,
      assignedServiceIds: new Set(["SV-001"]),
    });
    expect(items.map((i) => i.serviceId)).toEqual(["SV-001"]);
    // 別人的單的內容一個字都不能出現
    expect(JSON.stringify(items)).not.toContain("別人的單");
    expect(JSON.stringify(items)).not.toContain("完全無關");
  });

  it("自己寫的回覆不算未讀", () => {
    const items = selectUnreadReplies(ROWS, {
      lastRead: "2026-10-15T09:00:00Z",
      displayName: "阿明",
      isAdmin: false,
      assignedServiceIds: new Set(["SV-001"]),
    });
    expect(items.every((i) => i.author !== "阿明")).toBe(true);
  });

  it("admin 看得到全部", () => {
    const items = selectUnreadReplies(ROWS, {
      lastRead: "2026-10-15T09:00:00Z",
      displayName: "老闆",
      isAdmin: true,
      assignedServiceIds: new Set(),
    });
    expect(items).toHaveLength(4);
  });

  it("已讀時間之前的不算", () => {
    const items = selectUnreadReplies(ROWS, {
      lastRead: "2026-10-15T12:30:00Z",
      displayName: "老闆",
      isAdmin: true,
      assignedServiceIds: new Set(),
    });
    expect(items.map((i) => i.serviceId)).toEqual(["SV-003"]);
  });

  it("技師沒有任何指派時拿到空清單，不是全部", () => {
    const items = selectUnreadReplies(ROWS, {
      lastRead: "2026-10-15T09:00:00Z",
      displayName: "阿明",
      isAdmin: false,
      assignedServiceIds: new Set(),
    });
    expect(items).toEqual([]);
  });

  it("內容截斷在 80 字", () => {
    const long = "x".repeat(200);
    const items = selectUnreadReplies([["R9", "SV-001", "2026-10-15T14:00:00Z", "客人", long]], {
      lastRead: "2026-10-15T09:00:00Z",
      displayName: "阿明",
      isAdmin: false,
      assignedServiceIds: new Set(["SV-001"]),
    });
    expect(items[0].content).toHaveLength(80);
  });
});
