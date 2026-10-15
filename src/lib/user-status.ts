import "server-only";

import { listUsers } from "@/lib/users-sheet";
import type { UserRole } from "@/lib/types";

// 使用者「現在」的狀態（在職與否、角色），帶快取。
//
// 🔴 2026-10-15 弱點分析第 2 項：session 是一張自帶角色的通行證，簽發後系統再也
//    不去查這個人還在不在職、角色有沒有變。有效期 30 天，所以：
//      - 師傅離職、老闆在後台按「停用」→ 他手機裡那張憑證照樣能登入，最長 30 天
//      - 把 admin 降成技師 → middleware 讀的是憑證裡寫死的角色，要等 30 天才真的降
//    這是唯一一個「不需要攻擊者、光是有人離職就會踩到」的問題。
//
// 為什麼檢查放在 route 層而不是 middleware：middleware 跑在 Edge runtime，
// 不能用 googleapis（Node-only），讀不到 Google Sheets。route 層是 Node，可以。
// api-auth 的 requireSession / requireAdmin 現在都會過這道檢查，
// 所以所有有守門的端點一律生效。
//
// 刻意不加 sessionsValidAfter 欄位：直接讀 isActive 與 role 就能解掉「停用」與
// 「降權」兩件事，不必動試算表結構（加欄位在這個專案踩過四次坑）。
// 代價是「懷疑憑證被偷想立刻作廢」仍然只能靠輪換 AUTH_SECRET。

const TTL_MS = 60 * 1000;

export interface UserStatus {
  isActive: boolean;
  role: UserRole;
  displayName: string;
}

/**
 * 查詢結果。刻意把「查不到這個人」和「整張表讀不到」分成兩種，不能都回 null。
 *
 * 🔴 2026-10-15 第二輪稽核抓到的缺陷：原本兩種情況都回 null，呼叫端無從分辨，
 *    而 api-auth 對 null 的處理是「放行」——結果是**帳號被刪掉之後照樣進得來**，
 *    等於前一天才修好的「停用立刻生效」在「刪除」這條路上完全沒生效。
 *    註解當時寫的是「表上沒有這個人 → 拒絕」，但程式做不到，是我寫錯。
 */
export type UserLookup =
  /** 表讀得到，而且找到這個人 */
  | { unavailable: false; status: UserStatus }
  /** 表讀得到，但表上沒有這個人 → 呼叫端應拒絕 */
  | { unavailable: false; status?: undefined }
  /** 整張表讀不到（Sheets 故障且無快取）→ 呼叫端自行決定，目前是放行 */
  | { unavailable: true; status?: undefined };

let cache: { at: number; byEmail: Map<string, UserStatus> } | null = null;

async function refresh(): Promise<Map<string, UserStatus> | null> {
  const users = await listUsers();
  // listUsers 讀取失敗時回空陣列（它自己 catch 掉了）。真實的使用者表一定至少
  // 有一個 admin，所以空陣列一律當成「查不到」，不要當成「這個人不存在」——
  // 否則 Sheets 一打嗝就把全公司踢出去。
  if (users.length === 0) return null;
  const byEmail = new Map<string, UserStatus>();
  for (const u of users) {
    byEmail.set(u.email, { isActive: u.isActive, role: u.role, displayName: u.displayName });
  }
  cache = { at: Date.now(), byEmail };
  return byEmail;
}

/** 查這個 email 現在的狀態。永遠不丟錯；呼叫端要同時處理三種結果。 */
export async function getUserStatus(email: string): Promise<UserLookup> {
  const key = email.trim().toLowerCase();
  // 憑證裡沒有 email 等於無法歸戶，當成「查不到這個人」處理（拒絕），
  // 不要當成「表讀不到」（放行）。
  if (!key) return { unavailable: false };

  if (cache && Date.now() - cache.at < TTL_MS) {
    const hit = cache.byEmail.get(key);
    return hit ? { unavailable: false, status: hit } : { unavailable: false };
  }

  const fresh = await refresh();
  if (fresh) {
    const hit = fresh.get(key);
    return hit ? { unavailable: false, status: hit } : { unavailable: false };
  }

  // 讀取失敗：用上一次成功的快取（stale-while-error）。
  // 寧可用 60 秒前的資料，也不要因為 Google 打嗝就讓所有人斷線。
  // 快取裡找不到這個人時仍算「查得到表」——快取就是表的副本，
  // 副本裡沒有他，代表他上次讀取時就不在表上了。
  if (cache) {
    console.warn("[user-status] 使用者表讀取失敗，沿用上一次快取");
    const hit = cache.byEmail.get(key);
    return hit ? { unavailable: false, status: hit } : { unavailable: false };
  }
  console.warn("[user-status] 使用者表讀取失敗且無快取可用");
  return { unavailable: true };
}

/** 測試用：清掉快取 */
export function clearUserStatusCache(): void {
  cache = null;
}
