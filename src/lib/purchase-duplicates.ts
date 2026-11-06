import { purchaseStatusLabel } from "@/lib/purchase-status";

/**
 * 找出內容完全相同的採購單。
 *
 * 2026-11-06 查證：1,315 張採購單裡有 19 組「同日期＋同廠商＋同金額＋明細逐項相同」，
 * 建立時間多半只差幾十秒（例如 02:45:34 與 02:46:35）——是批次建立被送出兩次。
 * 其中 14 組整組還是草稿，整批送出等於重複下單約 NT$93,250；另外 5 組已經是 sent，
 * 9/05 清豐那張送了三次。
 *
 * 所以助手要幫忙把草稿改成「已送出」之前，一定要先問這張有沒有雙胞胎。
 */

export interface DuplicateCandidate {
  purchaseId: string;
  purchaseDate: string;
  supplierId: string;
  totalAmount: string;
  status: string;
  /** 明細簽章：每項「商品ID|數量|單價|備註」，順序無關 */
  itemSignature: string[];
}

function signatureOf(p: DuplicateCandidate): string {
  return [p.purchaseDate, p.supplierId, p.totalAmount, [...p.itemSignature].sort().join("~")].join("|");
}

/**
 * 回傳與 targetId 內容相同的其他採購單（不含自己）。
 * 明細都是空的時候不算重複——那通常是還沒填完的空單，不是雙胞胎。
 */
export function findIdenticalPurchases(
  targetId: string,
  all: readonly DuplicateCandidate[],
): DuplicateCandidate[] {
  const target = all.find((p) => p.purchaseId === targetId);
  if (!target) return [];
  if (target.itemSignature.length === 0) return [];
  const key = signatureOf(target);
  return all.filter((p) => p.purchaseId !== targetId && signatureOf(p) === key);
}

/**
 * 給確認視窗用的一行警告；沒有重複就回空字串。
 * 狀態要印中文——這行是給人看的，不要出現 draft/sent 這種代碼。
 */
export function duplicateWarning(dups: readonly DuplicateCandidate[]): string {
  if (dups.length === 0) return "";
  const list = dups.map((d) => `${d.purchaseId}（${purchaseStatusLabel(d.status)}）`).join("、");
  return `⚠️ 這張的日期、廠商、金額與明細，跟 ${list} 完全相同，可能是重複建立的單。送出前請先確認。`;
}
