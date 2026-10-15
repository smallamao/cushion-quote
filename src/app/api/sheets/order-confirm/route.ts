import { NextResponse } from "next/server";

// 2026-10-15：原本自己解析 cookie 只驗簽章，不查這個帳號現在還在不在職——
// 停用帳號 30 天內照樣進得來。改用 lib/api-auth 的共用實作，停用與降權立刻生效。

import { getActiveSession } from "@/lib/api-auth";
import {
  appendOrderConfirm,
  findByToken,
  generateToken,
  listOrderConfirms,
  writeOrderConfirm,
} from "@/lib/order-confirm-sheet";
import { defaultCheckedIndexes, type OrderConfirm } from "@/lib/order-confirm-types";
import { TRELLO } from "@/lib/trello-constants";
import {
  getBoardCardsWithChecklists,
  readDepositState,
} from "@/lib/trello-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


/** 預設訂金：線上下訂大多為 10,000（老闆 2026-10-04 確認），產生連結時可逐單修改。 */
const DEFAULT_DEPOSIT = 10000;

/**
 * GET /api/sheets/order-confirm
 * 回傳 Trello「Request」清單的卡片，併上各卡已建立的下訂確認狀態。
 */
export async function GET(request: Request) {
  if (!await getActiveSession(request)) {
    return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  }
  try {
    const [cards, confirms] = await Promise.all([
      getBoardCardsWithChecklists(TRELLO.BOARD_ID),
      listOrderConfirms(),
    ]);
    const cardById = new Map(cards.map((c) => [c.id, c]));

    // 同一張卡可能重發過連結，取最新那筆為準
    const byCard = new Map<string, OrderConfirm>();
    for (const c of confirms) {
      const prev = byCard.get(c.cardId);
      if (!prev || c.createdAt > prev.createdAt) byCard.set(c.cardId, c);
    }

    /**
     * 🔴 追蹤清單的來源是「訂單確認表」，不是 Trello 的某個清單。
     *    舊版只讀 Request 清單，但卡片做完訂單解析就會移到「Order 訂單」，
     *    一移走整筆就從畫面消失——2026-10-13 實測 12 筆連結全部看不到。
     *    發出去的連結記在表裡，所以表才是「誰在等客人」的事實來源。
     */
    const tracking = [...byCard.values()]
      .map((c) => {
        const card = cardById.get(c.cardId);
        const deposit = card ? readDepositState(card) : { paid: null, text: "" };
        return {
          cardId: c.cardId,
          cardName: c.cardName,
          token: c.token,
          status: c.status,
          depositAmount: c.depositAmount,
          orderNo: c.orderNo,
          payByDate: c.payByDate,
          signerName: c.signerName,
          confirmedAt: c.confirmedAt,
          notifiedAt: c.notifiedAt,
          createdAt: c.createdAt,
          /** 卡片還在不在板上；被刪掉時前端要標示，不要讓它看起來像正常單 */
          cardExists: Boolean(card),
          /** 訂金收款狀態讀 Trello「待辦事項」的勾選，系統不自己記一份 */
          depositPaid: deposit.paid,
          depositNote: deposit.text,
        };
      })
      .sort((a, b) => (b.notifiedAt || b.createdAt).localeCompare(a.notifiedAt || a.createdAt));

    // 還沒發過連結的 Request 卡＝可以產生連結的對象（現場下單放著不理即可）
    const available = cards
      .filter((card) => card.idList === TRELLO.LISTS.REQUEST && !byCard.has(card.id))
      .map((card) => ({ cardId: card.id, cardName: card.name }));

    return NextResponse.json({
      ok: true,
      tracking,
      available,
      defaultDeposit: DEFAULT_DEPOSIT,
      defaultChecked: defaultCheckedIndexes(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "讀取失敗";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

/**
 * POST /api/sheets/order-confirm
 *  { action: "create", cardId, cardName, depositAmount, checkedIndexes } → 產生客人連結
 *  { action: "notified", token }                                        → 標記已把連結傳給客人
 */
export async function POST(request: Request) {
  const session = await getActiveSession(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  try {
    if (body.action === "notified") {
      const token = typeof body.token === "string" ? body.token : "";
      const found = await findByToken(token);
      if (!found) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
      await writeOrderConfirm(
        { ...found.confirm, notifiedAt: new Date().toISOString() },
        found.rowNumber,
      );
      return NextResponse.json({ ok: true });
    }

    const cardId = typeof body.cardId === "string" ? body.cardId.trim() : "";
    const cardName = typeof body.cardName === "string" ? body.cardName.trim() : "";
    if (!cardId) return NextResponse.json({ ok: false, error: "缺少卡片" }, { status: 400 });

    // 訂單編號必填：客人匯款備註要標這個，空的話收款端對不上帳。
    const orderNo = typeof body.orderNo === "string" ? body.orderNo.trim() : "";
    if (!orderNo) {
      return NextResponse.json(
        { ok: false, error: "請先填訂單編號（卡片名稱改成「P6275 王小明」後重新整理即可自動帶入）" },
        { status: 400 },
      );
    }
    const payByDate = typeof body.payByDate === "string" ? body.payByDate.trim() : "";

    const depositRaw = Number(body.depositAmount);
    const depositAmount = Number.isFinite(depositRaw) && depositRaw >= 0 ? Math.round(depositRaw) : DEFAULT_DEPOSIT;
    const checkedIndexes = Array.isArray(body.checkedIndexes)
      ? (body.checkedIndexes as unknown[]).filter((n): n is number => Number.isInteger(n))
      : defaultCheckedIndexes();

    const now = new Date().toISOString();
    const confirm: OrderConfirm = {
      token: generateToken(),
      cardId,
      cardName,
      depositAmount,
      checkedIndexes,
      status: "sent",
      signerName: "",
      signatureUrl: "",
      confirmedAt: "",
      signerIp: "",
      signerUserAgent: "",
      notifiedAt: "",
      createdAt: now,
      updatedAt: now,
      createdBy: session.email ?? "",
      orderNo,
      payByDate,
    };
    await appendOrderConfirm(confirm);
    return NextResponse.json({ ok: true, token: confirm.token });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "處理失敗";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
