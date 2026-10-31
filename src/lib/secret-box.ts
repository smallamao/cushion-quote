import crypto from "crypto";

// 把要存進 Google Sheet 的機密（目前只有 Drive 備份的 refresh token）加密。
//
// 為什麼要加密：試算表是全公司共用的資料來源，能開這份表的人（含服務帳號、
// 未來被分享的協作者）都看得到內容；refresh token 拿到手就能以老闆的身分
// 存取 App 建立的 Drive 檔案。加密後光拿到試算表沒有用，還要有伺服器的 AUTH_SECRET。
//
// 格式：v1.<iv>.<authTag>.<ciphertext>，皆為 base64url。AES-256-GCM 自帶完整性檢查，
// 內容被改過一個字就解不開（回 null），不會解出被竄改的值。

const VERSION = "v1";
// 金鑰用 HKDF 從 AUTH_SECRET 衍生，並綁定用途字串：同一把 AUTH_SECRET 也拿來簽登入憑證，
// 衍生出來的金鑰跟簽章用的原值不同，一邊外洩不會直接等於另一邊。
const KEY_INFO = "cushion-quote/secret-box/drive-backup-refresh-token/v1";
const KEY_SALT = "cushion-quote/secret-box";

function deriveKey(secret: string): Buffer {
  if (!secret) throw new Error("加密金鑰未設定");
  return Buffer.from(crypto.hkdfSync("sha256", secret, KEY_SALT, KEY_INFO, 32));
}

export function encryptSecret(plaintext: string, secret: string): string {
  const key = deriveKey(secret);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, tag, ciphertext]
    .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
    .join(".");
}

/** 解不開（格式錯、被竄改、金鑰不對）一律回 null，不丟錯 */
export function decryptSecret(blob: string, secret: string): string | null {
  const parts = blob.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) return null;
  try {
    const [, ivB64, tagB64, ctB64] = parts;
    const iv = Buffer.from(ivB64, "base64url");
    const tag = Buffer.from(tagB64, "base64url");
    if (iv.length !== 12 || tag.length !== 16) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", deriveKey(secret), iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([
      decipher.update(Buffer.from(ctB64, "base64url")),
      decipher.final(),
    ]);
    return plain.toString("utf8");
  } catch {
    return null;
  }
}
