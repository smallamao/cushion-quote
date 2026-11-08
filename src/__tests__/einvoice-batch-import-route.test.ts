import { beforeEach, describe, expect, it, vi } from "vitest";

import type { EInvoiceRecord } from "@/lib/types";

const appendEInvoiceRecord = vi.hoisted(() => vi.fn());

vi.mock("@/lib/sheets-client", () => ({ getSheetsClient: async () => ({ spreadsheetId: "SS", sheets: {} }) }));
vi.mock("@/app/api/sheets/einvoices/_auth", () => ({
  getSession: async () => ({ role: "admin", email: "a@test", displayName: "tester" }),
}));
vi.mock("@/app/api/sheets/einvoices/_shared", () => ({
  appendEInvoiceRecord,
  getEInvoiceRecords: async () => [],
  getEInvoiceRows: async () => [],
}));

const { POST } = await import("@/app/api/sheets/einvoices/batch-import/route");

function row(sourceId: string, email: string) {
  return {
    sourceType: "manual",
    sourceId,
    buyerName: "馬鈴薯沙發",
    buyerUbn: "85164778",
    email,
    taxType: "應稅",
    untaxedAmount: 1000,
    taxAmount: 50,
    totalAmount: 1050,
    items: [{ name: "沙發", quantity: 1, unitPrice: 1000 }],
  };
}

function call(mode: "preview" | "commit", invoices: unknown[]) {
  return POST(new Request("http://localhost/api/sheets/einvoices/batch-import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, invoices }),
  }));
}

beforeEach(() => {
  appendEInvoiceRecord.mockReset();
  appendEInvoiceRecord.mockResolvedValue(undefined);
});

describe("POST /api/sheets/einvoices/batch-import 的 Email 防呆", () => {
  it("Email 格式錯的列不建立草稿，列在失敗清單；其他列照常建立", async () => {
    const res = await call("commit", [row("A-1", " ok@test.com "), row("A-2", "a@b.com,c@d.com")]);
    const body = (await res.json()) as { created: number; failed: number; failedRecords: Array<{ error: string }> };
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ created: 1, failed: 1 });
    expect(body.failedRecords[0]!.error).toContain("Email");
    expect(appendEInvoiceRecord).toHaveBeenCalledTimes(1);
    const saved = appendEInvoiceRecord.mock.calls[0]![1] as EInvoiceRecord;
    expect(saved).toMatchObject({ sourceId: "A-1", email: "ok@test.com", carrierType: "none", carrierValue: "", donationCode: "" });
  });

  it("預覽時標出 Email 有誤的列", async () => {
    const res = await call("preview", [row("A-1", "ok@test.com"), row("A-2", "nope")]);
    const body = (await res.json()) as { invoices: Array<{ contactError: string }> };
    expect(body.invoices.map((i) => Boolean(i.contactError))).toEqual([false, true]);
    expect(appendEInvoiceRecord).not.toHaveBeenCalled();
  });
});
