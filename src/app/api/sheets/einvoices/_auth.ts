import { getActiveSession } from "@/lib/api-auth";
import type { Session } from "@/lib/types";

/**
 * 發票相關端點的 session 取得。
 *
 * 2026-10-15：原本自己解析 cookie 並只呼叫 verifySession——那條路不會檢查這個
 * 帳號現在還在不在職，所以停用帳號 30 天內照樣能開發票、看發票。現在改為委派給
 * lib/api-auth 的共用實作，停用與降權一律生效（見 lib/user-status.ts）。
 *
 * 保留這個 helper 而不是直接改 14 個呼叫點：它們的寫法是
 * `const session = await getSession(request)` 之後自己判斷角色，維持原樣最小改動。
 */
export async function getSession(request: Request): Promise<Session | null> {
  return getActiveSession(request);
}
