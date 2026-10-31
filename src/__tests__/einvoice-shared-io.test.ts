import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  appendEInvoiceRecord,
  batchAppendEInvoiceRecords,
  getEInvoiceRecordById,
  getEInvoiceRows,
  updateEInvoiceRecord,
} from "@/app/api/sheets/einvoices/_shared";
import { EINVOICE_RANGE_FULL, eInvoiceRecordToRow, eInvoiceRowToRecord } from "@/lib/einvoice-utils";
import type { EInvoiceRecord } from "@/lib/types";

type Client = Parameters<typeof getEInvoiceRows>[0];

const get = vi.fn();
const update = vi.fn();
const append = vi.fn();
const batchUpdate = vi.fn();

const client = {
  spreadsheetId: "SS",
  sheets: { spreadsheets: { values: { get, update, append, batchUpdate } } },
} as unknown as Client;

function record(invoiceId: string, status: EInvoiceRecord["status"] = "draft"): EInvoiceRecord {
  const row = Array<string>(41).fill("");
  row[0] = invoiceId;
  row[25] = status;
  return eInvoiceRowToRecord(row);
}

function quotaError(): Error {
  return Object.assign(new Error("Quota exceeded for quota metric 'Write requests'"), { code: 429 });
}

// 測試中不真的等 2/5/10 秒
vi.mock("@/lib/sheets-retry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sheets-retry")>();
  return {
    ...actual,
    withSheetsRetry: <T,>(fn: () => Promise<T>, options: Parameters<typeof actual.withSheetsRetry>[1] = {}) =>
      actual.withSheetsRetry(fn, { ...options, sleep: async () => {} }),
  };
});

beforeEach(() => {
  get.mockReset();
  update.mockReset();
  append.mockReset();
  batchUpdate.mockReset();
});

describe("getEInvoiceRows", () => {
  it("讀取失敗要拋出，不能回傳空陣列（否則防重複與編號都會失效）", async () => {
    get.mockRejectedValue(new Error("backend error"));
    await expect(getEInvoiceRows(client)).rejects.toThrow("backend error");
    await expect(getEInvoiceRecordById(client, "INV-1")).rejects.toThrow("backend error");
  });

  it("配額錯誤會重試", async () => {
    get.mockRejectedValueOnce(quotaError()).mockResolvedValueOnce({ data: { values: [["INV-1"]] } });
    await expect(getEInvoiceRows(client)).resolves.toEqual([["INV-1"]]);
    expect(get).toHaveBeenCalledTimes(2);
  });
});

describe("appendEInvoiceRecord / batchAppendEInvoiceRecords", () => {
  it("用 values.append + INSERT_ROWS 插入新列，不計算列號也不覆寫既有列", async () => {
    append.mockResolvedValue({});
    const r = record("INV-NEW");
    await appendEInvoiceRecord(client, r);
    expect(get).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(append).toHaveBeenCalledWith(expect.objectContaining({
      range: EINVOICE_RANGE_FULL,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [eInvoiceRecordToRow(r)] },
    }));
  });

  it("批次也用一次 append 插入多列", async () => {
    append.mockResolvedValue({});
    await batchAppendEInvoiceRecords(client, [record("A"), record("B")]);
    expect(batchUpdate).not.toHaveBeenCalled();
    expect(append).toHaveBeenCalledTimes(1);
    expect(append.mock.calls[0]?.[0]?.insertDataOption).toBe("INSERT_ROWS");
    expect(append.mock.calls[0]?.[0]?.requestBody.values).toHaveLength(2);
  });
});

describe("updateEInvoiceRecord", () => {
  it("寫入遇到配額錯誤時，重試會重新讀取並重新定位列（不沿用舊列號）", async () => {
    get
      .mockResolvedValueOnce({ data: { values: [["INV-A"], ["INV-X"]] } }) // 第一次：INV-X 在第 3 列
      .mockResolvedValueOnce({ data: { values: [["INV-X"]] } }); // 重試：前面一列被刪，INV-X 移到第 2 列
    update.mockRejectedValueOnce(quotaError()).mockResolvedValueOnce({});
    const next = await updateEInvoiceRecord(client, "INV-X", (r) => ({ ...r, status: "issuing" }));
    expect(next?.status).toBe("issuing");
    expect(get).toHaveBeenCalledTimes(2);
    expect(update.mock.calls[0]?.[0]?.range).toContain("A3:");
    expect(update.mock.calls[1]?.[0]?.range).toContain("A2:");
  });

  it("updater 拋錯（例如狀態不允許）時不寫入、直接拋出", async () => {
    get.mockResolvedValue({ data: { values: [["INV-X"]] } });
    await expect(updateEInvoiceRecord(client, "INV-X", () => { throw new Error("guard"); })).rejects.toThrow("guard");
    expect(update).not.toHaveBeenCalled();
  });
});
