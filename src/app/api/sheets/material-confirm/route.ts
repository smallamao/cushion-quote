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
import { isCustomerConfirmed, isGatingDrift, splitOrderCardName, type MaterialConfirm } from "@/lib/material-confirm-types";
import { readDrift } from "@/lib/schedule-drift-sheet";
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
  /** 本機對帳（Numbers vs Trello）在這筆上發現的差異說明 */
  driftReasons: string[];
  /** 其中會擋住「發給客人」的那幾項（排程日／時段）；出貨日不算，原因見 material-confirm-types 的 GATING_DRIFT_KINDS */
  blockingDriftReasons: string[];
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

  // 本機推上來的 Numbers vs Trello 對帳結果。null＝從來沒推過或讀不到，
  // 這時要當「不知道」而不是「沒問題」——看板會顯示尚未對帳。
  const drift = await readDrift();
  const driftByOrder = new Map<string, string[]>();
  const blockingByOrder = new Map<string, string[]>();
  for (const r of drift?.records ?? []) {
    if (!r.orderNumber) continue;
    driftByOrder.set(r.orderNumber, [...(driftByOrder.get(r.orderNumber) ?? []), r.reason]);
    if (isGatingDrift(r.kind)) {
      blockingByOrder.set(r.orderNumber, [...(blockingByOrder.get(r.orderNumber) ?? []), r.reason]);
    }
  }

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
        driftReasons: driftByOrder.get(orderNumber) ?? [],
        blockingDriftReasons: blockingByOrder.get(orderNumber) ?? [],
      };
    })
    .sort((a, b) =>
      a.scheduleDate === b.scheduleDate
        ? a.orderNumber.localeCompare(b.orderNumber)
        : a.scheduleDate.localeCompare(b.scheduleDate),
    );

  // 「客人那關過了沒」的判準已抽到 lib/material-confirm-types 的 isCustomerConfirmed，
  // 與看板的篩選共用同一份定義，避免「還差 N 張」和篩選結果對不起來。
  const customerDone = rows.filter((r) => isCustomerConfirmed(r.status)).length;
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

  // ── Numbers 對帳狀態 ──────────────────────────────
  // 老闆是以本地 Numbers 為主，雲端看到的是 Trello。發連結前要先確認兩邊對得上，
  // 否則客人會拿到錯週次、錯日期的確認單。這裡把「能不能發」變成程式判斷，
  // 不是靠人記得去跑對帳（同 [[gate-in-code-not-in-skill]]）。
  const DRIFT_MAX_AGE_HOURS = 24;
  const weekDrift = rows.filter((r) => r.blockingDriftReasons.length > 0);
  const weekDueDrift = rows.filter(
    (r) => r.driftReasons.length > 0 && r.blockingDriftReasons.length === 0,
  );
  const checkedMs = drift ? Date.parse(drift.checkedAt) : NaN;
  const ageHours = Number.isFinite(checkedMs) ? (Date.now() - checkedMs) / 3600000 : Infinity;
  // Numbers 存檔時間比對帳時間晚＝老闆改完還沒重跑對帳，結果過期
  const savedMs = drift?.numbersSavedAt ? Date.parse(drift.numbersSavedAt) : NaN;
  const numbersNewer = Number.isFinite(savedMs) && Number.isFinite(checkedMs) && savedMs > checkedMs;

  const driftStatus = {
    checked: Boolean(drift),
    checkedAt: drift?.checkedAt ?? "",
    numbersSavedAt: drift?.numbersSavedAt ?? "",
    error: drift?.error ?? "",
    /** 整批（不只本週）的差異筆數 */
    totalRecords: drift?.records.length ?? 0,
    /** 本週會擋住發送的差異筆數（排程日／時段） */
    weekRecords: weekDrift.length,
    /** 本週只有出貨日不一致的筆數——會顯示但不擋發送 */
    weekDueRecords: weekDueDrift.length,
    ageHours: Number.isFinite(ageHours) ? Math.round(ageHours * 10) / 10 : null,
    stale: !drift || numbersNewer || ageHours > DRIFT_MAX_AGE_HOURS,
    numbersNewer,
  };
  // 可以發連結給客人的條件：對帳跑過、沒過期、沒錯誤、且本週零差異
  const safeToSend =
    driftStatus.checked && !driftStatus.stale && !driftStatus.error && driftStatus.weekRecords === 0;

  return NextResponse.json({ ok: true, rows, summary, readyForMaterialCall, driftStatus, safeToSend });
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
