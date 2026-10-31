import "server-only";

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/api-auth";
import { appendAuditLog } from "@/lib/audit-log";
import { exchangeGoogleCodeForDrive } from "@/lib/auth";
import { saveDriveConnection } from "@/lib/drive-backup-auth";

// OAuth callback 的「連結 Google Drive 備份」分支。
//
// 🔴 這條分支絕對不能動到登入狀態：不簽 session、不寫 cookie。老闆可能用另一個
//    Google 帳號（例如公司共用帳號）授權 Drive，那個帳號不該因此變成登入身分。
//    身分以「目前瀏覽器裡的 session ＋ 使用者表上的角色」為準，不是 Google 回來的帳號。

/** 備份設定所在的分頁 */
const SETTINGS_BACKUP_PATH = "/settings?tab=maintenance";

export type DriveConnectOutcome =
  | "connected"
  | "denied"
  | "forbidden"
  | "exchange_failed"
  | "no_refresh_token"
  | "scope_missing"
  | "no_email"
  | "save_failed";

export function driveConnectRedirect(request: Request, outcome: DriveConnectOutcome): NextResponse {
  const url = new URL(SETTINGS_BACKUP_PATH, request.url);
  url.searchParams.set("drive", outcome);
  return NextResponse.redirect(url);
}

export async function handleDriveBackupCallback(
  request: Request,
  code: string,
  /** state 簽章內綁定的發起者 email（按下「連結 Google Drive」的那位 admin） */
  boundEmail: string,
): Promise<NextResponse> {
  // 先驗身分再換 code：不是 admin 的人連 token 都不該替他換
  const guard = await requireAdmin(request);
  if (guard.denied) return driveConnectRedirect(request, "forbidden");
  // 完成連結的必須是發起連結的同一個人：授權網址被轉給別人，對方用自己的 session 也走不完
  const sessionEmail = guard.session.email.trim().toLowerCase();
  if (!boundEmail || sessionEmail !== boundEmail.trim().toLowerCase()) {
    return driveConnectRedirect(request, "forbidden");
  }

  let result: Awaited<ReturnType<typeof exchangeGoogleCodeForDrive>>;
  try {
    result = await exchangeGoogleCodeForDrive(code);
  } catch {
    return driveConnectRedirect(request, "exchange_failed");
  }
  if (!result.ok) return driveConnectRedirect(request, result.reason);

  try {
    await saveDriveConnection({
      email: result.email,
      refreshToken: result.refreshToken,
      refreshTokenExpiresIn: result.refreshTokenExpiresIn,
    });
  } catch {
    return driveConnectRedirect(request, "save_failed");
  }

  appendAuditLog({
    actor: guard.session.email,
    action: "update",
    targetType: "backup",
    targetId: "drive-connection",
    summary: `備份改用 Google 帳號 ${result.email} 的 Drive`,
  });
  return driveConnectRedirect(request, "connected");
}
