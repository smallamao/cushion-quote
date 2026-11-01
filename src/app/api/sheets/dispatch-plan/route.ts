import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/api-auth";
import { parseDeliveryRegion } from "@/lib/delivery-region";
import {
  HARD_CAP, MAX_ROUTES, NOTIFY_LEAD_DAYS, SOFT_CAP, suggestDriver,
} from "@/lib/dispatch-rules";
import { listConfirms, writeConfirm } from "@/lib/material-confirm-sheet";
import { normalizeDeliveryPeriod } from "@/lib/material-confirm-types";
import { TRELLO } from "@/lib/trello-constants";
import { addCardCommentUnlessTest, getBoardCardsWithDesc } from "@/lib/trello-server";

/**
 * 排車視圖：把「客人給的希望時段」攤成 日期 × 時段 × 區域，供人工排車。
 *
 * 🔴 刻意不做自動媒合（老闆 2026-10-31 討論後定案）：
 *    每週只有 5～8 筆，第一志願散在 4～5 個日期，衝突其實很輕微。
 *    真正難的是「同一天的單是不是順路」，而順不順路取決於無電梯、
 *    客人難易度、司機熟哪一區——這些資料庫裡一筆都沒有。
 *    這個規模人腦排得比演算法好，系統只負責把分散的資料攤平給人看。
 *
 *    GET  → 待排車清單（已確認、還沒排定配送日的單）
 *    POST → { token, date, period } 指派配送日，狀態轉 scheduled
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 同一天超過這個數量就提示。沒有實際容量資料前用觀測值：實測最多一天 4 筆第一志願。 */
export async function GET(request: Request) {
  const guard = await requireAdmin(request);
  if (guard.denied) return guard.denied;

  try {
    const [confirms, cards] = await Promise.all([
      listConfirms(),
      getBoardCardsWithDesc(TRELLO.BOARD_ID).catch(() => []),
    ]);
    // 地址在卡片描述裡，沒有獨立欄位
    const descById = new Map(
      (cards as Array<{ id: string; desc?: string }>).map((c) => [c.id, c.desc ?? ""]),
    );

    const pending = confirms
      .map(({ confirm }) => confirm)
      .filter((c) => c.status === "confirmed" && !c.chosenDate)
      .map((c) => {
        const region = parseDeliveryRegion(descById.get(c.cardId));
        return {
          token: c.token,
          cardId: c.cardId,
          orderNumber: c.orderNumber,
          customerName: c.customerName,
          dueDate: c.dueDate,
          weekKey: c.weekKey,
          slots: c.preferredSlots,
          region: region.label,
          city: region.city,
          isRemote: region.isRemote,
          regionUnknown: region.unknown,
          driver: suggestDriver(region.city),
          /**
           * 只給一組時段＝完全沒有彈性，要最先鎖定。
           * 老闆 2026-11-01：有些是舊沙發要配合清潔隊時間，改不了。
           */
          locked: c.preferredSlots.length === 1,
        };
      });

    // 已排定的也要回：排新單時要看得到那天已經有誰，否則會重複塞爆同一天
    const scheduled = confirms
      .map(({ confirm }) => confirm)
      .filter((c) => c.chosenDate)
      .map((c) => {
        const region = parseDeliveryRegion(descById.get(c.cardId));
        return {
          token: c.token,
          orderNumber: c.orderNumber,
          customerName: c.customerName,
          date: c.chosenDate,
          period: c.chosenPeriod,
          region: region.label,
          city: region.city,
          isRemote: region.isRemote,
        };
      });

    return NextResponse.json({
      ok: true, pending, scheduled,
      rules: { softCap: SOFT_CAP, hardCap: HARD_CAP, maxRoutes: MAX_ROUTES, notifyLeadDays: NOTIFY_LEAD_DAYS },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "讀取失敗";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const guard = await requireAdmin(request);
  if (guard.denied) return guard.denied;

  let body: { token?: unknown; date?: unknown; period?: unknown; clear?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token : "";
  if (!token) return NextResponse.json({ ok: false, error: "缺少 token" }, { status: 400 });

  const found = (await listConfirms()).find((x) => x.confirm.token === token);
  if (!found) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const { confirm: c, rowNumber } = found;

  // 取消指派：放回待排車
  if (body.clear === true) {
    await writeConfirm({ ...c, status: "confirmed", chosenDate: "", chosenPeriod: "" }, rowNumber);
    return NextResponse.json({ ok: true, cleared: true });
  }

  const date = typeof body.date === "string" ? body.date.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ ok: false, error: "日期格式需為 YYYY-MM-DD" }, { status: 400 });
  }
  const period = normalizeDeliveryPeriod(
    typeof body.period === "string" ? body.period : undefined,
  );

  await writeConfirm(
    { ...c, status: "scheduled", chosenDate: date, chosenPeriod: period },
    rowNumber,
  );
  // 回寫 Trello，讓沒開系統的人也看得到（失敗不影響已寫入的排定）
  await addCardCommentUnlessTest(
    c.cardId,
    `🚚 已排定配送：${date} ${period}`,
  ).catch(() => {});

  return NextResponse.json({ ok: true, date, period });
}
