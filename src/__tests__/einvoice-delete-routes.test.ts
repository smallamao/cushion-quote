import { beforeEach, describe, expect, it, vi } from "vitest";

import { EINVOICE_RANGE_DATA, EINVOICE_SHEET } from "@/lib/einvoice-utils";

/** 假發票表：rows[i] = 第 i+2 列；beforeVerify 可在刪除前的確認讀取之前擠動列 */
const sheet = vi.hoisted(() => ({
  rows: [] as string[][],
  beforeVerify: null as null | ((rows: string[][]) => void),
}));
const batchUpdate = vi.hoisted(() => vi.fn());
const clear = vi.hoisted(() => vi.fn());

vi.mock("@/app/api/sheets/einvoices/_auth", () => ({
  getSession: async () => ({ role: "admin", email: "a@test", displayName: "tester" }),
}));
vi.mock("@/lib/audit-log", () => ({ appendAuditLog: () => {} }));
vi.mock("@/lib/sheets-client", () => ({
  getSheetsClient: async () => ({
    spreadsheetId: "SS",
    sheets: {
      spreadsheets: {
        get: async () => ({ data: { sheets: [{ properties: { title: EINVOICE_SHEET, sheetId: 7 } }] } }),
        batchUpdate,
        values: {
          get: async ({ range }: { range: string }) => {
            if (range !== EINVOICE_RANGE_DATA) throw new Error(`unexpected range ${range}`);
            return { data: { values: sheet.rows.map((r) => [...r]) } };
          },
          batchGet: async ({ ranges }: { ranges: string[] }) => {
            sheet.beforeVerify?.(sheet.rows);
            return {
              data: {
                valueRanges: ranges.map((range) => {
                  const row = sheet.rows[Number(/!A(\d+):/.exec(range)?.[1]) - 2];
                  return { values: row ? [[row[0]]] : [] };
                }),
              },
            };
          },
          clear,
        },
      },
    },
  }),
}));

const { POST: BATCH_DELETE } = await import("@/app/api/sheets/einvoices/batch-delete/route");
const { POST: CLEANUP } = await import("@/app/api/sheets/einvoices/cleanup/route");
const { DELETE: SINGLE_DELETE } = await import("@/app/api/sheets/einvoices/[invoiceId]/route");

function row(id: string, status: string): string[] {
  const r = Array<string>(41).fill("");
  r[0] = id;
  r[25] = status;
  return r;
}

function deletedStartIndices(): number[] {
  const requests = batchUpdate.mock.calls[0]?.[0]?.requestBody.requests ?? [];
  return requests.map((r: { deleteDimension: { range: { startIndex: number } } }) => r.deleteDimension.range.startIndex);
}

function post(body: unknown): Request {
  return new Request("http://localhost/x", { method: "POST", body: JSON.stringify(body) });
}

beforeEach(() => {
  sheet.rows = [row("A", "draft"), row("B", "issued"), row("C", "failed")];
  sheet.beforeVerify = null;
  batchUpdate.mockReset();
  batchUpdate.mockResolvedValue({});
  clear.mockReset();
});

describe("batch-delete", () => {
  it("確認 ID 相符後由下往上刪除，已開立的跳過", async () => {
    const res = await BATCH_DELETE(post({ invoiceIds: ["A", "B", "C"] }));
    expect(res.status).toBe(200);
    expect(deletedStartIndices()).toEqual([3, 1]);
  });

  it("刪除前列被擠動（ID 不符）→ 整批不刪，回 409", async () => {
    sheet.beforeVerify = (rows) => rows.splice(0, 0, row("NEW", "issued"));
    const res = await BATCH_DELETE(post({ invoiceIds: ["A", "C"] }));
    expect(res.status).toBe(409);
    expect(batchUpdate).not.toHaveBeenCalled();
  });
});

describe("cleanup（刪除所有失敗紀錄）", () => {
  it("改用 deleteDimension 整列刪除，不再 values.clear 留下空白列", async () => {
    const res = await CLEANUP(post({}));
    expect(res.status).toBe(200);
    expect(clear).not.toHaveBeenCalled();
    expect(deletedStartIndices()).toEqual([3]);
  });

  it("列被擠動 → 不刪", async () => {
    sheet.beforeVerify = (rows) => rows.splice(0, 0, row("NEW", "issued"));
    const res = await CLEANUP(post({}));
    expect(res.status).toBe(409);
    expect(batchUpdate).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/sheets/einvoices/[id]", () => {
  it("單筆刪除前確認 ID；不符就不刪", async () => {
    sheet.beforeVerify = (rows) => rows.splice(0, 0, row("NEW", "issued"));
    const res = await SINGLE_DELETE(new Request("http://localhost/x?invoiceId=A", { method: "DELETE" }));
    expect(res.status).toBe(409);
    expect(batchUpdate).not.toHaveBeenCalled();
  });

  it("cleanup-failed 模式同樣先確認再刪", async () => {
    const res = await SINGLE_DELETE(new Request("http://localhost/x?mode=cleanup-failed", { method: "DELETE" }));
    expect(res.status).toBe(200);
    expect(deletedStartIndices()).toEqual([3]);
  });
});
