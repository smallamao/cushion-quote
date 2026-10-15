import { NextResponse } from "next/server";

// 2026-10-15：原本自己解析 cookie 只驗簽章，不查這個帳號現在還在不在職——
// 停用帳號 30 天內照樣進得來。改用 lib/api-auth 的共用實作，停用與降權立刻生效。

import { getActiveSession } from "@/lib/api-auth";
import {
  deletePushSubscription,
  listPushSubscriptions,
  savePushSubscription,
} from "@/lib/push-subscriptions-sheet";
import { isPushConfigured, sendPushToAll } from "@/lib/web-push-server";

/**
 * 推播訂閱管理（員工專用，middleware 已擋未登入）。
 *   GET    → 這台裝置有沒有訂閱過、系統有沒有設定好金鑰
 *   POST   → 儲存這台裝置的訂閱；action: "test" 則發一則測試推播
 *   DELETE → 取消這台裝置的訂閱
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";


export async function GET(request: Request) {
  if (!await getActiveSession(request)) {
    return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  }
  const subs = await listPushSubscriptions();
  return NextResponse.json({
    ok: true,
    configured: isPushConfigured(),
    // 只回傳數量與裝置名稱，endpoint 含推播服務的私有位址，沒必要送到前端
    count: subs.length,
    devices: subs.map((s) => ({ label: s.label, createdAt: s.createdAt })),
  });
}

export async function POST(request: Request) {
  if (!await getActiveSession(request)) {
    return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  }
  if (!isPushConfigured()) {
    return NextResponse.json({ ok: false, error: "伺服器尚未設定推播金鑰" }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  if (body.action === "test") {
    const result = await sendPushToAll({
      title: "🥔 測試推播",
      body: "看到這則就代表推播設定成功了。",
      link: "/shipping-notice",
      tag: "push-test",
    });
    return NextResponse.json({ ok: true, ...result });
  }

  const sub = body.subscription as
    | { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
    | undefined;
  const endpoint = sub?.endpoint?.trim() ?? "";
  const p256dh = sub?.keys?.p256dh?.trim() ?? "";
  const auth = sub?.keys?.auth?.trim() ?? "";
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ ok: false, error: "訂閱資料不完整" }, { status: 400 });
  }

  const label = typeof body.label === "string" ? body.label.trim().slice(0, 60) : "";
  try {
    await savePushSubscription({ endpoint, p256dh, auth, label: label || "未命名裝置" });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "儲存失敗";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!await getActiveSession(request)) {
    return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  }
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  const endpoint = typeof body.endpoint === "string" ? body.endpoint.trim() : "";
  if (!endpoint) return NextResponse.json({ ok: false, error: "缺少 endpoint" }, { status: 400 });
  const removed = await deletePushSubscription(endpoint);
  return NextResponse.json({ ok: true, removed });
}
