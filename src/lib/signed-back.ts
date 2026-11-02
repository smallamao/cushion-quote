/**
 * 合約回簽歸檔後，要不要自動開訂製訂單。
 *
 * 線上簽署（/api/public/sign/[token]）一簽完就自動開單，理由是「客人一簽完就會
 * 匯訂金，訂單若沒開就不會進排程、不會叫料，等於收了錢卻沒人在做」（老闆 2026-09-29）。
 * 但客人不一定走線上連結——紙本簽回、LINE 傳回簽圖，內勤是用人工歸檔處理的，
 * 那條路原本沒接上，同一個洞只補了一半（老闆 2026-11-02 發現，實例 NT$40,000）。
 */

/** 這些狀態的版本不開單：回簽後又被拒／被取代的情況實際存在 */
const NON_ORDERABLE_STATUSES = ["rejected", "superseded", "cancelled"];

export interface SignedBackState {
  signedBack?: boolean;
  versionStatus?: string;
}

export function shouldAutoCreateOrderOnArchive(
  before: SignedBackState,
  after: SignedBackState,
): boolean {
  // 只在「這次才從未回簽變成已回簽」時開單：重複儲存同一張不該一直重跑
  if (!after.signedBack || before.signedBack) return false;
  // 回簽後又被拒的版本開出來的單是錯的（實例 CA-202607-009-Q01-V02）
  return !NON_ORDERABLE_STATUSES.includes(after.versionStatus ?? "");
}
