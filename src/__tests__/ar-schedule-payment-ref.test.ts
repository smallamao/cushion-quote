import { describe, expect, it, vi } from "vitest";

import {
  AR_PAYMENT_METHOD_LABEL,
  AR_SCHEDULE_COLUMN_COUNT,
  AR_SCHEDULE_RANGE_DATA,
  AR_SCHEDULE_RANGE_FULL,
  AR_SCHEDULE_ROW_RANGE,
  arScheduleRecordToRow,
  arScheduleRowToRecord,
  ensureArScheduleColumns,
  isValidARPaymentMethod,
} from "@/lib/ar-utils";
import type { SheetsClient } from "@/lib/sheets-client";
import type { ARScheduleRecord } from "@/lib/types";

const OLD_ROW = [
  "AR-202611-001-S01", "AR-202611-001", "1", "訂金", "50", "4600", "2026-11-02",
  "4600", "2026-11-02", "transfer", "paid", "0", "備註", "2026-11-01T00:00:00Z", "2026-11-02T00:00:00Z",
];

describe("應收分期 末五碼／收款帳戶 欄位", () => {
  it("範圍常數涵蓋 A:Q（17 欄）", () => {
    expect(AR_SCHEDULE_COLUMN_COUNT).toBe(17);
    expect(AR_SCHEDULE_RANGE_FULL).toBe("應收分期!A:Q");
    expect(AR_SCHEDULE_RANGE_DATA).toBe("應收分期!A2:Q10000");
    expect(AR_SCHEDULE_ROW_RANGE(5)).toBe("應收分期!A5:Q5");
  });

  it("舊列（只有 A:O）解析成空字串", () => {
    const rec = arScheduleRowToRecord(OLD_ROW);
    expect(rec.paymentRef).toBe("");
    expect(rec.receivingAccountId).toBe("");
    expect(rec.notes).toBe("備註");
    expect(rec.updatedAt).toBe("2026-11-02T00:00:00Z");
  });

  it("寫回時補滿 17 欄，P/Q 依序為末五碼、收款帳戶", () => {
    const rec: ARScheduleRecord = {
      ...arScheduleRowToRecord(OLD_ROW),
      paymentRef: "18173",
      receivingAccountId: "big_custom",
    };
    const row = arScheduleRecordToRow(rec);
    expect(row).toHaveLength(AR_SCHEDULE_COLUMN_COUNT);
    expect(row.slice(0, 15)).toEqual(OLD_ROW);
    expect(row[15]).toBe("18173");
    expect(row[16]).toBe("big_custom");
    expect(arScheduleRowToRecord(row)).toEqual(rec);
  });

  it("舊列讀進來再寫回，原本 15 欄不變、新欄為空", () => {
    const row = arScheduleRecordToRow(arScheduleRowToRecord(OLD_ROW));
    expect(row).toEqual([...OLD_ROW, "", ""]);
  });
});

describe("收款方式驗證", () => {
  it("接受 LINE PAY，標籤在刷卡之後", () => {
    expect(isValidARPaymentMethod("line_pay")).toBe(true);
    expect(AR_PAYMENT_METHOD_LABEL.line_pay).toBe("LINE PAY");
    const keys = Object.keys(AR_PAYMENT_METHOD_LABEL);
    expect(keys.indexOf("line_pay")).toBe(keys.indexOf("credit_card") + 1);
  });

  it("其他既有方式照常接受，未知值／空字串／非字串拒絕", () => {
    for (const m of ["cash", "transfer", "check", "credit_card", "other"]) {
      expect(isValidARPaymentMethod(m)).toBe(true);
    }
    expect(isValidARPaymentMethod("")).toBe(false);
    expect(isValidARPaymentMethod("bitcoin")).toBe(false);
    expect(isValidARPaymentMethod("toString")).toBe(false);
    expect(isValidARPaymentMethod(undefined)).toBe(false);
    expect(isValidARPaymentMethod(3)).toBe(false);
  });
});

function mockClient(spreadsheetId: string, columnCount: number, header: string[] = []) {
  const batchUpdate = vi.fn().mockResolvedValue({});
  const update = vi.fn().mockResolvedValue({});
  const client = {
    spreadsheetId,
    sheets: {
      spreadsheets: {
        get: vi.fn().mockResolvedValue({
          data: {
            sheets: [
              { properties: { sheetId: 1, title: "應收帳款", gridProperties: { columnCount: 23 } } },
              { properties: { sheetId: 7, title: "應收分期", gridProperties: { columnCount } } },
            ],
          },
        }),
        batchUpdate,
        values: {
          get: vi.fn().mockResolvedValue({ data: { values: header.length ? [header] : undefined } }),
          update,
        },
      },
    },
  } as unknown as SheetsClient;
  return { client, batchUpdate, update };
}

describe("ensureArScheduleColumns：實體欄數不足時擴欄（冪等）", () => {
  it("只有 15 欄 → 擴 2 欄並補表頭", async () => {
    const { client, batchUpdate, update } = mockClient("sheet-a", 15);
    await ensureArScheduleColumns(client);
    expect(batchUpdate).toHaveBeenCalledTimes(1);
    expect(batchUpdate.mock.calls[0][0].requestBody.requests[0].appendDimension).toEqual({
      sheetId: 7,
      dimension: "COLUMNS",
      length: 2,
    });
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0].range).toBe("應收分期!P1:Q1");

    // 同一個試算表第二次呼叫不再查詢
    await ensureArScheduleColumns(client);
    expect(client.sheets.spreadsheets.get).toHaveBeenCalledTimes(1);
  });

  it("已有 26 欄且表頭存在 → 什麼都不寫", async () => {
    const { client, batchUpdate, update } = mockClient("sheet-b", 26, ["末五碼／驗證碼", "收款帳戶"]);
    await ensureArScheduleColumns(client);
    expect(batchUpdate).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});
