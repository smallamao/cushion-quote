import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ORDER_COL, ORDER_RANGE_IDS, columnLetter, orderRecordToRow, orderRowToRecord } from "@/lib/order-utils";

/** 假訂單表：rows[i] = 第 i+2 列 */
const sheet = vi.hoisted(() => ({
  rows: [] as string[][],
  role: "admin" as string | null,
  /** 第一次寫入「之前」改動表（模擬讀列與寫入之間有人插入列） */
  beforeFirstWrite: null as null | ((rows: string[][]) => void),
  /** 第一次寫入「之後」改動表（模擬寫完才位移，或寫入沒落地） */
  afterFirstWrite: null as null | ((rows: string[][]) => void),
}));
const audit = vi.hoisted(() => vi.fn());
const notify = vi.hoisted(() => vi.fn());
const batchUpdate = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api-auth", () => ({
  requireAdmin: async () => {
    if (sheet.role === "admin") return { session: { role: "admin", email: "a@test" } };
    return { denied: NextResponse.json({ ok: false, error: "forbidden" }, { status: sheet.role ? 403 : 401 }) };
  },
}));
vi.mock("@/lib/audit-log", () => ({ appendAuditLog: audit }));
vi.mock("@/lib/notifications-sheet", () => ({ appendNotification: notify }));
vi.mock("@/lib/notion-order", () => ({ updateNotionPageIfExists: async () => false }));
vi.mock("@/lib/sheets-client", () => ({
  getSheetsClient: async () => ({
    spreadsheetId: "SS",
    sheets: {
      spreadsheets: {
        values: {
          get: async ({ range }: { range: string }) => {
            if (range === ORDER_RANGE_IDS) return { data: { values: sheet.rows.map((r) => [r[0]]) } };
            const m = /!A(\d+):AZ\d+$/.exec(range);
            if (!m) throw new Error(`unexpected range ${range}`);
            const row = sheet.rows[Number(m[1]) - 2];
            return { data: { values: row ? [[...row]] : [] } };
          },
          batchGet: async ({ ranges }: { ranges: string[] }) => ({
            data: {
              valueRanges: ranges.map((range) => {
                const m = /!([A-Z]+)2:[A-Z]+10000$/.exec(range)!;
                const col = [...m[1]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
                return { values: sheet.rows.map((r) => [r[col] ?? ""]) };
              }),
            },
          }),
          batchUpdate: async (req: { requestBody: { data: Array<{ range: string; values: string[][] }> } }) => {
            const first = batchUpdate.mock.calls.length === 0;
            batchUpdate(req);
            if (first) sheet.beforeFirstWrite?.(sheet.rows);
            for (const d of req.requestBody.data) {
              const m = /!([A-Z]+)(\d+)$/.exec(d.range)!;
              const col = [...m[1]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
              sheet.rows[Number(m[2]) - 2][col] = d.values[0][0];
            }
            if (first) sheet.afterFirstWrite?.(sheet.rows);
            return {};
          },
        },
      },
    },
  }),
}));

const { PATCH } = await import("@/app/api/sheets/orders/[id]/shipping-cost/route");

function orderRow(id: string, shippingCost: number): string[] {
  const r = Array<string>(52).fill("");
  r[0] = id;
  r[ORDER_COL.shippingCost] = String(shippingCost);
  return r;
}

function patch(id: string, body: unknown): Promise<Response> {
  return PATCH(new Request("http://localhost/x", { method: "PATCH", body: JSON.stringify(body) }), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  sheet.rows = [orderRow("ORD-A", 0), orderRow("ORD-B", 800)];
  sheet.role = "admin";
  sheet.beforeFirstWrite = null;
  sheet.afterFirstWrite = null;
  audit.mockReset();
  notify.mockReset();
  batchUpdate.mockReset();
});

describe("PATCH /api/sheets/orders/[id]/shipping-cost", () => {
  it("columnLetter：索引 → A1 欄名", () => {
    expect([0, 18, 25, 26, 31, 51].map(columnLetter)).toEqual(["A", "S", "Z", "AA", "AF", "AZ"]);
  });

  it("ORDER_COL 的位置跟 orderRowToRecord／orderRecordToRow 讀寫的位置一致（防欄位位移）", () => {
    const row = Array<string>(52).fill("");
    row[ORDER_COL.shippingCost] = "123";
    row[ORDER_COL.updatedAt] = "2026-11-09T00:00:00.000Z";
    const rec = orderRowToRecord(row);
    expect(rec.shippingCost).toBe(123);
    expect(rec.updatedAt).toBe("2026-11-09T00:00:00.000Z");
    const written = orderRecordToRow({ ...rec, shippingCost: 4567, updatedAt: "U-MARK" });
    expect(written[ORDER_COL.shippingCost]).toBe("4567");
    expect(written[ORDER_COL.updatedAt]).toBe("U-MARK");
  });

  it("非 admin 被擋、不寫入", async () => {
    sheet.role = "technician";
    expect((await patch("ORD-A", { shippingCost: 1000, expectedCurrent: 0 })).status).toBe(403);
    sheet.role = null;
    expect((await patch("ORD-A", { shippingCost: 1000, expectedCurrent: 0 })).status).toBe(401);
    expect(batchUpdate).not.toHaveBeenCalled();
  });

  it("只寫運費成本與 updatedAt 兩格，讀回確認並記稽核", async () => {
    const res = await patch("ORD-B", { shippingCost: 1500, expectedCurrent: 800 });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, shippingCost: 1500 });
    const ranges = batchUpdate.mock.calls[0][0].requestBody.data.map((d: { range: string }) => d.range);
    expect(ranges).toEqual([
      `訂製訂單!${columnLetter(ORDER_COL.shippingCost)}3`,
      `訂製訂單!${columnLetter(ORDER_COL.updatedAt)}3`,
    ]);
    expect(sheet.rows[1][ORDER_COL.shippingCost]).toBe("1500");
    expect(sheet.rows[0][ORDER_COL.shippingCost]).toBe("0");
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ targetId: "ORD-B", action: "update" }));
  });

  it("畫面舊值跟表上不同 → 409、不寫入", async () => {
    const res = await patch("ORD-B", { shippingCost: 1500, expectedCurrent: 0 });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ currentShippingCost: 800 });
    expect(batchUpdate).not.toHaveBeenCalled();
  });

  it("目前值已等於目標 → 冪等成功、不寫入（重按一次無害）", async () => {
    await patch("ORD-A", { shippingCost: 1000, expectedCurrent: 0 });
    batchUpdate.mockReset();
    const res = await patch("ORD-A", { shippingCost: 1000, expectedCurrent: 0 });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, unchanged: true });
    expect(batchUpdate).not.toHaveBeenCalled();
  });

  it.each([
    [{ shippingCost: -1, expectedCurrent: 0 }],
    [{ shippingCost: "1000", expectedCurrent: 0 }],
    [{ shippingCost: 1000 }],
    [{ shippingCost: Number.NaN, expectedCurrent: 0 }],
  ])("驗證失敗回 400：%j", async (body) => {
    expect((await patch("ORD-A", body)).status).toBe(400);
    expect(batchUpdate).not.toHaveBeenCalled();
  });

  it("body 不是 JSON 回 400", async () => {
    const res = await PATCH(new Request("http://localhost/x", { method: "PATCH", body: "not json" }), {
      params: Promise.resolve({ id: "ORD-A" }),
    });
    expect(res.status).toBe(400);
  });

  it("讀列到寫入之間有人插入列 → 把誤寫的那列還原、回 409、記稽核", async () => {
    const other = orderRow("ORD-NEW", 300);
    other[ORDER_COL.updatedAt] = "OLD-STAMP-NEW";
    sheet.rows[1][ORDER_COL.updatedAt] = "OLD-STAMP-B";
    // ORD-B 原本在第 3 列；寫入前 ORD-NEW 插到 ORD-A 後面 → 第 3 列變成 ORD-NEW
    sheet.beforeFirstWrite = (rows) => rows.splice(1, 0, other);
    const res = await patch("ORD-B", { shippingCost: 1500, expectedCurrent: 800 });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "訂單表剛好有變動，請重新整理再試" });
    // 第 3 列（ORD-NEW）被寫過又還原成寫入前讀到的值；ORD-B 本身沒動。
    // 還原值來自 ORD-B 的舊值（800），不是 ORD-NEW 原本的 300——這就是 route 註解寫的殘餘風險，靠稽核紀錄人工修。
    expect(batchUpdate).toHaveBeenCalledTimes(2);
    const restore = batchUpdate.mock.calls[1][0].requestBody.data;
    expect(restore.map((d: { range: string }) => d.range)).toEqual([
      `訂製訂單!${columnLetter(ORDER_COL.shippingCost)}3`,
      `訂製訂單!${columnLetter(ORDER_COL.updatedAt)}3`,
    ]);
    expect(sheet.rows[1][ORDER_COL.shippingCost]).toBe("800");
    expect(sheet.rows[1][ORDER_COL.updatedAt]).toBe("OLD-STAMP-B");
    expect(sheet.rows[2][ORDER_COL.shippingCost]).toBe("800");
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ targetId: "ORD-B", summary: expect.stringContaining("需人工核對") }));
    // 被誤寫那張單的原值不明 → 不能寫「已還原」，而且要發通知給老闆
    expect(audit.mock.calls.at(-1)?.[0].summary).not.toContain("已還原");
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ type: "shipping_cost_write_conflict", body: expect.stringContaining("第 3 列") }));
  });

  it("寫完才有人插入列（寫入已落在本單）→ 照常成功、不還原", async () => {
    sheet.afterFirstWrite = (rows) => rows.unshift(orderRow("ORD-NEW", 300));
    const res = await patch("ORD-B", { shippingCost: 1500, expectedCurrent: 800 });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, shippingCost: 1500 });
    expect(batchUpdate).toHaveBeenCalledTimes(1);
    expect(sheet.rows.find((r) => r[0] === "ORD-B")?.[ORDER_COL.shippingCost]).toBe("1500");
  });

  it("寫入後讀回的值不符 → 500、不記成功稽核", async () => {
    sheet.afterFirstWrite = (rows) => {
      rows[1][ORDER_COL.shippingCost] = "800";
    };
    const res = await patch("ORD-B", { shippingCost: 1500, expectedCurrent: 800 });
    expect(res.status).toBe(500);
    expect(audit).not.toHaveBeenCalled();
  });

  it("找不到訂單回 404", async () => {
    expect((await patch("ORD-X", { shippingCost: 1, expectedCurrent: 0 })).status).toBe(404);
  });
});
