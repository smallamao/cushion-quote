import { describe, it, expect, vi, beforeEach } from "vitest";

const append = vi.hoisted(() => vi.fn());
const get = vi.hoisted(() => vi.fn());
const batchUpdate = vi.hoisted(() => vi.fn());
const update = vi.hoisted(() => vi.fn());

vi.mock("@/lib/sheets-client", () => ({
  getSheetsClient: async () => ({
    spreadsheetId: "SS",
    sheets: {
      spreadsheets: {
        get,
        batchUpdate,
        values: { append, update },
      },
    },
  }),
}));

// after() 只在請求情境內可用；測試裡讓它直接執行 callback
vi.mock("next/server", () => ({
  after: (fn: () => unknown) => {
    void fn();
  },
}));

const { appendAuditLog } = await import("@/lib/audit-log");

beforeEach(() => {
  append.mockReset();
  batchUpdate.mockReset();
  update.mockReset();
  get.mockReset();
  get.mockResolvedValue({ data: { sheets: [{ properties: { title: "操作日誌" } }] } });
  append.mockResolvedValue({});
});

async function flush() {
  await new Promise((r) => setTimeout(r, 0));
}

describe("appendAuditLog", () => {
  it("寫出一列：時間、操作者、動作、對象、摘要", async () => {
    appendAuditLog({
      actor: "boss@example.com",
      action: "delete",
      targetType: "order",
      targetId: "ORD-001",
      summary: "連帶刪除 3 筆明細",
    });
    await flush();

    expect(append).toHaveBeenCalledTimes(1);
    const row = append.mock.calls[0][0].requestBody.values[0];
    expect(row).toHaveLength(7);
    expect(row[2]).toBe("boss@example.com");
    expect(row[3]).toBe("delete");
    expect(row[4]).toBe("order");
    expect(row[5]).toBe("ORD-001");
    expect(row[6]).toBe("連帶刪除 3 筆明細");
    // 時間是可解析的 ISO
    expect(Number.isNaN(Date.parse(row[1]))).toBe(false);
  });

  it("只附加，不呼叫 update／不刪任何列", async () => {
    appendAuditLog({ actor: "a@b.c", action: "update", targetType: "settings", targetId: "system" });
    await flush();
    expect(append).toHaveBeenCalledTimes(1);
    expect(append.mock.calls[0][0].insertDataOption).toBe("INSERT_ROWS");
    expect(update).not.toHaveBeenCalled();
  });

  it("工作表不存在時自動建立並寫表頭", async () => {
    get.mockResolvedValue({ data: { sheets: [{ properties: { title: "訂製訂單" } }] } });
    batchUpdate.mockResolvedValue({});
    update.mockResolvedValue({});
    appendAuditLog({ actor: "a@b.c", action: "create", targetType: "ar", targetId: "AR-1" });
    await flush();
    expect(batchUpdate).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0].requestBody.values[0]).toContain("操作者");
  });

  it("拿不到操作者時記 unknown，而不是整筆不記", async () => {
    appendAuditLog({ actor: "", action: "delete", targetType: "client", targetId: "C-1" });
    await flush();
    expect(append.mock.calls[0][0].requestBody.values[0][2]).toBe("unknown");
  });

  it("寫入失敗不會丟錯——記不到帳也不能讓主要動作失敗", async () => {
    append.mockRejectedValue(new Error("sheets down"));
    expect(() =>
      appendAuditLog({ actor: "a@b.c", action: "delete", targetType: "order", targetId: "X" }),
    ).not.toThrow();
    await flush();
  });
});
