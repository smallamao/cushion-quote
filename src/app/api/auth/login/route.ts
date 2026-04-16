import { NextResponse } from "next/server";

import { buildGoogleAuthUrl, buildSignedState } from "@/lib/auth";

function sanitizeReturnTo(raw: string | null): string {
  if (!raw) return "/";
  if (raw === "/" || /^\/[^/]/.test(raw)) return raw;
  return "/";
}

/**
 * GET /api/auth/login
 * 產生 Google OAuth URL 並導過去。
 * state 以 HMAC 簽章內嵌於 URL 參數中，callback 端直接驗證，不需 cookie。
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const returnTo = sanitizeReturnTo(url.searchParams.get("returnTo"));

  try {
    const state = buildSignedState(returnTo);
    const authUrl = buildGoogleAuthUrl(state);
    return NextResponse.redirect(authUrl);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "login init failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
