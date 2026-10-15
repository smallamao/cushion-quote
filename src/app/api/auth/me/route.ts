import { NextResponse } from "next/server";

import { getActiveSession } from "@/lib/api-auth";

// 2026-10-15 第二輪稽核：這裡原本直接呼叫 verifySession，只驗簽章、不查帳號現況，
// 繞過了「停用／刪除／降權立刻生效」那套檢查。改走 lib/api-auth 的共用實作。

export async function GET(request: Request) {
  // 回給前端的身分，角色以使用者表為準——否則降權之後畫面還會長得像 admin。
  const session = await getActiveSession(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  }
  return NextResponse.json({
    ok: true,
    user: {
      userId: session.userId,
      email: session.email,
      displayName: session.displayName,
      role: session.role,
      picture: session.picture ?? null,
    },
  });
}
