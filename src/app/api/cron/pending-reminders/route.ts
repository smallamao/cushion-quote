import { NextResponse } from "next/server";

import { getActiveSession } from "@/lib/api-auth";
import { timingSafeEqual } from "@/lib/constant-time";
import { listConfirms, writeConfirm } from "@/lib/material-confirm-sheet";
import { isCustomerConfirmed } from "@/lib/material-confirm-types";
import { shouldRemindDeliveryNotice } from "@/lib/dispatch-rules";
import { appendNotification } from "@/lib/notifications-sheet";
import { listOrderConfirms } from "@/lib/order-confirm-sheet";
import { TRELLO } from "@/lib/trello-constants";
import type { BoardCardWithChecklists } from "@/lib/trello-server";
import {
  addCardCommentUnlessTest,
  getBoardCardsWithChecklists,
  readDepositState,
  toTaipeiYmd,
} from "@/lib/trello-server";

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

  /**
   * 整塊板只抓一次。這支 cron 原本在四個區段各自呼叫一次
   * getBoardCardsWithChecklists，同樣的 579 張卡抓四遍。
   * 宣告在 handler 內部（不是模組層）所以不跨請求共用，
   * 失敗時 cache 仍是 null，下一個區段會自己重試。
   */
  let cardsCache: BoardCardWithChecklists[] | null = null;
  const boardCards = async (): Promise<BoardCardWithChecklists[]> =>
    (cardsCache ??= await getBoardCardsWithChecklists(TRELLO.BOARD_ID));

  /**
   * Trello 卡片進了「Fail 作廢」→ 叫料確認單自動標成取消。
   *
   * 🔴 為什麼要自動（老闆 2026-10-31）：作廢是在 Trello 做的，不該要人再進系統
   *    點第二次。而且 P6274 黃淑雯證明了「要人去點」根本做不到——卡片作廢時
   *    排程日期欄被清空，看板是用那個欄位篩選的，於是這張單在**任何週**都
   *    篩不出來。畫面上找不到的東西，不可能靠人工處理。
   *
   * 只動還沒結案的單；confirmed／scheduled 不碰——那是客人簽名的存證，
   * 不是作業狀態，不該被排程自動改寫。
   */
  const autoCancelled: string[] = [];
  try {
    const cards = await boardCards();
    const failedCardIds = new Set(
      cards.filter((c) => c.idList === TRELLO.LISTS.FAILED).map((c) => c.id),
    );
    if (failedCardIds.size > 0) {
      for (const { confirm, rowNumber } of await listConfirms()) {
        if (!failedCardIds.has(confirm.cardId)) continue;
        if (confirm.status === "cancelled") continue;
        if (isCustomerConfirmed(confirm.status)) continue; // 已有簽名存證，不覆蓋
        await writeConfirm(
          { ...confirm, status: "cancelled", disputeNote: "卡片已移到「Fail 作廢」，系統自動標記取消" },
          rowNumber,
        );
        await addCardCommentUnlessTest(
          confirm.cardId,
          "✖️ 系統自動標記：卡片已在「Fail 作廢」，叫料確認單同步標為取消",
        ).catch(() => {});
        autoCancelled.push(confirm.orderNumber);
      }
    }
  } catch {
    /* 讀不到就跳過，不影響後面的催辦 */
  }

  /**
   * 卡片已經在「已出貨／待評論／完成」→ 叫料確認單補登實際配送日並結案。
   *
   * 🔴 2026-11-08 實查：52 筆「待排車」裡有 27 筆早就出貨了（P6299、P6300、
   *    P6315…），排車清單超過一半是假的。老闆因此每一筆都得自己回頭查，
   *    這就是「一直反覆人工確認」的來源——不是流程設計不好，是資料不可信。
   *
   * 卡片的到期日會被更新成實際配送日（老闆 2026-11-08 確認），所以直接拿來補登。
   * 這份歷史紀錄也是日後要反推製作順序時唯一的依據。
   */
  const autoClosed: string[] = [];
  try {
    const cards = await boardCards();
    const DONE_LISTS = new Set<string>([
      TRELLO.LISTS.SHIPPED,
      TRELLO.LISTS.WAIT_REVIEW,
      TRELLO.LISTS.COMPLETED,
    ]);
    const shipped = new Map(
      cards.filter((c) => DONE_LISTS.has(c.idList)).map((c) => [c.id, c.due ?? ""]),
    );
    if (shipped.size > 0) {
      for (const { confirm, rowNumber } of await listConfirms()) {
        if (!shipped.has(confirm.cardId)) continue;
        if (confirm.chosenDate) continue;              // 已經有配送日就別再動
        if (confirm.status === "cancelled") continue;  // 取消的不要被改成已排定
        const ymd = toTaipeiYmd(shipped.get(confirm.cardId) ?? "");
        if (!ymd) continue;                            // 沒有到期日就不猜日期
        await writeConfirm(
          { ...confirm, status: "scheduled", chosenDate: ymd, chosenPeriod: confirm.chosenPeriod },
          rowNumber,
        );
        autoClosed.push(`${confirm.orderNumber}:${ymd}`);
      }
    }
  } catch {
    /* 讀不到就跳過，不影響後面的催辦 */
  }

  // ── 線上下訂確認：已發連結、客人未簽 ──────────────────
  try {
    const orders = await listOrderConfirms();

    // 🔴 訂金已收就別再催了：P6283 林宏軒 10/6 就付款，只是沒走線上簽核，
    //    狀態一直停在 sent。不排除的話，催辦會天天叫人去催一個已經付過錢的客人。
    //    訂金狀態的事實來源是 Trello「待辦事項」的勾選（沙發線不走應收帳款）。
    const paidCards = new Set<string>();
    try {
      for (const card of await boardCards()) {
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

  /**
   * ── 配送日快到了，但出貨通知還沒發給客人 ──────────────────
   *
   * 🔴 老闆的規則「排定後提前 2-3 天通知客人」原本是**死規則**：
   *    NOTIFY_LEAD_DAYS 被 import、被序列化給前端、被存進 useState，
   *    但從頭到尾沒有任何一行拿它做判斷。也就是說這條規則從來沒被系統執行過。
   *
   * 🔴 為什麼現在做得到：dueComplete 就是「出貨通知已發」的標記
   *    （老闆 2026-11-09 說明：客戶與司機時間都 OK、師傅也完成之後，
   *    發送出貨通知訊息會自動跳 Trello dueComplete）。
   *    在知道這件事之前，系統裡找不到任何「已通知」的狀態可以比對。
   *
   * 刻意的取捨：
   *   - 卡片不在板上（已封存）→ **跳過**。無從判斷已通知沒有，寧可不吵。
   *   - 配送日已經過去 → 跳過。那是另一回事（遲到），不是「該提前通知」。
   *   - 已經打勾 → 跳過。通知發過了。
   */
  try {
    const cards = await boardCards();
    const notified = new Map(cards.map((c) => [c.id, Boolean(c.dueComplete)]));
    const listOf = new Map(cards.map((c) => [c.id, c.idList]));
    const today = twYmd(new Date().toISOString());
    for (const { confirm: c } of await listConfirms()) {
      const deliver = (c.chosenDate ?? "").slice(0, 10);
      const verdict = shouldRemindDeliveryNotice({
        chosenDate: deliver,
        status: c.status,
        today,
        idList: listOf.get(c.cardId) ?? "",
        alreadyNotified: Boolean(notified.get(c.cardId)),
        readyList: TRELLO.LISTS.WAIT_SHIPPING,
        productionList: TRELLO.LISTS.PRODUCTION,
      });
      if (!verdict.remind) continue;
      const daysLeft = verdict.daysLeft;
      const when = daysLeft === 0 ? "今天" : `${daysLeft} 天後`;

      // 兩種情境的行動完全不同：東西做好了只是沒通知 vs 東西還沒做好。
      // 催錯方向就是白忙——同這支 cron 把叫料的三種情境分開講的理由。
      if (verdict.kind === "production_behind") {
        await appendNotification({
          type: "delivery_production_behind",
          title: `🚨 ${c.orderNumber} ${when}要配送，但還在生產中`,
          body: `${c.customerName}・配送 ${deliver} ${c.chosenPeriod || ""}・先確認製作進度，別直接發通知`,
          link: "/material-confirm",
        });
        sent.push(`delivery-behind:${c.orderNumber}:${daysLeft}d`);
      } else {
        await appendNotification({
          type: "delivery_notice_pending",
          title: daysLeft === 0
            ? `🚨 ${c.orderNumber} 今天配送，還沒通知客人`
            : `📣 ${c.orderNumber} ${when}配送，還沒通知客人`,
          body: `${c.customerName}・${deliver} ${c.chosenPeriod || ""}・請到排程出貨頁複製出貨通知傳給客人`,
          link: "/shipping-notice",
        });
        sent.push(`delivery-notice:${c.orderNumber}:${daysLeft}d`);
      }
    }
  } catch {
    /* best-effort，不影響前面已寫入的催辦 */
  }

  return NextResponse.json({
    ok: true,
    remindedCount: sent.length,
    items: sent,
    autoCancelled,
    autoClosed,
  });
}
