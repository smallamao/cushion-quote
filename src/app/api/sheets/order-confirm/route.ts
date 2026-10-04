import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME, verifySession } from "@/lib/auth";
import {
  appendOrderConfirm,
  findByToken,
  generateToken,
  listOrderConfirms,
  writeOrderConfirm,
} from "@/lib/order-confirm-sheet";
import { defaultCheckedIndexes, type OrderConfirm } from "@/lib/order-confirm-types";
import { TRELLO } from "@/lib/trello-constants";
import { getBoardCards } from "@/lib/trello-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSession(request: Request) {
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .find((c) => c.trim().startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.split("=")[1];
  return verifySession(token);
}

/** 預設訂金：線上下訂大多為 10,000（老闆 2026-10-04 確認），產生連結時可逐單修改。 */
const DEFAULT_DEPOSIT = 10000;

/**
 * GET /api/sheets/order-confirm
 * 回傳 Trello「Request」清單的卡片，併上各卡已建立的下訂確認狀態。
 */
export async function GET(request: Request) {
  if (!getSession(request)) {
    return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  }
  try {
    const [cards, confirms] = await Promise.all([
      getBoardCards(TRELLO.BOARD_ID),
      listOrderConfirms(),
    ]);
    // 同一張卡可能重發過連結，取最新那筆為準
    const byCard = new Map<string, OrderConfirm>();
    for (const c of confirms) {
      const prev = byCard.get(c.cardId);
      if (!prev || c.createdAt > prev.createdAt) byCard.set(c.cardId, c);
    }

    const rows = cards
      .filter((card) => card.idList === TRELLO.LISTS.REQUEST)
      .map((card) => {
        const c = byCard.get(card.id);
        return {
          cardId: card.id,
          cardName: card.name,
          token: c?.token ?? null,
          status: c?.status ?? null,
          depositAmount: c?.depositAmount ?? DEFAULT_DEPOSIT,
          orderNo: c?.orderNo ?? "",
          payByDate: c?.payByDate ?? "",
          signerName: c?.signerName ?? "",
          confirmedAt: c?.confirmedAt ?? "",
          notifiedAt: c?.notifiedAt ?? "",
          createdAt: c?.createdAt ?? "",
        };
      });

    return NextResponse.json({
      ok: true,
      rows,
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
  const session = getSession(request);
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
