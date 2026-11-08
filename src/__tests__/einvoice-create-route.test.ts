import { beforeEach, describe, expect, it, vi } from "vitest";

import { eInvoiceRowToRecord } from "@/lib/einvoice-utils";

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

function createRequest(overrides: Record<string, unknown> = {}): Request {
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
      ...overrides,
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

  it.each([
    ["填了載具但類型是無", { carrierType: "none", carrierValue: "/ABC1234" }],
    ["手機條碼格式錯", { carrierType: "mobile_barcode", carrierValue: "/ABC12" }],
    ["自然人憑證", { carrierType: "mobile_barcode", carrierValue: "AB12345678901234" }],
    ["捐贈碼格式錯", { donationCode: "12" }],
    ["Email 不是單一信箱", { email: "a@b.com,c@d.com" }],
  ])("%s → 400，不寫入", async (_label, overrides) => {
    get.mockResolvedValue({ data: { values: [] } });
    const res = await POST(createRequest(overrides));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/[\u4e00-\u9fff]/);
    expect(append).not.toHaveBeenCalled();
  });

  it("手機條碼存成半形大寫", async () => {
    get.mockResolvedValue({ data: { values: [] } });
    append.mockResolvedValue({});
    const res = await POST(createRequest({ carrierType: "mobile_barcode", carrierValue: "／abc1234", donationCode: "919" }));
    expect(res.status).toBe(201);
    const row = (append.mock.calls[0]![0] as { requestBody: { values: string[][] } }).requestBody.values[0]!;
    expect(eInvoiceRowToRecord(row)).toMatchObject({ carrierType: "mobile_barcode", carrierValue: "/ABC1234", donationCode: "919" });
  });

  it("B2B 忽略載具與捐贈", async () => {
    get.mockResolvedValue({ data: { values: [] } });
    append.mockResolvedValue({});
    const res = await POST(createRequest({ buyerType: "b2b", buyerTaxId: "85164778", carrierType: "none", carrierValue: "垃圾", donationCode: "1" }));
    expect(res.status).toBe(201);
    const row = (append.mock.calls[0]![0] as { requestBody: { values: string[][] } }).requestBody.values[0]!;
    expect(eInvoiceRowToRecord(row)).toMatchObject({ carrierType: "none", carrierValue: "", donationCode: "" });
  });
});
