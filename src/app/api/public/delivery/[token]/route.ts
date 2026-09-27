/**
 * 司機端 配送時段確認 公開 API（免登入，token 為唯一憑證）。
 *   GET  → 該單配送資訊 ＋ 客人給的三組時段
 *   POST → { chosenIndex, period? } 挑定一組 ／ { reject:true } 三組都不行
 *
 * 司機 token 在客人確認當下就產生（見 material-confirm 的 POST），
 * 老闆排車時才把連結傳給司機。
 */
import { NextResponse } from "next/server";

import { appendNotification } from "@/lib/notifications-sheet";
import { listConfirms, writeConfirm } from "@/lib/material-confirm-sheet";
import {
  normalizeDeliveryPeriod,
  periodStartHour,
  toDueIso,
  type DeliveryPeriod,
  type MaterialConfirm,
  type PreferredSlot,
} from "@/lib/material-confirm-types";
import { addCardComment, getDeliveryInfo, setCardDue } from "@/lib/trello-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WEEKDAY = ["日", "一", "二", "三", "四", "五", "六"];

function fmtSlot(s: PreferredSlot): string {
  const t = Date.parse(`${s.date}T00:00:00+08:00`);
  if (!Number.isFinite(t)) return `${s.date} ${s.period}`;
  const d = new Date(t + 8 * 60 * 60 * 1000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WEEKDAY[d.getUTCDay()]}) ${s.period}`;
}

function fmtTaipei(iso: string): string {
  const t = new Date(new Date(iso).getTime() + 8 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())} ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())} (UTC+8)`;
}

async function findByDriverToken(
  token: string,
): Promise<{ confirm: MaterialConfirm; rowNumber: number } | null> {
  if (!token) return null;
  const all = await listConfirms();
  return all.find((x) => x.confirm.driverToken === token) ?? null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await findByDriverToken(token);
  if (!found) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const c = found.confirm;

  let info = null;
  try {
    info = await getDeliveryInfo(c.cardId);
  } catch {
    /* 取不到就只給時段，頁面仍可用 */
  }

  return NextResponse.json({
    ok: true,
    view: {
      status: c.status,
      orderNumber: c.orderNumber,
      customerName: c.customerName,
      preferredSlots: c.preferredSlots,
      chosenDate: c.chosenDate,
      chosenPeriod: c.chosenPeriod,
      info,
    },
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await findByDriverToken(token);
  if (!found) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const { confirm: c, rowNumber } = found;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  // 已排定就直接回結果（司機重複點、或連結被轉傳）
  if (c.status === "scheduled") {
    return NextResponse.json({
      ok: true,
      already: true,
      chosen: { date: c.chosenDate, period: c.chosenPeriod },
    });
  }
  if (c.status !== "confirmed" && c.status !== "driver_rejected") {
    return NextResponse.json({ ok: false, error: "not_ready" }, { status: 409 });
  }

  try {
    if (body.reject === true) {
      await writeConfirm({ ...c, status: "driver_rejected" }, rowNumber);
      await addCardComment(
        c.cardId,
        `【配送時段】⚠️ 司機回報：客人給的三組時段都無法配合\n時間：${fmtTaipei(new Date().toISOString())}\n\n※ 請直接與客人另約時間。`,
      ).catch(() => {});
      await appendNotification({
        type: "delivery_slot",
        title: `⚠️ ${c.orderNumber} 司機三組時段都不行`,
        body: "請直接跟客人另約配送時間",
        link: "/material-confirm",
      });
      return NextResponse.json({ ok: true, rejected: true });
    }

    const idx = Number(body.chosenIndex);
    const chosen = c.preferredSlots[idx];
    if (!chosen) return NextResponse.json({ ok: false, error: "請選一組時段" }, { status: 400 });

    // 客人選「皆可」時沒有具體時間，司機必須指定一個——否則出貨通知算不出到貨區間。
    let period: DeliveryPeriod = chosen.period;
    if (typeof body.period === "string" && body.period) period = normalizeDeliveryPeriod(body.period);
    if (periodStartHour(period) === null) {
      return NextResponse.json({ ok: false, error: "「皆可」請再指定一個具體時段" }, { status: 400 });
    }

    const dueIso = toDueIso(chosen.date, period);
    if (!dueIso) return NextResponse.json({ ok: false, error: "日期時段無法換算" }, { status: 400 });

    await writeConfirm(
      { ...c, status: "scheduled", chosenDate: chosen.date, chosenPeriod: period },
      rowNumber,
    );

    // 出貨日寫回 Trello（＝card.due，出貨通知就是讀這個算到貨區間）
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
        `配送時間：${fmtSlot({ date: chosen.date, period })}`,
        dueWritten ? "" : "⚠️ 出貨日自動寫入失敗，請手動更新卡片日期。",
      ].filter(Boolean).join("\n"),
    ).catch(() => {});

    await appendNotification({
      type: "delivery_slot",
      title: `🚚 ${c.orderNumber} 配送時段已確定`,
      body: `${fmtSlot({ date: chosen.date, period })}${dueWritten ? "，出貨日已更新" : "（出貨日寫入失敗，請手動改）"}`,
      link: "/material-confirm",
    });

    return NextResponse.json({ ok: true, chosen: { date: chosen.date, period }, dueWritten });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
