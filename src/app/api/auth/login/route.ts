import { NextResponse } from "next/server";

import { buildGoogleAuthUrl, generateState } from "@/lib/auth";

/**
 * GET /api/auth/login
 * 產生 Google OAuth URL 並導過去。
 * 會把 state 寫入 cookie 以便 callback 驗證 (防 CSRF)。
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const returnTo = url.searchParams.get("returnTo") ?? "/";

  try {
    const state = generateState();
    const payload = Buffer.from(
      JSON.stringify({ state, returnTo }),
    ).toString("base64url");
    const authUrl = buildGoogleAuthUrl(payload);

    const response = NextResponse.redirect(authUrl);
    response.cookies.set("cq_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600, // 10 分鐘
      path: "/",
    });
    return response;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "login init failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
