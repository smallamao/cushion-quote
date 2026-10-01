/**
 * 產生「測試用」叫料確認連結（需登入）。
 *
 * 老闆 2026-10-01：「測試案例那筆被我移除了，而且我測試之後不知道怎麼重製。」
 * 每次改動客人頁都該能自己走一次完整流程（看照片 → 挑日期 → 簽名 → 司機挑日），
 * 以前那筆是我手動建的，他刪掉就沒了。現在變成按一下。
 *
 * 不會弄髒真實資料，靠的是 cardId 存成 `TEST:<真卡號>`：
 *  - 看板用真卡號去對照工作表，對不上這個前綴 → 測試單不會出現在任何一週，
 *    也不會蓋掉那張卡原本的那一筆。
 *  - 照片與製作區間照樣讀得到（realCardId 還原）。
 *  - 回寫 Trello（留言／待辦／出貨日）一律跳過（addCardCommentUnlessTest、isTestConfirm）。
 *
 * 重複按＝同一張卡沿用同一列、重設成未確認，不會越積越多。
 */
import { NextResponse } from "next/server";

import {
  appendConfirm,
  generateToken,
  listConfirms,
  writeConfirm,
} from "@/lib/material-confirm-sheet";
import { TEST_CARD_PREFIX, splitOrderCardName } from "@/lib/material-confirm-types";
import { TRELLO } from "@/lib/trello-constants";
import { getBoardCards, toTaipeiYmd } from "@/lib/trello-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { cardId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }
  const cardId = String(body.cardId ?? "");
  if (!cardId) return NextResponse.json({ ok: false, error: "請指定要拿哪一筆的照片來測試" }, { status: 400 });
  if (cardId.startsWith(TEST_CARD_PREFIX)) {
    return NextResponse.json({ ok: false, error: "這已經是測試單了" }, { status: 400 });
  }

  let cards;
  try {
    cards = await getBoardCards(TRELLO.BOARD_ID);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: `Trello 讀取失敗：${message}` }, { status: 502 });
  }
  const card = cards.find((c) => c.id === cardId);
  if (!card) return NextResponse.json({ ok: false, error: "找不到這張卡" }, { status: 404 });

  const { orderNumber, customerName } = splitOrderCardName(card.name);
  const testCardId = `${TEST_CARD_PREFIX}${cardId}`;
  const now = new Date().toISOString();
  const token = generateToken();

  // 已經有同一張卡的測試列就重設它，不要一直長新的
  const existing = (await listConfirms()).find((x) => x.confirm.cardId === testCardId);
  const base = {
    token,
    cardId: testCardId,
    // 🔴 名字要一眼看出是測試，萬一真的傳錯人也看得出來
    orderNumber: `測試-${orderNumber}`,
    customerName: `${customerName}（測試）`,
    status: "sent" as const,
    weekKey: "TEST",
    dueDate: toTaipeiYmd(card.due ?? ""),
    preferredSlots: [],
    signerName: "",
    signatureUrl: "",
    confirmedAt: "",
    disputeNote: "",
    signerIp: "",
    signerUserAgent: "",
    createdAt: existing?.confirm.createdAt || now,
    updatedAt: now,
    driverToken: "",
    chosenDate: "",
    chosenPeriod: "" as const,
    notifiedAt: "",
    driverBatchToken: "",
  };

  if (existing) {
    await writeConfirm(base, existing.rowNumber);
  } else {
    await appendConfirm(base);
  }

  return NextResponse.json({
    ok: true,
    token,
    orderNumber: base.orderNumber,
    customerName: base.customerName,
    reset: Boolean(existing),
  });
}
