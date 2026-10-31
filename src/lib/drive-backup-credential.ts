// Drive 備份「用哪個身分上傳」的判斷邏輯。不碰 Sheets / Google API，
// 外部呼叫全部由呼叫端注入，所以能直接寫測試（見 __tests__/drive-backup-credential.test.ts）。
//
// 背景：2026-10-15 實查，服務帳號的 Drive 儲存配額是 0，任何上傳都被拒
// （"Service Accounts do not have storage quota."），每日備份從來沒成功過。
// 改成以老闆的 Google 帳號（OAuth refresh token）上傳到老闆自己的 My Drive。

export const BACKUP_FOLDER_NAME = "營運系統-備份";

/**
 * 找備份資料夾的查詢。
 *
 * 用老闆的帳號 ＋ drive.file 權限時，Google 只會回 App 自己建立的檔案，
 * 本來就看不到服務帳號那個舊的空資料夾；這裡再加上「擁有者是我」與「未丟垃圾桶」，
 * 避免名稱剛好相同的別的資料夾被拿來用。
 */
export const BACKUP_FOLDER_QUERY =
  `name='${BACKUP_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' ` +
  `and trashed=false and 'me' in owners`;

// 保留 90 份（約 3 個月）。資料被改壞不一定馬上發現——某張報價單的金額被誤改，
// 可能一個月後對帳才看出來，那時 30 天前的版本已經被刪了。
// 實測一份壓縮後約 0.44 MB，90 份約 40 MB，免費額度 15 GB 綽綽有餘。
export const KEEP_LAST_N = 90;

/** 傳入依建立時間新到舊排好的檔案，回傳該刪掉的那些（第 KEEP_LAST_N 份之後） */
export function selectBackupsToPrune<T>(filesNewestFirst: readonly T[]): T[] {
  return filesNewestFirst.slice(KEEP_LAST_N);
}

export const DRIVE_NOT_CONNECTED_REASON =
  "尚未連結 Google Drive，請到設定→備份按「連結 Google Drive」";
export const DRIVE_AUTH_REVOKED_REASON = "Google Drive 授權已失效，請重新連結";
export const DRIVE_TOKEN_UNREADABLE_REASON =
  "Google Drive 授權資料無法解開（AUTH_SECRET 可能已更換），請重新連結";

export interface StoredDriveConnection {
  status: "active" | "invalid";
  email: string;
  encryptedRefreshToken: string;
  connectedAt: string;
  /** Google 有回 refresh_token_expires_in 時才有值（OAuth 同意畫面為測試模式） */
  refreshTokenExpiresAt: string;
  invalidatedAt: string;
  invalidReason: string;
}

export type DriveAccessResult<T> =
  | { ok: true; auth: T; email: string }
  | { ok: false; code: "not_connected" | "revoked" | "unreadable"; reason: string };

export interface DriveAccessDeps<T> {
  load: () => Promise<StoredDriveConnection | null>;
  decrypt: (blob: string) => string | null;
  /** 用 refresh token 換 access token；換不到時丟出 Google 的錯誤 */
  refresh: (refreshToken: string) => Promise<T>;
  markInvalid: (reason: string) => Promise<void>;
}

/** Google 回 invalid_grant＝refresh token 被撤銷、過期（測試模式 7 天）或密碼變更 */
export function isInvalidGrantError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { message?: unknown; response?: { data?: { error?: unknown } } };
  if (e.response?.data?.error === "invalid_grant") return true;
  return typeof e.message === "string" && e.message.includes("invalid_grant");
}

/**
 * 取得「以老闆身分」上傳 Drive 的憑證。
 * 失敗時回傳給人看的中文原因，交給呼叫端走既有的失敗通知。
 */
export async function resolveDriveAccess<T>(deps: DriveAccessDeps<T>): Promise<DriveAccessResult<T>> {
  const stored = await deps.load();
  if (!stored || !stored.encryptedRefreshToken) {
    return { ok: false, code: "not_connected", reason: DRIVE_NOT_CONNECTED_REASON };
  }
  // 已知失效就不再拿去打 Google，直接請人重新連結
  if (stored.status === "invalid") {
    return { ok: false, code: "revoked", reason: DRIVE_AUTH_REVOKED_REASON };
  }

  const refreshToken = deps.decrypt(stored.encryptedRefreshToken);
  if (!refreshToken) {
    await deps.markInvalid(DRIVE_TOKEN_UNREADABLE_REASON);
    return { ok: false, code: "unreadable", reason: DRIVE_TOKEN_UNREADABLE_REASON };
  }

  try {
    const auth = await deps.refresh(refreshToken);
    return { ok: true, auth, email: stored.email };
  } catch (err) {
    if (isInvalidGrantError(err)) {
      await deps.markInvalid(DRIVE_AUTH_REVOKED_REASON);
      return { ok: false, code: "revoked", reason: DRIVE_AUTH_REVOKED_REASON };
    }
    // 網路或 Google 暫時性錯誤：不標失效，讓下一次排程再試
    throw err;
  }
}
