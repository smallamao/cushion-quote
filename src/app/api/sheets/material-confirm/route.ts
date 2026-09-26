/**
 * 叫料確認單 後台 API（需登入）。
 *   GET  ?start=YYYY-MM-DD&end=YYYY-MM-DD → 該週訂單 ＋ 各自的確認狀態
 *   POST { cardIds: string[] }            → 為這些卡建立／沿用客人連結
 *
 * 週次以 Trello「排程日」自訂欄位判斷（與排程系統同一個欄位），
 * 不用卡片 due——due 是出貨日，跟生產週不是同一件事。
 */
import { NextResponse } from "next/server";

import { TRELLO } from "@/lib/trello-constants";
import {
  appendConfirm,
  findByCardId,
  generateToken,
  listConfirms,
} from "@/lib/material-confirm-sheet";
import { splitOrderCardName, type MaterialConfirm } from "@/lib/material-confirm-types";
import { getBoardCards, getCustomFieldDate, toTaipeiYmd } from "@/lib/trello-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface WeekRow {
  cardId: string;
  orderNumber: string;
  customerName: string;
  scheduleDate: string;   // YYYY-MM-DD（台灣）
  dueDate: string;        // YYYY-MM-DD（台灣）
  /** 尚未建連結時為 null */
  token: string | null;
  status: MaterialConfirm["status"] | "not_sent";
  preferredSlots: MaterialConfirm["preferredSlots"];
  signerName: string;
  confirmedAt: string;
  disputeNote: string;
  createdAt: string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const start = searchParams.get("start") ?? "";
  const end = searchParams.get("end") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return NextResponse.json({ ok: false, error: "start / end 需為 YYYY-MM-DD" }, { status: 400 });
  }

  let cards;
  try {
    cards = await getBoardCards(TRELLO.BOARD_ID);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: `Trello 讀取失敗：${message}` }, { status: 502 });
  }

  const inWeek = cards.filter((c) => {
    const d = toTaipeiYmd(getCustomFieldDate(c, TRELLO.CUSTOM_FIELDS.SCHEDULE_DAY));
    return d && d >= start && d <= end;
  });

  const existing = await listConfirms();
  const byCard = new Map(existing.map((x) => [x.confirm.cardId, x.confirm]));

  const rows: WeekRow[] = inWeek
    .map((c): WeekRow => {
      const { orderNumber, customerName } = splitOrderCardName(c.name);
      const found = byCard.get(c.id);
      return {
        cardId: c.id,
        orderNumber,
        customerName,
        scheduleDate: toTaipeiYmd(getCustomFieldDate(c, TRELLO.CUSTOM_FIELDS.SCHEDULE_DAY)),
        dueDate: toTaipeiYmd(c.due ?? ""),
        token: found?.token ?? null,
        status: found?.status ?? "not_sent",
        preferredSlots: found?.preferredSlots ?? [],
        signerName: found?.signerName ?? "",
        confirmedAt: found?.confirmedAt ?? "",
        disputeNote: found?.disputeNote ?? "",
        createdAt: found?.createdAt ?? "",
      };
    })
    .sort((a, b) =>
      a.scheduleDate === b.scheduleDate
        ? a.orderNumber.localeCompare(b.orderNumber)
        : a.scheduleDate.localeCompare(b.scheduleDate),
    );

  const summary = {
    total: rows.length,
    confirmed: rows.filter((r) => r.status === "confirmed").length,
    disputed: rows.filter((r) => r.status === "disputed").length,
    sent: rows.filter((r) => r.status === "sent").length,
    notSent: rows.filter((r) => r.status === "not_sent").length,
  };
  // 全部綠燈才可以往下走叫料——這是流程關卡，不是純顯示。
  const readyForMaterialCall = summary.total > 0 && summary.confirmed === summary.total;

  return NextResponse.json({ ok: true, rows, summary, readyForMaterialCall });
}

export async function POST(request: Request) {
  let body: { cardIds?: unknown; weekKey?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }
  const cardIds = Array.isArray(body.cardIds) ? (body.cardIds as unknown[]).map(String).filter(Boolean) : [];
  const weekKey = typeof body.weekKey === "string" ? body.weekKey : "";
  if (cardIds.length === 0) {
    return NextResponse.json({ ok: false, error: "請選擇訂單" }, { status: 400 });
  }

  let cards;
  try {
    cards = await getBoardCards(TRELLO.BOARD_ID);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: `Trello 讀取失敗：${message}` }, { status: 502 });
  }
  const byId = new Map(cards.map((c) => [c.id, c]));

  const created: Array<{ cardId: string; orderNumber: string; customerName: string; token: string; reused: boolean }> = [];
  for (const cardId of cardIds) {
    const card = byId.get(cardId);
    if (!card) continue;
    // 同一張卡只留一筆：重發時沿用既有 token，避免看板出現兩筆同單、
    // 也避免客人手上的舊連結突然失效。
    const existing = await findByCardId(cardId);
    if (existing) {
      const { orderNumber, customerName } = splitOrderCardName(card.name);
      created.push({ cardId, orderNumber, customerName, token: existing.confirm.token, reused: true });
      continue;
    }
    const { orderNumber, customerName } = splitOrderCardName(card.name);
    const now = new Date().toISOString();
    const row: MaterialConfirm = {
      token: generateToken(),
      cardId,
      orderNumber,
      customerName,
      status: "sent",
      weekKey,
      dueDate: card.due ?? "",
      preferredSlots: [],
      signerName: "",
      signatureUrl: "",
      confirmedAt: "",
      disputeNote: "",
      signerIp: "",
      signerUserAgent: "",
      createdAt: now,
      updatedAt: now,
      driverToken: "",
      chosenDate: "",
      chosenPeriod: "",
    };
    await appendConfirm(row);
    created.push({ cardId, orderNumber, customerName, token: row.token, reused: false });
  }

  return NextResponse.json({ ok: true, created });
}
