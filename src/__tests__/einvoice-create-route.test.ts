import { beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.hoisted(() => vi.fn());
const update = vi.hoisted(() => vi.fn());
const append = vi.hoisted(() => vi.fn());
const batchUpdate = vi.hoisted(() => vi.fn());

vi.mock("@/lib/sheets-client", () => ({
  getSheetsClient: async () => ({
    spreadsheetId: "SS",
    sheets: { spreadsheets: { values: { get, update, append, batchUpdate } } },
  }),
}));
vi.mock("@/app/api/sheets/einvoices/_auth", () => ({
  getSession: async () => ({ role: "admin", email: "a@test", displayName: "tester" }),
}));

const { POST } = await import("@/app/api/sheets/einvoices/route");

function createRequest(): Request {
  return new Request("http://localhost/api/sheets/einvoices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sourceType: "manual",
      sourceId: "MANUAL-1",
      buyerType: "b2c",
      buyerName: "王小明",
      untaxedAmount: 952,
      taxAmount: 48,
      totalAmount: 1000,
      items: [{ name: "沙發換布", quantity: 1, unitPrice: 1000, amount: 1000 }],
    }),
  });
}

beforeEach(() => {
  get.mockReset();
  update.mockReset();
  append.mockReset();
  batchUpdate.mockReset();
});

describe("POST /api/sheets/einvoices", () => {
  it("讀不到既有發票紀錄時中止建立，完全不寫入", async () => {
    get.mockRejectedValue(new Error("The service is currently unavailable."));
    const res = await POST(createRequest());
    expect(res.status).toBe(500);
    expect(append).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(batchUpdate).not.toHaveBeenCalled();
  });

  it("讀取正常時以 append 建立草稿", async () => {
    get.mockResolvedValue({ data: { values: [] } });
    append.mockResolvedValue({});
    const res = await POST(createRequest());
    expect(res.status).toBe(201);
    expect(update).not.toHaveBeenCalled();
    expect(append).toHaveBeenCalled();
  });
});
