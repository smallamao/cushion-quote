import "server-only";

import {
  duplicateWarning,
  findIdenticalPurchases,
  type DuplicateCandidate,
} from "@/lib/purchase-duplicates";
import { isPurchaseStatus, purchaseStatusLabel } from "@/lib/purchase-status";
import { getSheetsClient } from "@/lib/sheets-client";

export interface PurchaseProposal {
  reply: string;
  pendingAction?: {
    type: "purchase_status_change";
    purchaseId: string;
    status: string;
    statusLabel: string;
    warning: string;
  };
  historyNote: string;
}

/** 組出「請確認」訊息；查不到單或狀態不合法就不給確認按鈕。 */
export function buildPurchaseProposal(
  purchaseId: string,
  status: string,
  candidates: readonly DuplicateCandidate[],
): PurchaseProposal {
  if (!purchaseId) {
    return { reply: "沒有拿到採購單號，請告訴我要改哪一張。", historyNote: "（提議失敗：缺採購單號）" };
  }
  if (!isPurchaseStatus(status)) {
    return {
      reply: `「${status}」不是有效的採購單狀態。`,
      historyNote: `（提議失敗：無效狀態 ${status}）`,
    };
  }
  const target = candidates.find((p) => p.purchaseId === purchaseId);
  if (!target) {
    return { reply: `找不到採購單 ${purchaseId}。`, historyNote: `（提議失敗：查無 ${purchaseId}）` };
  }

  const label = purchaseStatusLabel(status);
  const currentLabel = purchaseStatusLabel(target.status);
  if (target.status === status) {
    return {
      reply: `${purchaseId} 已經是「${label}」了，不需要再改。`,
      historyNote: `（${purchaseId} 已是 ${label}，未提議）`,
    };
  }

  const warning = duplicateWarning(findIdenticalPurchases(purchaseId, candidates));
  const lines = [`請確認：要把採購單 ${purchaseId} 從「${currentLabel}」改為「${label}」嗎？`];
  if (warning) lines.push("", warning);

  return {
    reply: lines.join("\n"),
    pendingAction: { type: "purchase_status_change", purchaseId, status, statusLabel: label, warning },
    historyNote: `（等待使用者確認：${purchaseId} → ${label}）`,
  };
}

/** 讀採購單與明細，交給純函式組訊息。 */
export async function describePurchaseProposal(
  purchaseId: string,
  status: string,
): Promise<PurchaseProposal> {
  const client = await getSheetsClient();
  if (!client) {
    return { reply: "❌ Google Sheets 未設定。", historyNote: "（提議失敗：Sheets 未設定）" };
  }

  const res = await client.sheets.spreadsheets.values.batchGet({
    spreadsheetId: client.spreadsheetId,
    ranges: ["採購單!A2:Q", "採購單明細!A2:J"],
  });
  const [poRows, itemRows] = (res.data.valueRanges ?? []).map((v) => (v.values ?? []) as string[][]);

  const signatures = new Map<string, string[]>();
  for (const it of itemRows ?? []) {
    if (!it[1]) continue;
    const list = signatures.get(it[1]) ?? [];
    list.push(`${it[3] ?? ""}|${it[5] ?? ""}|${it[7] ?? ""}|${it[9] ?? ""}`);
    signatures.set(it[1], list);
  }

  const candidates: DuplicateCandidate[] = (poRows ?? [])
    .filter((r) => r[0])
    .map((r) => ({
      purchaseId: r[0] ?? "",
      purchaseDate: r[1] ?? "",
      supplierId: r[2] ?? "",
      totalAmount: r[9] ?? "",
      status: r[11] ?? "",
      itemSignature: signatures.get(r[0] ?? "") ?? [],
    }));

  return buildPurchaseProposal(purchaseId, status, candidates);
}
