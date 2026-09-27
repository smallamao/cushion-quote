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
  writeConfirm,
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
  /** 老闆實際把連結傳出去的時間；空＝建好了還沒傳 */
  notifiedAt: string;
  /** 客人確認後才有；老闆排車時把這條傳給司機 */
  driverToken: string | null;
  chosenDate: string;
  chosenPeriod: string;
  status: MaterialConfirm["status"] | "not_sent";
  preferredSlots: MaterialConfirm["preferredSlots"];
  signerName: string;
  confirmedAt: string;
  disputeNote: string;
  createdAt: string;
  /** 出貨日早於排程日＝這張的出貨日還沒更新，客人會看到錯的完工日 */
  staleDue: boolean;
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
      const scheduleDate = toTaipeiYmd(getCustomFieldDate(c, TRELLO.CUSTOM_FIELDS.SCHEDULE_DAY));
      const dueDate = toTaipeiYmd(c.due ?? "");
      return {
        cardId: c.id,
        orderNumber,
        customerName,
        scheduleDate,
        dueDate,
        token: found?.token ?? null,
        notifiedAt: found?.notifiedAt ?? "",
        driverToken: found?.driverToken || null,
        chosenDate: found?.chosenDate ?? "",
        chosenPeriod: found?.chosenPeriod ?? "",
        status: found?.status ?? "not_sent",
        preferredSlots: found?.preferredSlots ?? [],
        signerName: found?.signerName ?? "",
        confirmedAt: found?.confirmedAt ?? "",
        disputeNote: found?.disputeNote ?? "",
        createdAt: found?.createdAt ?? "",
        staleDue: Boolean(dueDate && scheduleDate && dueDate < scheduleDate),
      };
    })
    .sort((a, b) =>
      a.scheduleDate === b.scheduleDate
        ? a.orderNumber.localeCompare(b.orderNumber)
        : a.scheduleDate.localeCompare(b.scheduleDate),
    );

  // 客人已確認＝confirmed 之後的任何狀態（司機已排定、司機回報不行，客人那關都過了）。
  // 叫料關卡看的是「客人確認了沒」，不是司機排到日期沒有。
  // 🔴 postponed 不算——客人明確說「現在還不能進場，請延後」，這筆就不該跟著本週叫料，
  //    老闆要先把它移出這週（改排程日）才走得下去。
  const CUSTOMER_DONE = new Set(["confirmed", "scheduled", "driver_rejected"]);
  const customerDone = rows.filter((r) => CUSTOMER_DONE.has(r.status)).length;
  const summary = {
    total: rows.length,
    confirmed: customerDone,
    scheduled: rows.filter((r) => r.status === "scheduled").length,
    driverRejected: rows.filter((r) => r.status === "driver_rejected").length,
    disputed: rows.filter((r) => r.status === "disputed").length,
    postponed: rows.filter((r) => r.status === "postponed").length,
    sent: rows.filter((r) => r.status === "sent").length,
    notSent: rows.filter((r) => r.status === "not_sent").length,
    staleDue: rows.filter((r) => r.staleDue).length,
    // 連結建好了但還沒傳給客人——最容易漏掉的一種
    unsent: rows.filter((r) => r.token && !r.notifiedAt && r.status === "sent").length,
  };
  // 全部綠燈才可以往下走叫料——這是流程關卡，不是純顯示。
  const readyForMaterialCall = summary.total > 0 && customerDone === summary.total;

  return NextResponse.json({ ok: true, rows, summary, readyForMaterialCall });
}

export async function POST(request: Request) {
  let body: { cardIds?: unknown; weekKey?: unknown; action?: unknown; tokens?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : "create";

  // 標記「已傳送給客人」——連結建好 ≠ 已經傳出去，這兩件事要分開記，
  // 否則看板永遠顯示「已發送」，老闆不知道自己傳到哪一筆了。
  if (action === "notified") {
    const tokens = Array.isArray(body.tokens) ? (body.tokens as unknown[]).map(String).filter(Boolean) : [];
    if (tokens.length === 0) return NextResponse.json({ ok: false, error: "沒有指定要標記的項目" }, { status: 400 });
    const all = await listConfirms();
    const now = new Date().toISOString();
    let n = 0;
    for (const { confirm, rowNumber } of all) {
      if (!tokens.includes(confirm.token) || confirm.notifiedAt) continue;
      await writeConfirm({ ...confirm, notifiedAt: now }, rowNumber);
      n += 1;
    }
    return NextResponse.json({ ok: true, marked: n });
  }

  // 司機批次：把這幾筆綁上同一個 token，司機一條連結全部處理完
  if (action === "driver_batch") {
    const ids = Array.isArray(body.cardIds) ? (body.cardIds as unknown[]).map(String).filter(Boolean) : [];
    if (ids.length === 0) return NextResponse.json({ ok: false, error: "請選擇要交給司機的訂單" }, { status: 400 });
    const all = await listConfirms();
    const picked = all.filter((x) => ids.includes(x.confirm.cardId));
    const notReady = picked.filter((x) => x.confirm.status !== "confirmed");
    if (notReady.length) {
      return NextResponse.json({
        ok: false,
        error: `有 ${notReady.length} 筆客人還沒確認或已排定：${notReady.map((x) => x.confirm.orderNumber).join("、")}`,
      }, { status: 400 });
    }
    if (picked.length === 0) return NextResponse.json({ ok: false, error: "找不到對應資料" }, { status: 400 });
    // 沿用既有批次 token（同一批重發不會換連結），都沒有才開新的
    const batchToken = picked.find((x) => x.confirm.driverBatchToken)?.confirm.driverBatchToken || generateToken();
    for (const { confirm, rowNumber } of picked) {
      if (confirm.driverBatchToken === batchToken) continue;
      await writeConfirm({ ...confirm, driverBatchToken: batchToken }, rowNumber);
    }
    return NextResponse.json({ ok: true, batchToken, count: picked.length });
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
      notifiedAt: "",
      driverBatchToken: "",
    };
    await appendConfirm(row);
    created.push({ cardId, orderNumber, customerName, token: row.token, reused: false });
  }

  return NextResponse.json({ ok: true, created });
}
