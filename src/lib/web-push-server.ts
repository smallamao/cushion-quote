import "server-only";

import webpush from "web-push";

import {
  deletePushSubscription,
  listPushSubscriptions,
} from "@/lib/push-subscriptions-sheet";

/**
 * 送 Web Push 給所有已訂閱的裝置。
 *
 * 為什麼走這條而不是 LINE：LINE 官方帳號額度 200 則/月，而且推到群組是
 * 按群組人數計費（5 人群組 = 一則扣 5 點），2026-08 就已經用罄過一次。
 * Web Push 免費、無上限，缺點是使用者要先授權一次。
 */
const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY?.trim();
const SUBJECT = process.env.VAPID_SUBJECT?.trim() || "mailto:admin@potatosofa.com";

export function isPushConfigured(): boolean {
  return Boolean(PUBLIC_KEY && PRIVATE_KEY);
}

export interface PushPayload {
  title: string;
  body: string;
  /** 點通知要開啟的站內路徑，例如 /shipping-notice。 */
  link: string;
  /** 同一 tag 的通知會互相取代，避免同類型洗版。 */
  tag?: string;
}

export interface PushResult {
  sent: number;
  removed: number;
  failed: number;
}

/**
 * 回傳送達統計。刻意不拋錯：推播失敗不該讓觸發它的業務流程（客人簽核等）失敗。
 * 推播服務回 404/410 代表該訂閱已失效，直接從清單移除，否則每次都要白重試一輪。
 */
export async function sendPushToAll(payload: PushPayload): Promise<PushResult> {
  const result: PushResult = { sent: 0, removed: 0, failed: 0 };
  if (!isPushConfigured()) return result;

  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY as string, PRIVATE_KEY as string);
  const subs = await listPushSubscriptions();
  if (subs.length === 0) return result;

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    link: payload.link,
    tag: payload.tag ?? "",
  });

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        );
        result.sent += 1;
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          await deletePushSubscription(s.endpoint);
          result.removed += 1;
        } else {
          result.failed += 1;
        }
      }
    }),
  );
  return result;
}
