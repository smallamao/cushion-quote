import { randomBytes } from "node:crypto";

/**
 * 客戶簽署連結短碼工具。
 *
 * 短碼由 CODE_ALPHABET（54 字元，排除 0/O/1/l/I 等易混淆字元）組成：
 *   - 新碼：SHORT_CODE_LEN = 10 字元，54^10 ≈ 2×10^17 組合（約 57 bits）
 *   - 舊碼：LEGACY_SHORT_CODE_LEN = 6 字元，已發出的連結永遠以字串等值比對，
 *     lookup 端不做長度驗證，因此舊連結在有效期內繼續有效。
 */

// 🔴 字母表與長度搬到 signing-link-format.ts（Edge 安全、無 node:crypto），
//    好讓 middleware 也能共用同一份定義。這裡 re-export 維持既有呼叫端不變。
export {
  CODE_ALPHABET,
  LEGACY_SHORT_CODE_LEN,
  SHORT_CODE_LEN,
} from "@/lib/signing-link-format";

import { CODE_ALPHABET } from "@/lib/signing-link-format";

/**
 * 產生 len 位短碼（僅含 CODE_ALPHABET 字元）。
 *
 * 用拒絕取樣而不是 `byte % 54`：256 不是 54 的倍數（256 = 54×4 + 40），
 * 直接取餘數會讓字母表前 40 個字元出現機率比後 14 個高約 25%，等於白送掉一點
 * 熵。10 碼時影響很小，但這是安全基元，做對幾乎不花成本。
 */
export function generateShortCode(len: number): string {
  const n = CODE_ALPHABET.length;
  const limit = Math.floor(256 / n) * n; // 250：>= 250 的位元組一律丟掉重抽
  let out = "";
  while (out.length < len) {
    // 多抽一些，減少重抽輪數
    for (const byte of randomBytes((len - out.length) * 2)) {
      if (byte >= limit) continue;
      out += CODE_ALPHABET[byte % n];
      if (out.length === len) break;
    }
  }
  return out;
}
