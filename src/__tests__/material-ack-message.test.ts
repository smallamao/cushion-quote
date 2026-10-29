import { describe, expect, it } from "vitest";

import { buildMaterialAckMessage } from "@/lib/material-ack-message";
import type { PreferredSlot } from "@/lib/material-confirm-types";

const fmtDate = (ymd: string) => ymd.slice(5).replace("-", "/");
const slots: PreferredSlot[] = [
  { date: "2026-10-30", period: "上午 10:00-12:00" },
  { date: "2026-11-01", period: "皆可" },
  { date: "2026-11-03", period: "下午 13:00-15:00" },
] as PreferredSlot[];

describe("buildMaterialAckMessage", () => {
  it("三組都列出來並編號，讓客人看得出是排序選項", () => {
    const m = buildMaterialAckMessage({ slots, fmtDate });
    expect(m).toContain("1. 10/30 上午 10:00-12:00");
    expect(m).toContain("2. 11/01 皆可");
    expect(m).toContain("3. 11/03 下午 13:00-15:00");
  });

  it("必須明講「不是確定的配送日」——這是整則訊息存在的理由", () => {
    const m = buildMaterialAckMessage({ slots, fmtDate });
    expect(m).toContain("不是確定的配送日");
    expect(m).toContain("第 2 或第 3 組");
  });

  it("必須講出後果：收到確認前先別安排搬家裝潢", () => {
    const m = buildMaterialAckMessage({ slots, fmtDate });
    expect(m).toContain("請先不要安排搬家");
  });

  it("勾「隨時可配合」沒填日期時，不要出現空的編號清單", () => {
    const m = buildMaterialAckMessage({ slots: [], fmtDate });
    expect(m).toContain("由我們安排");
    expect(m).not.toContain("1.");
  });
});
