import { NextResponse } from "next/server";

import {
  SESSION_COOKIE_NAME,
  SESSION_DURATION_DAYS,
  exchangeGoogleCode,
  getBootstrapAdminEmail,
  signSession,
  verifySignedState,
} from "@/lib/auth";
import { driveConnectRedirect, handleDriveBackupCallback } from "@/lib/drive-backup-connect";
import {
  countActiveAdmins,
  createUser,
  findUserByEmail,
} from "@/lib/users-sheet";

function errorRedirect(request: Request, message: string): NextResponse {
  const url = new URL("/login", request.url);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");

  if (!code || !stateParam) {
    // 在 Google 同意畫面按「取消」時只有 error、沒有 code。
    // Drive 連結流程要導回備份設定頁說明，不是丟去登入頁；登入流程照舊。
    if (stateParam && verifySignedState(stateParam)?.purpose === "drive-backup") {
      return driveConnectRedirect(request, "denied");
    }
    return errorRedirect(request, "missing_code");
  }

  // 驗證 signed state (CSRF) — 不再依賴 cookie
  const stateResult = verifySignedState(stateParam);
  if (!stateResult) {
    return errorRedirect(request, "invalid_state");
  }

  // 登入與 Drive 連結共用同一個 redirect URI，靠簽章內的 purpose 分流。
  // Drive 分支只存備份授權，不簽 session、不改 cookie（見 lib/drive-backup-connect.ts）。
  if (stateResult.purpose === "drive-backup") {
    return handleDriveBackupCallback(request, code, stateResult.boundEmail);
  }
  const { returnTo } = stateResult;

  // 交換 code → 取得 email
  const googleProfile = await exchangeGoogleCode(code);
  if (!googleProfile) {
    return errorRedirect(request, "token_exchange_failed");
  }

  // 查 users sheet
  let user = await findUserByEmail(googleProfile.email);

  // Bootstrap: users sheet 空的 且 email 符合 BOOTSTRAP_ADMIN_EMAIL → 自動建 admin
  if (!user) {
    const adminCount = await countActiveAdmins();
    const bootstrapEmail = getBootstrapAdminEmail();
    if (
      adminCount === 0 &&
      bootstrapEmail &&
      bootstrapEmail === googleProfile.email
    ) {
      try {
        user = await createUser({
          email: googleProfile.email,
          displayName: googleProfile.name || googleProfile.email,
          role: "admin",
        });
      } catch {
        return errorRedirect(request, "bootstrap_failed");
      }
    }
  }

  if (!user) {
    return errorRedirect(request, "unauthorized");
  }

  // 簽 session cookie（含 Google 大頭照）
  const token = signSession({
    userId: user.userId,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    picture: googleProfile.picture || undefined,
  });

  const response = NextResponse.redirect(new URL(returnTo, request.url));
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_DURATION_DAYS * 86400,
    path: "/",
  });
  return response;
}
