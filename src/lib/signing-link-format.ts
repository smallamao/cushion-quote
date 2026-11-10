/**
 * 簽署短碼的「格式」——字母表、長度、以及短網域根路徑的比對規則。
 *
 * 🔴 為什麼跟 signing-link-code.ts 分開：那一支 import 了 `node:crypto`（產碼用），
 *    而 middleware 跑在 Edge runtime，import 進去會直接壞掉。但 middleware 需要
 *    知道短碼長什麼樣，才能判斷 `s.potatosofa.com/xxxxx` 是短碼還是後台頁面。
 *    常數放這裡讓兩邊共用，不要在 middleware 另抄一份——抄一份就是第二份真相，
 *    改字母表時一定有一邊忘了跟。
 */

/** 短碼字母表（54 個字元），排除易混淆字元 0/O/1/l/I。 */
export const CODE_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ";

/** 目前短碼長度（10 字元）。 */
export const SHORT_CODE_LEN = 10;

/** 舊版短碼長度（6 字元）；已發出的連結不會因版本更新失效。 */
export const LEGACY_SHORT_CODE_LEN = 6;

/**
 * 短網域根路徑是不是一個簽署短碼。
 *
 * 🔴 2026-11-10 修掉的真 bug：原本是 `/^\/([A-Za-z0-9]{6,32})\/?$/`，
 *    任何 6～32 字的單段英數路徑都當成短碼。於是在短網域上
 *      s.potatosofa.com/orders
 *      s.potatosofa.com/quotes
 *      s.potatosofa.com/settings
 *      s.potatosofa.com/receivables
 *    全部被改寫成 /sign/{那串字}，實測回 200（送出公開簽署頁），
 *    而不是導去登入。後台頁面從短網域根本打不開，而且**毫無錯誤訊息**。
 *    `/dispatch-plan` 之類沒被波及純屬運氣——連字號讓它不符合英數格式。
 *
 * 收緊成「長度剛好是 10 或 6，且只含 CODE_ALPHABET 的字元」。這不是維護保留字
 * 清單（下一個人加頁面就會忘），而是用短碼真正的格式來判斷：字母表排除了
 * 0/1/i/l/o/O/I/L，所以含這些字母的頁面名稱自動安全。實測 src/app 的 38 個
 * 頂層路由，收緊後 0 衝突。
 *
 * ⚠️ 仍有殘餘風險：將來若新增剛好 6 或 10 字、且完全不含 0/1/i/l/o 的頁面
 *    （例如 `/search`），還是會撞。`signing-link-format.test.ts` 會自動掃
 *    src/app 把這種衝突測出來——不要只靠讀這段註解。
 */
export const SHORT_CODE_PATH_RE = new RegExp(
  `^/([${CODE_ALPHABET}]{${SHORT_CODE_LEN}}|[${CODE_ALPHABET}]{${LEGACY_SHORT_CODE_LEN}})/?$`,
);

/** 從短網域根路徑取出短碼；不是短碼就回 null。 */
export function shortCodeFromPath(pathname: string): string | null {
  const m = pathname.match(SHORT_CODE_PATH_RE);
  return m ? (m[1] ?? null) : null;
}
