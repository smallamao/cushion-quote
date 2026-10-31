import { beforeEach, describe, expect, it, vi } from "vitest";

const sheets = vi.hoisted(() => ({
  get: vi.fn(),
  batchUpdate: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/sheets-client", () => ({
  getSheetsClient: async () => ({
    spreadsheetId: "SS",
    sheets: {
      spreadsheets: {
        get: sheets.get,
        batchUpdate: sheets.batchUpdate,
        values: { update: sheets.update },
      },
    },
  }),
}));

const { saveDriveConnection } = await import("@/lib/drive-backup-auth");

beforeEach(() => {
  vi.stubEnv("AUTH_SECRET", "s".repeat(40));
  sheets.get.mockReset().mockResolvedValue({ data: { sheets: [] } });
  sheets.batchUpdate.mockReset();
  sheets.update.mockReset().mockResolvedValue({});
});

describe("Drive備份授權表 — 同時建表", () => {
  it("addSheet 回「already exists」（別的請求剛建好）時照常存檔", async () => {
    sheets.batchUpdate.mockRejectedValue(
      new Error('Invalid requests[0].addSheet: A sheet with the name "Drive備份授權" already exists.'),
    );
    await expect(
      saveDriveConnection({ email: "o@gmail.com", refreshToken: "1//rt", refreshTokenExpiresIn: null }),
    ).resolves.toBeUndefined();
    const rowWrite = sheets.update.mock.calls.find(([arg]) => arg.range === "Drive備份授權!A2:G2");
    expect(rowWrite).toBeDefined();
    // 落地的是密文，不是原文
    expect(JSON.stringify(rowWrite)).not.toContain("1//rt");
  });

  it("其他建表錯誤照丟，不會假裝成功", async () => {
    sheets.batchUpdate.mockRejectedValue(new Error("The caller does not have permission"));
    await expect(
      saveDriveConnection({ email: "o@gmail.com", refreshToken: "rt", refreshTokenExpiresIn: null }),
    ).rejects.toThrow("permission");
    expect(sheets.update).not.toHaveBeenCalled();
  });
});
