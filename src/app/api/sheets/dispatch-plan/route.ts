import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/api-auth";
import { parseDeliveryRegion } from "@/lib/delivery-region";
// 🔴 規則常數**刻意不從這裡序列化給前端**（2026-11-09）：dispatch-rules.ts 是
//    純常數＋純函式、沒有 server-only，前端可以直接 import。先前把 softCap/hardCap
//    包成 `rules` 傳過去，結果 DispatchPlanClient 又自己寫了一份預設值當 fallback，
//    等於同一組門檻有三份真相（常數、序列化、前端 useState）——改常數前端不會跟著動，
//    而且 fetch 失敗時畫面會照著舊數字判斷，完全不報錯。
import { suggestDriver } from "@/lib/dispatch-rules";
import { listDrivers } from "@/lib/drivers-sheet";
import { listConfirms, writeConfirm } from "@/lib/material-confirm-sheet";
import { normalizeDeliveryPeriod } from "@/lib/material-confirm-types";
import { driverNameFromLabelIds, TRELLO } from "@/lib/trello-constants";
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
    const [confirms, cards, roster] = await Promise.all([
      listConfirms(),
      getBoardCardsWithDesc(TRELLO.BOARD_ID).catch(() => null),
      // 現役司機的事實來源是司機設定表（老闆可從設定頁新增）。讀不到就退回
      // 程式內的 DRIVER_LIST——driverNameFromLabelIds 的預設值會處理。
      listDrivers().catch(() => null),
    ]);
    /**
     * 🔴 Trello 讀不到時要讓畫面知道（2026-11-09 審查抓到）。
     *    先前是 .catch(() => [])，於是失敗時所有卡片資料都變空：
     *    區域全是「需確認」、司機全是未指派，而容量示警改用「單一司機最高趟數」
     *    之後，peak 會變成 0，**整個月的 🚨 ⚠️ 一起靜默消失**。
     *    使用者只會看到「N 趟未指派」，以為只是標籤還沒掛。
     *    資料不完整比沒有警示更危險，所以明講出來。
     */
    const trelloOk = cards !== null;
    const boardCards = cards ?? [];
    // 地址在卡片描述裡，沒有獨立欄位；司機在卡片的標籤裡，也沒有獨立欄位。
    const descById = new Map(boardCards.map((c) => [c.id, c.desc ?? ""]));
    const activeRoster = roster?.filter((d) => d.active) ?? undefined;
    const driverById = new Map(
      boardCards.map((c) => [c.id, driverNameFromLabelIds(c.idLabels, activeRoster)]),
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
          /** 卡片上目前實際掛的司機標籤；空＝還沒指派。不要跟 driver（建議）混用。 */
          assignedDriver: driverById.get(c.cardId) ?? "",
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
          /** 客人原本給的三組——已排定的單要改天時，直接從這裡挑，不必先取消再重找 */
          slots: c.preferredSlots,
          dueDate: c.dueDate,
          region: region.label,
          city: region.city,
          isRemote: region.isRemote,
          /**
           * 這一趟是誰跑。容量要**每位司機各自算**（老闆 2026-11-09 拍板）：
           * 阿富去台東那趟不該吃掉台北的額度，反過來 5 趟全壓在阿信身上
           * 也不該看起來跟兩人各 2-3 趟一樣安全。
           * 空字串＝卡上還沒掛司機標籤，呼叫端要單獨呈現、不要猜成主力。
           */
          assignedDriver: driverById.get(c.cardId) ?? "",
        };
      });

    return NextResponse.json({ ok: true, pending, scheduled, trelloOk });
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
