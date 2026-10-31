import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  EInvoiceRowMovedError,
  appendEInvoiceRecord,
  batchAppendEInvoiceRecords,
  deleteEInvoiceRows,
  getEInvoiceRecordById,
  getEInvoiceRows,
  updateEInvoiceRecord,
} from "@/app/api/sheets/einvoices/_shared";
import { EINVOICE_RANGE_DATA, EINVOICE_RANGE_FULL, EINVOICE_SHEET, eInvoiceRecordToRow, eInvoiceRowToRecord } from "@/lib/einvoice-utils";
import type { EInvoiceRecord } from "@/lib/types";

type Client = Parameters<typeof getEInvoiceRows>[0];

const get = vi.fn();
const update = vi.fn();
const append = vi.fn();
const batchUpdate = vi.fn();
const batchGet = vi.fn();
const sheetsGet = vi.fn();
const spreadsheetBatchUpdate = vi.fn();

const client = {
  spreadsheetId: "SS",
  sheets: { spreadsheets: { get: sheetsGet, batchUpdate: spreadsheetBatchUpdate, values: { get, update, append, batchUpdate, batchGet } } },
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
  batchGet.mockReset();
  sheetsGet.mockReset();
  spreadsheetBatchUpdate.mockReset();
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

/**
 * 依 range 回應的假發票表：整表讀取回傳所有資料列，單列讀取（A{n}:AO{n} / A{n}:A{n}）回傳該列。
 * onSingleRowRead 可在「定位完、寫入前」模擬別的請求插入／刪除列。
 */
function useFakeTable(initial: string[][], onSingleRowRead?: (table: string[][]) => void) {
  const table = initial.map((r) => [...r]);
  let hooked = false;
  const rowOf = (range: string) => Number(/!A(\d+):/.exec(range)?.[1]);
  get.mockImplementation(async ({ range }: { range: string }) => {
    if (range === EINVOICE_RANGE_DATA) return { data: { values: table.map((r) => [...r]) } };
    if (!hooked && onSingleRowRead) { hooked = true; onSingleRowRead(table); }
    const row = table[rowOf(range) - 2];
    return { data: { values: row ? [[...row]] : [] } };
  });
  batchGet.mockImplementation(async ({ ranges }: { ranges: string[] }) => {
    if (!hooked && onSingleRowRead) { hooked = true; onSingleRowRead(table); }
    return { data: { valueRanges: ranges.map((range) => ({ values: table[rowOf(range) - 2] ? [[table[rowOf(range) - 2]![0]]] : [] })) } };
  });
  update.mockImplementation(async ({ range, requestBody }: { range: string; requestBody: { values: string[][] } }) => {
    table[rowOf(range) - 2] = requestBody.values[0]!;
    return {};
  });
  return table;
}

describe("updateEInvoiceRecord", () => {
  it("寫入遇到配額錯誤時，整段重新讀取並重新定位列（不沿用舊列號）", async () => {
    const table = useFakeTable([["INV-A"], ["INV-X"]]);
    const write = update.getMockImplementation()!;
    // 第一次寫入撞配額；重試前前面一列被刪，INV-X 從第 3 列移到第 2 列
    update.mockImplementationOnce(async () => { table.splice(0, 1); throw quotaError(); });
    update.mockImplementation(write);
    const next = await updateEInvoiceRecord(client, "INV-X", (r) => ({ ...r, status: "issuing" }));
    expect(next?.status).toBe("issuing");
    expect(update.mock.calls.at(-1)?.[0]?.range).toContain("A2:");
    expect(table[0]?.[25]).toBe("issuing");
  });

  it("定位後、寫入前列被擠動（ID 不符）→ 重新定位後寫到正確的列", async () => {
    const table = useFakeTable([["INV-A"], ["INV-X"]], (t) => t.splice(0, 0, ["INV-NEW"])); // 中段插入一列
    const next = await updateEInvoiceRecord(client, "INV-X", (r) => ({ ...r, status: "issuing" }));
    expect(next?.status).toBe("issuing");
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0]?.[0]?.range).toContain("A4:");
    expect(table.map((r) => r[0])).toEqual(["INV-NEW", "INV-A", "INV-X"]);
    expect(table[1]?.[25] ?? "").toBe(""); // INV-A 沒被覆寫
  });

  it("每次確認 ID 都不符 → 拋錯，完全不寫入", async () => {
    useFakeTable([["INV-X"]]);
    get.mockImplementation(async ({ range }: { range: string }) => (
      range === EINVOICE_RANGE_DATA ? { data: { values: [["INV-X"]] } } : { data: { values: [["INV-OTHER"]] } }
    ));
    await expect(updateEInvoiceRecord(client, "INV-X", (r) => ({ ...r, status: "issuing" }))).rejects.toThrow(EInvoiceRowMovedError);
    expect(update).not.toHaveBeenCalled();
  });

  it("updater 以寫入前重新讀到的列為準（不是整表讀取時的舊值）", async () => {
    const base = Array<string>(41).fill("");
    base[0] = "INV-X";
    base[25] = "draft";
    useFakeTable([base], (t) => { t[0]![25] = "issuing"; }); // 別的請求剛寫成 issuing
    const seen: string[] = [];
    await updateEInvoiceRecord(client, "INV-X", (r) => { seen.push(r.status); return r; });
    expect(seen).toEqual(["issuing"]);
  });

  it("updater 拋錯（例如狀態不允許）時不寫入、直接拋出", async () => {
    useFakeTable([["INV-X"]]);
    await expect(updateEInvoiceRecord(client, "INV-X", () => { throw new Error("guard"); })).rejects.toThrow("guard");
    expect(update).not.toHaveBeenCalled();
  });
});

describe("deleteEInvoiceRows", () => {
  beforeEach(() => {
    sheetsGet.mockResolvedValue({ data: { sheets: [{ properties: { title: EINVOICE_SHEET, sheetId: 7 } }] } });
    spreadsheetBatchUpdate.mockResolvedValue({});
  });

  it("刪除前逐列確認 ID 相符，再由下往上 deleteDimension", async () => {
    useFakeTable([["A"], ["B"], ["C"]]);
    await deleteEInvoiceRows(client, [{ sheetRow: 2, invoiceId: "A" }, { sheetRow: 4, invoiceId: "C" }]);
    const requests = spreadsheetBatchUpdate.mock.calls[0]?.[0]?.requestBody.requests;
    expect(requests.map((r: { deleteDimension: { range: { startIndex: number } } }) => r.deleteDimension.range.startIndex)).toEqual([3, 1]);
  });

  it("任何一列 ID 不符 → 整批中止，一列都不刪", async () => {
    useFakeTable([["A"], ["B"], ["C"]], (t) => t.splice(0, 0, ["NEW"]));
    await expect(deleteEInvoiceRows(client, [{ sheetRow: 2, invoiceId: "A" }, { sheetRow: 4, invoiceId: "C" }])).rejects.toThrow(EInvoiceRowMovedError);
    expect(spreadsheetBatchUpdate).not.toHaveBeenCalled();
  });
});
