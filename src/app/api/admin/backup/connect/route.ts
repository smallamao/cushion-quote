import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/api-auth";
import { buildGoogleDriveConnectUrl, buildSignedState } from "@/lib/auth";

// 每次都要現場簽 state，不能被靜態化
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/backup/connect
 * 「連結 Google Drive」按鈕：導去 Google 授權 drive.file，回來後由
 * /api/auth/callback/google 依 state 的 purpose 存下備份授權（不會變更登入身分）。
 *
 * /api/admin 不在 middleware 的 admin-only 清單裡（那份清單管的是 /admin 頁面），
 * 所以這裡自己用 requireAdmin 驗，角色以使用者表為準。
 */
export async function GET(request: Request) {
  const guard = await requireAdmin(request);
  if (guard.denied) return guard.denied;

  try {
    const state = buildSignedState("/settings?tab=maintenance", "drive-backup");
    return NextResponse.redirect(buildGoogleDriveConnectUrl(state));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "connect init failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
