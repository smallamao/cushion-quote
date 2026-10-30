import { NextResponse } from "next/server";

import { getActiveSession } from "@/lib/api-auth";
import { timingSafeEqual } from "@/lib/constant-time";
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

/** ISO → 台灣時區 YYYY-MM-DD，用來跟「今天」比大小。 */
function twYmd(iso: string): string {
  const t = Date.parse(iso ?? "");
  if (!Number.isFinite(t)) return "";
  const tw = new Date(t + 8 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${tw.getUTCFullYear()}-${p(tw.getUTCMonth() + 1)}-${p(tw.getUTCDate())}`;
}

function daysSince(iso: string): number | null {
  const t = Date.parse(iso ?? "");
  if (!Number.isFinite(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

/** Vercel Cron 帶 Bearer CRON_SECRET；手動觸發則走 admin session。 */
async function authorized(request: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization") ?? "";
  if (secret && timingSafeEqual(authHeader, `Bearer ${secret}`)) return true;
  // 手動觸發走 admin session。用 getActiveSession 而不是 verifySession，
  // 才會一併查帳號現況（2026-10-15 第二輪稽核）。
  const session = await getActiveSession(request);
  return session?.role === "admin";
}

export async function GET(request: Request) {
  if (!(await authorized(request))) {
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
      // 同樣要分「沒發出去」與「客人沒回」——動作完全不同
      const sentOut = Boolean(o.notifiedAt);
      await appendNotification({
        type: sentOut ? "order_confirm_pending" : "order_confirm_unsent",
        title: sentOut
          ? `⏰ ${o.orderNo || o.cardName} 客人還沒確認下訂`
          : `⚠️ ${o.orderNo || o.cardName} 下訂連結還沒傳給客人`,
        body: sentOut
          ? `已傳送 ${d} 天無回覆・訂金 NT$ ${o.depositAmount.toLocaleString()}，建議主動聯絡`
          : `已建立 ${d} 天還沒發出，請到排程出貨頁複製訊息傳給客人`,
        link: "/shipping-notice",
      });
      sent.push(`${sentOut ? "order" : "order-unsent"}:${o.orderNo || o.cardName}:${d}d`);
    }
  } catch {
    /* 一邊掛掉不影響另一邊 */
  }

  // ── 叫料確認：已發連結、客人未確認 ────────────────────
  try {
    const rows = await listConfirms();
    /**
     * 🔴 三種情境要分開講（老闆 2026-10-29／30）：
     *   1. 出貨日已過卻還沒確認 → 硬期限已突破，嚴重度跟「等很久」差一個量級
     *   2. 連結建好了但沒傳出去 → 要「你」去按複製傳給客人
     *   3. 已傳出、客人沒回     → 才是去 LINE 催客人
     * 原本三者一律寫「客人還沒確認叫料」，實查 6 筆有一半根本沒發出去，
     * 等於把人導向錯誤的動作。做錯方向就是白忙。
     */
    const today = twYmd(new Date().toISOString());
    const pending = rows.map(({ confirm }) => confirm).filter((c) => c.status === "sent");

    for (const c of pending) {
      const sentOut = Boolean(c.notifiedAt);
      const due = twYmd(c.dueDate);
      const overdue = due !== "" && due < today;
      const d = daysSince(sentOut ? c.notifiedAt : c.createdAt);

      // 出貨日已過就立刻喊，不等 REMIND_AFTER_DAYS——那已經是遲到，不是等待
      if (!overdue && (d === null || d <= REMIND_AFTER_DAYS)) continue;

      if (overdue) {
        await appendNotification({
          type: "material_confirm_overdue",
          title: `🚨 ${c.orderNumber} 出貨日已過，叫料確認還沒完成`,
          body: `${c.customerName}・預計出貨 ${due}${sentOut ? `，已傳送 ${d} 天無回覆` : "，連結尚未傳給客人"}`,
          link: "/material-confirm",
        });
        sent.push(`material-overdue:${c.orderNumber}`);
      } else if (!sentOut) {
        await appendNotification({
          type: "material_confirm_unsent",
          title: `⚠️ ${c.orderNumber} 確認連結還沒傳給客人`,
          body: `${c.customerName}・已建立 ${d} 天還沒發出，請到看板複製訊息傳給客人`,
          link: "/material-confirm",
        });
        sent.push(`material-unsent:${c.orderNumber}:${d}d`);
      } else {
        await appendNotification({
          type: "material_confirm_pending",
          title: `⏰ ${c.orderNumber} 客人還沒確認叫料`,
          body: `${c.customerName}・已傳送 ${d} 天無回覆，建議主動聯絡`,
          link: "/material-confirm",
        });
        sent.push(`material:${c.orderNumber}:${d}d`);
      }
    }
  } catch {
    /* best-effort */
  }

  return NextResponse.json({ ok: true, remindedCount: sent.length, items: sent });
}
