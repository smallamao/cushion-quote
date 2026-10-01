/**
 * 司機端「一條連結含多筆」公開 API（免登入）。
 *   GET  → 這批所有訂單的配送資訊與客人給的時段
 *   POST → { picks: [{ cardId, chosenIndex, period? }], rejects: [cardId] }
 *
 * 司機跑的是一條路線，一次看到整批才喬得出來；一筆一條連結他要開八次。
 */
import { NextResponse } from "next/server";

import { appendNotification } from "@/lib/notifications-sheet";
import { findByDriverBatch, writeConfirm } from "@/lib/material-confirm-sheet";
import {
  isNonDeliveryDay,
  normalizeDeliveryPeriod,
  periodStartHour,
  toDueIso,
  type DeliveryPeriod,
} from "@/lib/material-confirm-types";
import { addCardComment, getDeliveryInfo, setCardDue } from "@/lib/trello-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WEEKDAY = ["日", "一", "二", "三", "四", "五", "六"];

function fmtSlot(date: string, period: string): string {
  const t = Date.parse(`${date}T00:00:00+08:00`);
  if (!Number.isFinite(t)) return `${date} ${period}`;
  const d = new Date(t + 8 * 60 * 60 * 1000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WEEKDAY[d.getUTCDay()]}) ${period}`;
}

function fmtTaipei(iso: string): string {
  const t = new Date(new Date(iso).getTime() + 8 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())} ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())} (UTC+8)`;
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const rows = await findByDriverBatch(token);
  if (rows.length === 0) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const orders = await Promise.all(
    rows.map(async ({ confirm: c }) => {
      let info = null;
      try {
        info = await getDeliveryInfo(c.cardId);
      } catch {
        /* 單筆取不到不該讓整批壞掉 */
      }
      return {
        cardId: c.cardId,
        orderNumber: c.orderNumber,
        customerName: c.customerName,
        status: c.status,
        preferredSlots: c.preferredSlots,
        chosenDate: c.chosenDate,
        chosenPeriod: c.chosenPeriod,
        info,
      };
    }),
  );

  return NextResponse.json({ ok: true, orders });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const rows = await findByDriverBatch(token);
  if (rows.length === 0) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  let body: { picks?: unknown; rejects?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  const picks = Array.isArray(body.picks)
    ? (body.picks as Array<{ cardId?: string; chosenIndex?: number; period?: string }>)
    : [];
  const rejects = Array.isArray(body.rejects) ? (body.rejects as unknown[]).map(String) : [];
  if (picks.length === 0 && rejects.length === 0) {
    return NextResponse.json({ ok: false, error: "請至少處理一筆" }, { status: 400 });
  }

  const byCard = new Map(rows.map((r) => [r.confirm.cardId, r]));
  const done: Array<{ orderNumber: string; text: string }> = [];
  const failed: Array<{ orderNumber: string; reason: string }> = [];

  for (const pick of picks) {
    const row = byCard.get(String(pick.cardId ?? ""));
    if (!row) continue;
    const c = row.confirm;
    if (c.status === "scheduled") continue; // 已排定的略過，不重複寫

    const slot = c.preferredSlots[Number(pick.chosenIndex)];
    if (!slot) { failed.push({ orderNumber: c.orderNumber, reason: "沒選時段" }); continue; }
    // 司機週日不配送。2026-10-01 之前存的三組裡還有週日，所以不能假設資料乾淨。
    if (isNonDeliveryDay(slot.date)) {
      failed.push({ orderNumber: c.orderNumber, reason: "週日不配送" });
      continue;
    }

    let period: DeliveryPeriod = slot.period;
    if (typeof pick.period === "string" && pick.period) period = normalizeDeliveryPeriod(pick.period);
    if (periodStartHour(period) === null) {
      failed.push({ orderNumber: c.orderNumber, reason: "「皆可」要再指定具體時段" });
      continue;
    }
    const dueIso = toDueIso(slot.date, period);
    if (!dueIso) { failed.push({ orderNumber: c.orderNumber, reason: "日期無法換算" }); continue; }

    await writeConfirm(
      { ...c, status: "scheduled", chosenDate: slot.date, chosenPeriod: period },
      row.rowNumber,
    );
    let dueWritten = true;
    try {
      await setCardDue(c.cardId, dueIso);
    } catch {
      dueWritten = false;
    }
    await addCardComment(
      c.cardId,
      [
        "【配送時段】🚚 司機已確認",
        `確認時間：${fmtTaipei(new Date().toISOString())}`,
        `配送時間：${fmtSlot(slot.date, period)}`,
        dueWritten ? "" : "⚠️ 出貨日自動寫入失敗，請手動更新卡片日期。",
      ].filter(Boolean).join("\n"),
    ).catch(() => {});
    done.push({ orderNumber: c.orderNumber, text: fmtSlot(slot.date, period) });
  }

  for (const cardId of rejects) {
    const row = byCard.get(cardId);
    if (!row || row.confirm.status === "scheduled") continue;
    await writeConfirm({ ...row.confirm, status: "driver_rejected" }, row.rowNumber);
    await addCardComment(
      row.confirm.cardId,
      `【配送時段】⚠️ 司機回報：客人給的三組時段都無法配合\n時間：${fmtTaipei(new Date().toISOString())}\n\n※ 請直接與客人另約時間。`,
    ).catch(() => {});
  }

  if (done.length || rejects.length) {
    await appendNotification({
      type: "delivery_slot",
      title: `🚚 司機回覆了 ${done.length + rejects.length} 筆配送時段`,
      body: [
        done.map((d) => `${d.orderNumber} ${d.text}`).join("、"),
        rejects.length ? `${rejects.length} 筆回報排不進` : "",
      ].filter(Boolean).join("；"),
      link: "/material-confirm",
    });
  }

  return NextResponse.json({ ok: true, done, failed, rejected: rejects.length });
}
