import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME, verifySession } from "@/lib/auth";
import { listConfirms } from "@/lib/material-confirm-sheet";
import { appendNotification } from "@/lib/notifications-sheet";
import { listOrderConfirms } from "@/lib/order-confirm-sheet";
import { TRELLO } from "@/lib/trello-constants";
import { getBoardCardsWithChecklists, readDepositState } from "@/lib/trello-server";

/**
 * 每日催辦：掃出「連結已發出、客人卻還沒回應」的單，寫進通知表（並連帶推播）。
 *
 * 🔴 為什麼需要它：在此之前完全沒有任何主動提醒。畫面上雖有「已等 N 天，該催了」，
 *    但那要人主動打開那一頁才看得到；線上下訂的面板又只讀 Trello Request 清單，
 *    卡片一做完訂單解析就移走，等於整批待辦直接從畫面消失。
 *    2026-10-13 實查：6 筆已發送未簽，最久的 P6283 已經 7 天沒人知道。
 *
 * 🔴 middleware 必須在 CRON_PATHS 放行這條路徑，否則 Cron 會被擋在 401、
 *    而且毫無聲音——既有的每日備份就是這樣從頭到尾沒跑過。
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 超過幾天沒回應就開始每天提醒。匯款期限是建立後 2 天，所以第 3 天起就該跟。 */
const REMIND_AFTER_DAYS = 2;

function daysSince(iso: string): number | null {
  const t = Date.parse(iso ?? "");
  if (!Number.isFinite(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

/** Vercel Cron 帶 Bearer CRON_SECRET；手動觸發則走 admin session。 */
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") === `Bearer ${secret}`) return true;
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .find((c) => c.trim().startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.split("=")[1];
  const session = verifySession(token);
  return !!session && session.role === "admin";
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  }

  const sent: string[] = [];

  // ── 線上下訂確認：已發連結、客人未簽 ──────────────────
  try {
    const orders = await listOrderConfirms();

    // 🔴 訂金已收就別再催了：P6283 林宏軒 10/6 就付款，只是沒走線上簽核，
    //    狀態一直停在 sent。不排除的話，催辦會天天叫人去催一個已經付過錢的客人。
    //    訂金狀態的事實來源是 Trello「待辦事項」的勾選（沙發線不走應收帳款）。
    const paidCards = new Set<string>();
    try {
      for (const card of await getBoardCardsWithChecklists(TRELLO.BOARD_ID)) {
        if (readDepositState(card).paid === true) paidCards.add(card.id);
      }
    } catch {
      /* 讀不到就照舊全催，寧可多提醒也不要漏 */
    }

    const stale = orders
      .filter((o) => o.status === "sent" && !paidCards.has(o.cardId))
      .map((o) => ({ o, d: daysSince(o.notifiedAt || o.createdAt) }))
      .filter((x) => x.d !== null && x.d > REMIND_AFTER_DAYS)
      .sort((a, b) => (b.d ?? 0) - (a.d ?? 0));

    for (const { o, d } of stale) {
      await appendNotification({
        type: "order_confirm_pending",
        title: `⏰ ${o.orderNo || o.cardName} 客人還沒確認下訂`,
        body: `已等 ${d} 天・訂金 NT$ ${o.depositAmount.toLocaleString()}，建議主動聯絡`,
        link: "/shipping-notice",
      });
      sent.push(`order:${o.orderNo || o.cardName}:${d}d`);
    }
  } catch {
    /* 一邊掛掉不影響另一邊 */
  }

  // ── 叫料確認：已發連結、客人未確認 ────────────────────
  try {
    const rows = await listConfirms();
    const stale = rows
      .map(({ confirm }) => confirm)
      .filter((c) => c.status === "sent")
      .map((c) => ({ c, d: daysSince(c.notifiedAt || c.createdAt) }))
      .filter((x) => x.d !== null && x.d > REMIND_AFTER_DAYS)
      .sort((a, b) => (b.d ?? 0) - (a.d ?? 0));

    for (const { c, d } of stale) {
      await appendNotification({
        type: "material_confirm_pending",
        title: `⏰ ${c.orderNumber} 客人還沒確認叫料`,
        body: `${c.customerName}・已等 ${d} 天，建議主動聯絡`,
        link: "/material-confirm",
      });
      sent.push(`material:${c.orderNumber}:${d}d`);
    }
  } catch {
    /* best-effort */
  }

  return NextResponse.json({ ok: true, remindedCount: sent.length, items: sent });
}
