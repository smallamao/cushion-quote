import { describe, expect, it } from "vitest";

import {
  duplicateWarning,
  findIdenticalPurchases,
  type DuplicateCandidate,
} from "@/lib/purchase-duplicates";
import {
  PURCHASE_STATUSES,
  isPurchaseStatus,
  purchaseStatusLabel,
} from "@/lib/purchase-status";
import { buildPurchaseProposal } from "@/lib/assistant/purchase-proposal";

/** 取材自 2026-10-30 真實的那對雙胞胎（盟哲 NT$19,160，建立時間差 61 秒） */
function po(
  purchaseId: string,
  overrides: Partial<DuplicateCandidate> = {},
): DuplicateCandidate {
  return {
    purchaseId,
    purchaseDate: "2026-10-30",
    supplierId: "PS003",
    totalAmount: "19160",
    status: "draft",
    itemSignature: ["LY76|1.5|300|P6292", "LY3169|5|300|S1092維修"],
    ...overrides,
  };
}

describe("purchase status", () => {
  it("sent 必須在合法狀態裡——漏掉它就改不成「已送出」", () => {
    expect(PURCHASE_STATUSES).toContain("sent");
    expect(isPurchaseStatus("sent")).toBe(true);
    expect(purchaseStatusLabel("sent")).toBe("已送出給廠商");
  });

  it("不認得的狀態原樣回傳，不要變成 undefined", () => {
    expect(purchaseStatusLabel("weird")).toBe("weird");
    expect(isPurchaseStatus("weird")).toBe(false);
  });
});

describe("findIdenticalPurchases", () => {
  it("日期／廠商／金額／明細全同就算重複", () => {
    const all = [po("PS-20261030-04"), po("PS-20261030-10")];
    expect(findIdenticalPurchases("PS-20261030-04", all).map((d) => d.purchaseId)).toEqual([
      "PS-20261030-10",
    ]);
  });

  it("明細順序不同仍算重複", () => {
    const all = [
      po("PS-A"),
      po("PS-B", { itemSignature: ["LY3169|5|300|S1092維修", "LY76|1.5|300|P6292"] }),
    ];
    expect(findIdenticalPurchases("PS-A", all)).toHaveLength(1);
  });

  it("金額不同就不是重複", () => {
    const all = [po("PS-A"), po("PS-B", { totalAmount: "19161" })];
    expect(findIdenticalPurchases("PS-A", all)).toHaveLength(0);
  });

  it("廠商不同就不是重複", () => {
    const all = [po("PS-A"), po("PS-B", { supplierId: "PS999" })];
    expect(findIdenticalPurchases("PS-A", all)).toHaveLength(0);
  });

  it("空明細不算重複——那是沒填完的空單，不是雙胞胎", () => {
    const all = [po("PS-A", { itemSignature: [] }), po("PS-B", { itemSignature: [] })];
    expect(findIdenticalPurchases("PS-A", all)).toHaveLength(0);
  });

  it("查無該單時回空陣列，不要炸掉", () => {
    expect(findIdenticalPurchases("PS-NOPE", [po("PS-A")])).toEqual([]);
  });

  it("三胞胎要全部抓出來（9/05 清豐就是送了三次）", () => {
    const all = [po("PS-1"), po("PS-2"), po("PS-3")];
    expect(findIdenticalPurchases("PS-1", all)).toHaveLength(2);
  });
});

describe("duplicateWarning", () => {
  it("沒有重複就不要製造雜訊", () => {
    expect(duplicateWarning([])).toBe("");
  });

  it("有重複就點名單號與狀態，而且狀態要印中文不是代碼", () => {
    const w = duplicateWarning([po("PS-20261030-10")]);
    expect(w).toContain("PS-20261030-10");
    expect(w).toContain("草稿");
    expect(w).not.toContain("draft");
    expect(w).toContain("可能是重複建立");
  });
});

describe("buildPurchaseProposal", () => {
  const all = [po("PS-20261030-04"), po("PS-20261030-10")];

  it("正常提議會給出待確認動作，而且帶重複警告", () => {
    const r = buildPurchaseProposal("PS-20261030-04", "sent", all);
    expect(r.pendingAction?.type).toBe("purchase_status_change");
    expect(r.pendingAction?.status).toBe("sent");
    expect(r.reply).toContain("從「草稿」改為「已送出給廠商」");
    expect(r.pendingAction?.warning).toContain("PS-20261030-10");
  });

  it("🔴 狀態不合法時不可以給確認按鈕", () => {
    const r = buildPurchaseProposal("PS-20261030-04", "shipped", all);
    expect(r.pendingAction).toBeUndefined();
  });

  it("🔴 查不到單號時不可以給確認按鈕", () => {
    const r = buildPurchaseProposal("PS-NOPE", "sent", all);
    expect(r.pendingAction).toBeUndefined();
    expect(r.reply).toContain("找不到");
  });

  it("🔴 沒給單號時不可以給確認按鈕", () => {
    expect(buildPurchaseProposal("", "sent", all).pendingAction).toBeUndefined();
  });

  it("狀態沒變就不提議，不要讓人白按一次", () => {
    const r = buildPurchaseProposal("PS-20261030-04", "draft", all);
    expect(r.pendingAction).toBeUndefined();
    expect(r.reply).toContain("已經是");
  });

  it("沒有雙胞胎時警告是空的", () => {
    const r = buildPurchaseProposal("PS-SOLO", "sent", [po("PS-SOLO", { totalAmount: "1" })]);
    expect(r.pendingAction?.warning).toBe("");
  });
});
