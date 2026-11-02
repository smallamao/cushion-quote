import { describe, expect, it } from "vitest";

import { shouldAutoCreateOrderOnArchive } from "@/lib/signed-back";

const notArchived = { signedBack: false, versionStatus: "accepted" };
const archived = { signedBack: true, versionStatus: "accepted" };

describe("shouldAutoCreateOrderOnArchive", () => {
  it("這次才歸檔：要開單", () => {
    expect(shouldAutoCreateOrderOnArchive(notArchived, archived)).toBe(true);
  });

  it("🔴 本來就已歸檔，重複儲存不可再開一次", () => {
    expect(shouldAutoCreateOrderOnArchive(archived, archived)).toBe(false);
  });

  it("沒有歸檔就不開單", () => {
    expect(shouldAutoCreateOrderOnArchive(notArchived, notArchived)).toBe(false);
  });

  it("🔴 回簽後又被拒的版本不開單（實例 CA-202607-009-Q01-V02）", () => {
    expect(
      shouldAutoCreateOrderOnArchive(notArchived, { signedBack: true, versionStatus: "rejected" }),
    ).toBe(false);
  });

  it("已取代／已取消的版本也不開單", () => {
    for (const versionStatus of ["superseded", "cancelled"]) {
      expect(shouldAutoCreateOrderOnArchive(notArchived, { signedBack: true, versionStatus })).toBe(
        false,
      );
    }
  });

  it("草稿／已送出狀態歸檔仍要開單——狀態沒跟上不該害訂單不存在", () => {
    for (const versionStatus of ["draft", "sent", "following_up"]) {
      expect(shouldAutoCreateOrderOnArchive(notArchived, { signedBack: true, versionStatus })).toBe(
        true,
      );
    }
  });

  it("欄位缺漏時不要誤開單", () => {
    expect(shouldAutoCreateOrderOnArchive({}, {})).toBe(false);
    expect(shouldAutoCreateOrderOnArchive({}, { signedBack: true })).toBe(true);
  });
});
