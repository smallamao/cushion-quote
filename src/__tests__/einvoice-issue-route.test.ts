import { beforeEach, describe, expect, it, vi } from "vitest";

import { EINVOICE_ERROR_CODE } from "@/lib/einvoice-issue";
import { EINVOICE_EVENT_SHEET, eInvoiceRecordToRow, eInvoiceRowToRecord } from "@/lib/einvoice-utils";
import type { EInvoiceRecord } from "@/lib/types";

/** 記憶體中的假發票表：rows[i] = 第 i+2 列；可注入寫入失敗 */
const sheet = vi.hoisted(() => ({
  rows: [] as string[][],
  events: [] as string[][],
  log: [] as string[],
  failUpdate: [] as Array<Error | null>,
  failEventAppend: null as Error | null,
  /** 每次 update 寫入後呼叫（模擬別的請求在中間寫入） */
  afterUpdate: null as null | ((rows: string[][]) => void),
}));

const issueB2CInvoice = vi.hoisted(() => vi.fn());
const issueB2BInvoice = vi.hoisted(() => vi.fn());

vi.mock("@/lib/giveme-client", () => ({ issueB2CInvoice, issueB2BInvoice }));
// 鎖定後的確認等待在測試中設為 0
vi.mock("@/lib/einvoice-issue", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/einvoice-issue")>();
  return { ...actual, ISSUE_TIMING: { ...actual.ISSUE_TIMING, lockSettleMs: 0 } };
});
vi.mock("@/app/api/sheets/einvoices/_auth", () => ({
  getSession: async () => ({ role: "admin", email: "a@test", displayName: "tester" }),
}));
vi.mock("@/lib/sheets-retry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sheets-retry")>();
  return {
    ...actual,
    withSheetsRetry: <T,>(fn: () => Promise<T>, options: Parameters<typeof actual.withSheetsRetry>[1] = {}) =>
      actual.withSheetsRetry(fn, { ...options, sleep: async () => {} }),
  };
});
vi.mock("@/lib/sheets-client", () => ({
  getSheetsClient: async () => ({
    spreadsheetId: "SS",
    sheets: {
      spreadsheets: {
        values: {
          get: async ({ range }: { range: string }) => {
            const single = /!A(\d+):AO(\d+)$/.exec(range);
            if (single && single[1] === single[2]) {
              const row = sheet.rows[Number(single[1]) - 2];
              return { data: { values: row ? [[...row]] : [] } };
            }
            return { data: { values: sheet.rows.map((r) => [...r]) } };
          },
          update: async ({ range, requestBody }: { range: string; requestBody: { values: string[][] } }) => {
            const next = sheet.failUpdate.shift();
            if (next) throw next;
            const rowNo = Number(/!A(\d+):/.exec(range)?.[1]);
            const values = requestBody.values[0] ?? [];
            sheet.log.push(`update:${values[25]}`);
            sheet.rows[rowNo - 2] = values;
            sheet.afterUpdate?.(sheet.rows);
            return {};
          },
          append: async ({ range, requestBody }: { range: string; requestBody: { values: string[][] } }) => {
            if (range.startsWith(EINVOICE_EVENT_SHEET)) {
              if (sheet.failEventAppend) throw sheet.failEventAppend;
              sheet.log.push(`event:${requestBody.values[0]?.[2]}`);
              sheet.events.push(...requestBody.values);
              return {};
            }
            sheet.rows.push(...requestBody.values);
            return {};
          },
        },
      },
    },
  }),
}));

const { POST } = await import("@/app/api/sheets/einvoices/[invoiceId]/issue/route");
const { POST: RESOLVE } = await import("@/app/api/sheets/einvoices/[invoiceId]/resolve-issuing/route");

function seed(overrides: Partial<EInvoiceRecord> = {}): void {
  const row = Array<string>(41).fill("");
  row[0] = "INV-1";
  const record: EInvoiceRecord = {
    ...eInvoiceRowToRecord(row),
    buyerType: "b2c",
    buyerName: "王小明",
    totalAmount: 1050,
    untaxedAmount: 1000,
    taxAmount: 50,
    itemsJson: JSON.stringify([{ name: "沙發換布", quantity: 1, unitPrice: 1050, amount: 1050, remark: "", taxType: 0 }]),
    status: "draft",
    ...overrides,
  };
  sheet.rows = [eInvoiceRecordToRow(record)];
}

function current(): EInvoiceRecord {
  return eInvoiceRowToRecord(sheet.rows[0]!);
}

async function callIssue() {
  const res = await POST(
    new Request("http://localhost/api/sheets/einvoices/INV-1/issue", { method: "POST", body: "{}" }),
    { params: Promise.resolve({ invoiceId: "INV-1" }) },
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> & { invoice?: EInvoiceRecord } };
}

function quotaError(): Error {
  return Object.assign(new Error("Quota exceeded for quota metric 'Write requests'"), { code: 429 });
}

beforeEach(() => {
  sheet.rows = [];
  sheet.events = [];
  sheet.log = [];
  sheet.failUpdate = [];
  sheet.failEventAppend = null;
  sheet.afterUpdate = null;
  issueB2CInvoice.mockReset();
  issueB2BInvoice.mockReset();
  issueB2CInvoice.mockImplementation(async () => {
    sheet.log.push("giveme");
    return { success: true, code: "FP52472809", msg: "" };
  });
});

describe("POST /api/sheets/einvoices/[id]/issue", () => {
  it("呼叫 Giveme 前一定先把狀態寫成 issuing", async () => {
    seed();
    const { status, body } = await callIssue();
    expect(status).toBe(200);
    expect(sheet.log.indexOf("update:issuing")).toBeGreaterThanOrEqual(0);
    expect(sheet.log.indexOf("update:issuing")).toBeLessThan(sheet.log.indexOf("giveme"));
    expect(current()).toMatchObject({ status: "issued", providerInvoiceNo: "FP52472809" });
    expect(body.invoice?.status).toBe("issued");
  });

  it("issuing 寫不進去 → 不呼叫 Giveme，回 before_provider，紀錄維持 draft", async () => {
    seed();
    sheet.failUpdate = [new Error("backend error")];
    const { status, body } = await callIssue();
    expect(issueB2CInvoice).not.toHaveBeenCalled();
    expect(body.stage).toBe("before_provider");
    expect(status).toBeGreaterThanOrEqual(500);
    expect(current().status).toBe("draft");
  });

  it("已開立的紀錄不能再送出（伺服器端狀態守衛）", async () => {
    seed({ status: "issued" });
    const { status, body } = await callIssue();
    expect(status).toBe(409);
    expect(body.stage).toBe("before_provider");
    expect(issueB2CInvoice).not.toHaveBeenCalled();
  });

  it("開立中的紀錄不能再送出", async () => {
    seed({ status: "issuing" });
    const { status } = await callIssue();
    expect(status).toBe(409);
    expect(issueB2CInvoice).not.toHaveBeenCalled();
  });

  it("Giveme 逾時 → needs_review + PROVIDER_UNKNOWN，回 provider_unknown", async () => {
    seed();
    issueB2CInvoice.mockRejectedValue(new Error("Giveme API timeout (15s)"));
    const { status, body } = await callIssue();
    expect(status).toBe(502);
    expect(body.stage).toBe("provider_unknown");
    expect(current()).toMatchObject({ status: "needs_review", errorCode: EINVOICE_ERROR_CODE.providerUnknown });
    expect(body.invoice?.status).toBe("needs_review");
  });

  it("Giveme 明確回失敗 → failed，回 502 + provider.success false", async () => {
    seed();
    issueB2CInvoice.mockResolvedValue({ success: false, code: "", msg: "載具錯誤" });
    const { status, body } = await callIssue();
    expect(status).toBe(502);
    expect((body.provider as { success: boolean }).success).toBe(false);
    expect(current().status).toBe("failed");
  });

  it("Giveme 成功但寫回 issued 失敗 → 改寫 needs_review + ISSUED_RECORD_WRITE_FAILED，回 200 ok + warning", async () => {
    seed();
    sheet.failUpdate = [null, new Error("Internal error encountered.")];
    const { status, body } = await callIssue();
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(String(body.warning)).toContain("請勿重開");
    expect(current()).toMatchObject({
      status: "needs_review",
      providerInvoiceNo: "FP52472809",
      errorCode: EINVOICE_ERROR_CODE.issuedRecordWriteFailed,
    });
    expect(body.invoice?.status).toBe("needs_review");
  });

  it("Giveme 成功、兩次寫回都失敗 → 仍回 200 ok，回傳 needs_review（狀態不明），紀錄停在 issuing 不可重開", async () => {
    seed();
    sheet.failUpdate = [null, new Error("Internal error"), new Error("Internal error")];
    const { status, body } = await callIssue();
    expect(status).toBe(200);
    expect(body.invoice?.status).toBe("needs_review");
    expect(body.invoice?.providerInvoiceNo).toBe("FP52472809");
    expect(current().status).toBe("issuing");
  });

  it("Giveme 成功、只有事件 log 寫不進去 → 紀錄維持 issued，不降級", async () => {
    seed();
    sheet.failEventAppend = quotaError();
    const { status, body } = await callIssue();
    expect(status).toBe(200);
    expect(current().status).toBe("issued");
    expect(body.invoice?.status).toBe("issued");
  });

  it("issuing 寫完時剩餘時間不足 30 秒 → 不呼叫 Giveme，狀態改回原本的 draft", async () => {
    seed();
    const t0 = 1_700_000_000_000;
    let calls = 0;
    const spy = vi.spyOn(Date, "now").mockImplementation(() => (calls++ === 0 ? t0 : t0 + 25_000));
    try {
      const { status, body } = await callIssue();
      expect(issueB2CInvoice).not.toHaveBeenCalled();
      expect(status).toBe(503);
      expect(body.stage).toBe("before_provider");
      expect(current().status).toBe("draft");
    } finally {
      spy.mockRestore();
    }
  });
});

describe("同一張發票同時送出兩次（鎖定權杖）", () => {
  it("兩個請求同時進來，只有一個呼叫 Giveme，另一個回 409 before_provider", async () => {
    seed();
    const [r1, r2] = await Promise.all([callIssue(), callIssue()]);
    expect(issueB2CInvoice).toHaveBeenCalledTimes(1);
    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([200, 409]);
    const loser = r1.status === 409 ? r1 : r2;
    expect(loser.body.stage).toBe("before_provider");
    expect(current()).toMatchObject({ status: "issued", providerInvoiceNo: "FP52472809" });
  });

  it("寫入 issuing 後權杖被別的請求蓋掉 → 不呼叫 Giveme，回 409", async () => {
    seed();
    sheet.afterUpdate = (rows) => {
      sheet.afterUpdate = null;
      rows[0]![28] = "LOCK:someone-else";
    };
    const { status, body } = await callIssue();
    expect(status).toBe(409);
    expect(body.stage).toBe("before_provider");
    expect(issueB2CInvoice).not.toHaveBeenCalled();
    expect(current().providerTrackNo).toBe("LOCK:someone-else"); // 不動別人的鎖
  });

  it("開立完成後清掉權杖", async () => {
    seed();
    await callIssue();
    expect(current().providerTrackNo).toBe("");
  });

  it("Giveme 明確失敗後也清掉權杖", async () => {
    seed();
    issueB2CInvoice.mockResolvedValue({ success: false, code: "", msg: "載具錯誤" });
    await callIssue();
    expect(current()).toMatchObject({ status: "failed", providerTrackNo: "" });
  });
});

async function callResolve(payload: Record<string, unknown>) {
  const res = await RESOLVE(
    new Request("http://localhost/api/sheets/einvoices/INV-1/resolve-issuing", { method: "POST", body: JSON.stringify(payload) }),
    { params: Promise.resolve({ invoiceId: "INV-1" }) },
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> & { invoice?: EInvoiceRecord } };
}

describe("POST /api/sheets/einvoices/[id]/resolve-issuing", () => {
  const staleIssuing = { status: "issuing" as const, updatedAt: "2020-01-01T00:00:00.000Z" };

  it("卡在開立中 → 填發票號碼改為已開立", async () => {
    seed(staleIssuing);
    const { status, body } = await callResolve({ action: "mark_issued", providerInvoiceNo: "FP52472809" });
    expect(status).toBe(200);
    expect(body.invoice?.status).toBe("issued");
    expect(current()).toMatchObject({ status: "issued", providerInvoiceNo: "FP52472809" });
  });

  it("確認沒開出 → 改為失敗", async () => {
    seed(staleIssuing);
    const { status } = await callResolve({ action: "mark_failed" });
    expect(status).toBe(200);
    expect(current().status).toBe("failed");
  });

  it("發票號碼格式錯誤 → 400，不寫入", async () => {
    seed(staleIssuing);
    const { status } = await callResolve({ action: "mark_issued", providerInvoiceNo: "" });
    expect(status).toBe(400);
    expect(current().status).toBe("issuing");
  });

  it("已開立的發票不能用這個端點改成失敗 → 409", async () => {
    seed({ status: "issued" });
    const { status } = await callResolve({ action: "mark_failed" });
    expect(status).toBe(409);
    expect(current().status).toBe("issued");
  });
});

describe("開立前的載具／Email／捐贈防呆", () => {
  it.each([
    ["填了載具但類型是無（以前會被默默丟掉）", { carrierType: "none" as const, carrierValue: "/ABC1234" }],
    ["手機條碼格式錯", { carrierType: "mobile_barcode" as const, carrierValue: "/AB" }],
    ["自然人憑證", { carrierType: "mobile_barcode" as const, carrierValue: "AB12345678901234" }],
    ["捐贈碼格式錯", { donationCode: "1" }],
    ["Email 錯", { email: "nope" }],
  ])("%s → 400 before_provider，不呼叫 Giveme、紀錄不動", async (_label, overrides) => {
    seed(overrides);
    const { status, body } = await callIssue();
    expect(status).toBe(400);
    expect(body.stage).toBe("before_provider");
    expect(issueB2CInvoice).not.toHaveBeenCalled();
    expect(current().status).toBe("draft");
  });

  it("手機條碼正規化後送 phone", async () => {
    seed({ carrierType: "mobile_barcode", carrierValue: "／abc1234", donationCode: "919", email: "a@b.com" });
    const { status } = await callIssue();
    expect(status).toBe(200);
    const input = issueB2CInvoice.mock.calls[0]![0] as Record<string, unknown>;
    expect(input).toMatchObject({ phone: "/ABC1234", donationCode: "919", email: "a@b.com" });
    expect(input.orderCode).toBeUndefined();
    expect(current().carrierValue).toBe("/ABC1234");
  });

  it("會員載具送 orderCode；無載具兩個都不送", async () => {
    seed({ carrierType: "member_code", carrierValue: "0912345678" });
    await callIssue();
    const input = issueB2CInvoice.mock.calls[0]![0] as Record<string, unknown>;
    expect(input).toMatchObject({ orderCode: "0912345678" });
    expect(input.phone).toBeUndefined();

    issueB2CInvoice.mockClear();
    seed();
    await callIssue();
    const plain = issueB2CInvoice.mock.calls[0]![0] as Record<string, unknown>;
    expect(plain.phone).toBeUndefined();
    expect(plain.orderCode).toBeUndefined();
  });
});
