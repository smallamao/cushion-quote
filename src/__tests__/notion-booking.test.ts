import { describe, expect, it } from "vitest";

import {
  BOOKING_NEEDS,
  BOOKING_SOURCES,
  BOOKING_STATUSES,
  buildBookingProperties,
  describeBooking,
  formatVisitLabel,
  normalizeVisitAt,
  validateBooking,
} from "@/lib/notion-booking";

const NOW = new Date("2026-11-08T10:00:00+08:00");

function ok(input: Parameters<typeof validateBooking>[0]) {
  const r = validateBooking({ name: "黃小姐", visitAt: "2026-11-10T14:30", ...input }, NOW);
  expect(r.errors).toEqual([]);
  return r.booking!;
}

describe("formatVisitLabel", () => {
  // 基準用系統 date 查過：11/08 日、11/09 一、11/10 二、11/14 六
  it.each([
    ["2026-11-08T14:30", "11/8（日） 14:30"],
    ["2026-11-09T09:00", "11/9（一） 09:00"],
    ["2026-11-10T14:30", "11/10（二） 14:30"],
    ["2026-11-14T16:00", "11/14（六） 16:00"],
  ])("%s → %s", (iso, expected) => {
    expect(formatVisitLabel(iso)).toBe(expected);
  });

  it("🔴 帶 +08:00 也不可以算錯星期（getUTCDay 會退一天）", () => {
    expect(formatVisitLabel("2026-11-10T14:30:00+08:00")).toContain("（二）");
  });

  it("只有日期就不印時間", () => {
    expect(formatVisitLabel("2026-11-14")).toBe("11/14（六）");
  });
});

describe("normalizeVisitAt", () => {
  it("補上台灣時區", () => {
    expect(normalizeVisitAt("2026-11-10T14:30")).toBe("2026-11-10T14:30:00+08:00");
  });
  it("空白用空格分隔也吃得下（語音轉文字常這樣）", () => {
    expect(normalizeVisitAt("2026-11-10 14:30")).toBe("2026-11-10T14:30:00+08:00");
  });
  it("只有日期就保留日期", () => {
    expect(normalizeVisitAt("2026-11-10")).toBe("2026-11-10");
  });
  it("看不懂就回 null，不要猜", () => {
    expect(normalizeVisitAt("下禮拜二下午")).toBeNull();
    expect(normalizeVisitAt("")).toBeNull();
  });
});

describe("validateBooking", () => {
  it("缺稱呼或時間就擋下來", () => {
    const r = validateBooking({ phone: "0920222559" }, NOW);
    expect(r.ok).toBe(false);
    expect(r.errors).toContain("缺客人稱呼");
    expect(r.errors).toContain("缺參觀時間");
  });

  it("預設來源電話、狀態預約參觀——開車接電話就是這個情境", () => {
    const b = ok({});
    expect(b.source).toBe("電話");
    expect(b.status).toBe("預約參觀");
  });

  it("🔴 select 不在白名單就報錯，絕不可以送進 Notion 新增選項", () => {
    const r = validateBooking(
      { name: "黃小姐", visitAt: "2026-11-10T14:30", need: "想試坐乳膠墊" },
      NOW,
    );
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain("不在既有選項裡");
    expect(r.errors[0]).toContain("新建案");
  });

  it("🔴 來源與狀態同樣鎖白名單", () => {
    expect(validateBooking({ name: "A", visitAt: "2026-11-10T14:30", source: "抖音" }, NOW).ok).toBe(false);
    expect(validateBooking({ name: "A", visitAt: "2026-11-10T14:30", status: "亂填" }, NOW).ok).toBe(false);
  });

  it("白名單內的值照收", () => {
    for (const s of BOOKING_SOURCES) expect(ok({ source: s }).source).toBe(s);
    for (const s of BOOKING_STATUSES) expect(ok({ status: s }).status).toBe(s);
    for (const n of BOOKING_NEEDS) expect(ok({ need: n }).need).toBe(n);
  });

  it("時間已經過去要警告但不擋——可能是補登", () => {
    const r = validateBooking({ name: "黃小姐", visitAt: "2026-11-01T14:30" }, NOW);
    expect(r.ok).toBe(true);
    expect(r.warnings[0]).toContain("已經過去");
  });

  it("只給日期時，當天結束前都不算過去", () => {
    expect(validateBooking({ name: "黃小姐", visitAt: "2026-11-08" }, NOW).warnings).toEqual([]);
  });
});

describe("buildBookingProperties", () => {
  it("必填三個欄位一定在", () => {
    const p = buildBookingProperties(ok({ phone: "0920222559" }));
    expect(p.Name).toEqual({ title: [{ text: { content: "黃小姐" } }] });
    expect(p.來源).toEqual({ select: { name: "電話" } });
    expect(p.狀態).toEqual({ multi_select: [{ name: "預約參觀" }] });
    expect(p.參觀時間).toEqual({ date: { start: "2026-11-10T14:30:00+08:00" } });
  });

  it("🔴 空值不送——送空字串會在 Notion 建出空白選項或清掉內容", () => {
    const p = buildBookingProperties(ok({}));
    expect(p.聯絡電話).toBeUndefined();
    expect(p.需求).toBeUndefined();
    expect(p.配送區域).toBeUndefined();
    expect(p.內部備註).toBeUndefined();
  });

  it("有填就送", () => {
    const p = buildBookingProperties(ok({ area: "新北市中和區", sofaSize: "L型 270cm", notes: "舊沙發要回收" }));
    expect(p.配送區域).toEqual({ rich_text: [{ text: { content: "新北市中和區" } }] });
    expect(p.預計訂製沙發尺寸).toEqual({ rich_text: [{ text: { content: "L型 270cm" } }] });
    expect(p.內部備註).toEqual({ rich_text: [{ text: { content: "舊沙發要回收" } }] });
  });
});

describe("describeBooking", () => {
  it("唸出來是人話，不是欄位清單", () => {
    const line = describeBooking(ok({ phone: "0920222559", area: "新北市中和區" }));
    expect(line).toContain("黃小姐");
    expect(line).toContain("11/10（二） 14:30");
    expect(line).toContain("電話 0920222559");
    expect(line).not.toContain("visitAt");
  });
});
