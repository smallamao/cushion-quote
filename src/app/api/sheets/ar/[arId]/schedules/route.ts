import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import {
  AR_RANGE_DATA,
  AR_ROW_RANGE,
  AR_SCHEDULE_RANGE_DATA,
  AR_SCHEDULE_RANGE_FULL,
  AR_SCHEDULE_SHEET,
  arRecordToRow,
  arRowToRecord,
  arScheduleRecordToRow,
  arScheduleRowToRecord,
  calcARStatusFromSchedules,
  calcScheduleDerivedStatus,
  generateArScheduleId,
  isoDateNow,
  isoNow,
} from "@/lib/ar-utils";
import type { ARRecord, ARScheduleRecord } from "@/lib/types";

interface RouteContext {
  params: Promise<{ arId: string }>;
}

interface ScheduleInput {
  label: string;
  ratio: number;
  amount: number;
  dueDate: string;
}

// PUT /api/sheets/ar/[arId]/schedules
// Body: { schedules: ScheduleInput[] }
//
// 重新分配一張應收帳款的收款分期（例如原本「全額」改成「訂金＋尾款」），
// 單號與建立紀錄保留，不必刪除重建。
//
// 已收款的處理：把既有分期的已收總額，依序「瀑布式」填入新分期
// （例：全額 24000 已收 10000 → 拆成 訂金 10000 / 尾款 14000
//   → 訂金自動變成已收清、尾款待收）。
// 總已收金額不變，所以帳目不會跑掉；沖銷調整額一併帶到最後一期。
export async function PUT(request: Request, context: RouteContext) {
  const { arId } = await context.params;
  const body = (await request.json()) as { schedules?: ScheduleInput[] };
  const input = body.schedules ?? [];

  if (input.length === 0) {
    return NextResponse.json({ ok: false, error: "schedules is required" }, { status: 400 });
  }
  if (input.some((s) => !Number.isFinite(s.amount) || s.amount <= 0)) {
    return NextResponse.json({ ok: false, error: "每期金額必須大於 0" }, { status: 400 });
  }
  if (input.some((s) => !s.dueDate)) {
    return NextResponse.json({ ok: false, error: "每期都需要預定收款日" }, { status: 400 });
  }

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const [arRes, schedRes, meta] = await Promise.all([
      client.sheets.spreadsheets.values.get({
        spreadsheetId: client.spreadsheetId,
        range: AR_RANGE_DATA,
      }),
      client.sheets.spreadsheets.values.get({
        spreadsheetId: client.spreadsheetId,
        range: AR_SCHEDULE_RANGE_DATA,
      }),
      client.sheets.spreadsheets.get({
        spreadsheetId: client.spreadsheetId,
        fields: "sheets.properties",
      }),
    ]);

    const arRows = (arRes.data.values ?? []) as string[][];
    const arRowIndex = arRows.findIndex((r) => r[0] === arId);
    if (arRowIndex === -1) {
      return NextResponse.json({ ok: false, error: "AR not found" }, { status: 404 });
    }
    const ar = arRowToRecord(arRows[arRowIndex]);

    // 金額總和必須等於應收總額（總額來自報價，這裡只重新分配）
    const sum = input.reduce((s, x) => s + Math.round(x.amount), 0);
    if (Math.abs(sum - Math.round(ar.totalAmount)) >= 1) {
      return NextResponse.json(
        { ok: false, error: `各期金額合計 ${sum} 與應收總額 ${Math.round(ar.totalAmount)} 不符` },
        { status: 400 },
      );
    }

    const schedRows = (schedRes.data.values ?? []) as string[][];
    const existingIdx = schedRows
      .map((r, i) => ({ rec: arScheduleRowToRecord(r), i }))
      .filter((x) => x.rec.arId === arId);

    // 既有收款：總額與收款資訊留著，重新分配到新分期上（不改變已收總額）
    const existingRecs = existingIdx.map((x) => x.rec);
    const totalReceived = existingRecs.reduce((s, r) => s + r.receivedAmount, 0);
    const totalAdjustment = existingRecs.reduce((s, r) => s + r.adjustmentAmount, 0);
    const paidRec = existingRecs.filter((r) => r.receivedAmount > 0);
    const carriedDate = paidRec.map((r) => r.receivedDate).filter(Boolean).sort().pop() ?? "";
    const carriedMethod = paidRec.find((r) => r.paymentMethod)?.paymentMethod ?? "";

    if (totalReceived > Math.round(ar.totalAmount)) {
      return NextResponse.json(
        { ok: false, error: "已收金額大於應收總額，請先修正收款紀錄" },
        { status: 409 },
      );
    }

    const scheduleSheetId = meta.data.sheets?.find(
      (s) => s.properties?.title === AR_SCHEDULE_SHEET,
    )?.properties?.sheetId;
    if (scheduleSheetId == null) {
      return NextResponse.json({ ok: false, error: "schedule sheet not found" }, { status: 500 });
    }

    // 1. 刪除舊分期列（由下往上，避免索引位移）
    if (existingIdx.length > 0) {
      await client.sheets.spreadsheets.batchUpdate({
        spreadsheetId: client.spreadsheetId,
        requestBody: {
          requests: existingIdx
            .map((x) => x.i)
            .sort((a, b) => b - a)
            .map((dataIdx) => ({
              deleteDimension: {
                range: {
                  sheetId: scheduleSheetId,
                  dimension: "ROWS",
                  startIndex: dataIdx + 1, // +1 表頭；0-based grid index
                  endIndex: dataIdx + 2,
                },
              },
            })),
        },
      });
    }

    // 2. 寫入新分期；已收總額依序瀑布式填入（前面的期先收滿）
    const now = isoNow();
    const today = isoDateNow();
    let remainingReceived = totalReceived;

    const schedules: ARScheduleRecord[] = input.map((s, idx) => {
      const amount = Math.round(s.amount);
      const applied = Math.min(remainingReceived, amount);
      remainingReceived -= applied;
      const isLast = idx === input.length - 1;

      const rec: ARScheduleRecord = {
        scheduleId: generateArScheduleId(arId, idx + 1),
        arId,
        seq: idx + 1,
        label: s.label || `第 ${idx + 1} 期`,
        ratio: s.ratio,
        amount,
        dueDate: s.dueDate,
        receivedAmount: applied,
        receivedDate: applied > 0 ? carriedDate : "",
        paymentMethod: applied > 0 ? carriedMethod : "",
        // 沖銷調整額（如匯費）帶到最後一期，維持總額一致
        adjustmentAmount: isLast ? totalAdjustment : 0,
        scheduleStatus: "pending",
        notes: applied > 0 ? "由原分期重新分配（已收金額沿用）" : "",
        createdAt: now,
        updatedAt: now,
      };
      rec.scheduleStatus = calcScheduleDerivedStatus(rec, today);
      return rec;
    });

    await client.sheets.spreadsheets.values.append({
      spreadsheetId: client.spreadsheetId,
      range: AR_SCHEDULE_RANGE_FULL,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: schedules.map(arScheduleRecordToRow) },
    });

    // 3. 重算 AR 彙總（已收總額不變）
    const { arStatus, hasOverdue } = calcARStatusFromSchedules(schedules, today);
    const updatedAr: ARRecord = {
      ...ar,
      receivedAmount: totalReceived,
      outstandingAmount: Math.max(0, ar.totalAmount + totalAdjustment - totalReceived),
      scheduleCount: schedules.length,
      lastReceivedAt: carriedDate || ar.lastReceivedAt,
      arStatus,
      hasOverdue,
      updatedAt: now,
    };
    await client.sheets.spreadsheets.values.update({
      spreadsheetId: client.spreadsheetId,
      range: AR_ROW_RANGE(arRowIndex + 2),
      valueInputOption: "RAW",
      requestBody: { values: [arRecordToRow(updatedAr)] },
    });

    return NextResponse.json({ ok: true, ar: updatedAr, schedules });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
