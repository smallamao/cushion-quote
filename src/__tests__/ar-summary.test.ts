import { describe, expect, it } from "vitest";

import { findArForOrder, summarizePayment, paymentToneClass } from "@/lib/ar-summary";
import type { ARRecord } from "@/lib/types";

function ar(overrides: Partial<ARRecord> = {}): ARRecord {
  return {
    totalAmount: 85600,
    receivedAmount: 30000,
    outstandingAmount: 55600,
    ...overrides,
  } as ARRecord;
}

describe("summarizePayment", () => {
  it("收了一部分：已收與尾款都要寫出來（EL S1018 的實際數字）", () => {
    const s = summarizePayment(ar());
    expect(s.tone).toBe("due");
    expect(s.label).toBe("已收 $30,000　尾款 $55,600");
  });

  it("一毛都還沒收：只講尾款，不要寫「已收 $0」", () => {
    const s = summarizePayment(ar({ receivedAmount: 0, outstandingAmount: 85600 }));
    expect(s.label).toBe("尾款 $85,600");
    expect(s.label).not.toContain("已收");
  });

  it("收清了就說已收清，不要還掛著 $0 尾款", () => {
    const s = summarizePayment(ar({ receivedAmount: 85600, outstandingAmount: 0 }));
    expect(s.tone).toBe("paid");
    expect(s.label).toBe("已收清");
  });

  it("溢收（已收大於總額）也算收清——實際資料有這種", () => {
    const s = summarizePayment(ar({ totalAmount: 21000, receivedAmount: 23100, outstandingAmount: 0 }));
    expect(s.tone).toBe("paid");
  });

  it("🔴 合併請款不可以把整批尾款講成這張訂單的尾款", () => {
    const s = summarizePayment(ar(), true);
    expect(s.tone).toBe("merged");
    expect(s.label).toContain("合併請款");
    expect(s.label).toContain("整批");
  });

  it("合併請款但已收清，照樣只說已收清", () => {
    const s = summarizePayment(ar({ receivedAmount: 85600, outstandingAmount: 0 }), true);
    expect(s.tone).toBe("paid");
  });

  it("沒有應收帳款就說未建，不要顯示 $0 讓人以為收清了", () => {
    const s = summarizePayment(null);
    expect(s.tone).toBe("none");
    expect(s.label).toBe("未建應收");
    expect(s.label).not.toContain("$0");
  });

  it("金額四捨五入到元，不要出現小數（實際有 323.5 這種）", () => {
    const s = summarizePayment(ar({ receivedAmount: 0, outstandingAmount: 323.5 }));
    expect(s.label).toBe("尾款 $324");
  });

  it("千分位要有，當面唸數字才不會看錯", () => {
    expect(summarizePayment(ar({ receivedAmount: 0, outstandingAmount: 1234567 })).label).toContain(
      "$1,234,567",
    );
  });
});

describe("paymentToneClass", () => {
  it("要收錢的最醒目，收清的不要搶眼", () => {
    expect(paymentToneClass("due")).toContain("amber");
    expect(paymentToneClass("paid")).toContain("green");
    expect(paymentToneClass("none")).toContain("tertiary");
  });
});

describe("findArForOrder", () => {
  const own = { arId: "AR-1", versionId: "V-1", arStatus: "partial" } as ARRecord;
  const monthly = { arId: "AR-M", versionId: "", arStatus: "active" } as ARRecord;
  const b2b = { arId: "AR-B", versionId: "", arStatus: "active", relatedOrderIds: ["O-9"] } as ARRecord;

  it("版本直接對上＝這張訂單自己的應收", () => {
    const r = findArForOrder({ orderId: "O-1", versionId: "V-1" }, [own]);
    expect(r?.ar.arId).toBe("AR-1");
    expect(r?.merged).toBe(false);
  });

  it("版本被併進月結＝合併請款", () => {
    const r = findArForOrder(
      { orderId: "O-1", versionId: "V-2" },
      [monthly],
      new Map([["V-2", "AR-M"]]),
    );
    expect(r?.ar.arId).toBe("AR-M");
    expect(r?.merged).toBe(true);
  });

  it("靠 relatedOrderIds 對上＝合併請款", () => {
    const r = findArForOrder({ orderId: "O-9" }, [b2b]);
    expect(r?.ar.arId).toBe("AR-B");
    expect(r?.merged).toBe(true);
  });

  it("🔴 自己的版本優先於合併，順序不可對調", () => {
    const r = findArForOrder(
      { orderId: "O-9", versionId: "V-1" },
      [b2b, own],
      new Map([["V-1", "AR-M"]]),
    );
    expect(r?.ar.arId).toBe("AR-1");
    expect(r?.merged).toBe(false);
  });

  it("🔴 已取消的應收不算，否則會顯示作廢的尾款", () => {
    const cancelled = { ...own, arStatus: "cancelled" } as ARRecord;
    expect(findArForOrder({ orderId: "O-1", versionId: "V-1" }, [cancelled])).toBeNull();
  });

  it("都對不上就回 null", () => {
    expect(findArForOrder({ orderId: "O-X", versionId: "V-X" }, [own, b2b])).toBeNull();
  });
});
