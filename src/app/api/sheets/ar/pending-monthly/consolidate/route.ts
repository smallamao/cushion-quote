import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import {
  AR_RANGE_DATA,
  AR_RANGE_FULL,
  AR_SCHEDULE_RANGE_FULL,
  PENDING_MONTHLY_RANGE_DATA,
  PENDING_MONTHLY_ROW_RANGE,
  arRecordToRow,
  arRowToRecord,
  arScheduleRecordToRow,
  calcARStatusFromSchedules,
  generateArId,
  generateArScheduleId,
  isoDateNow,
  isoNow,
  pendingMonthlyRecordToRow,
  pendingMonthlyRowToRecord,
} from "@/lib/ar-utils";
import type {
  ARRecord,
  ARScheduleRecord,
  ConsolidatePendingPayload,
  PendingMonthlyRecord,
} from "@/lib/types";

export async function POST(request: Request) {
  let payload: ConsolidatePendingPayload;
  try {
    payload = (await request.json()) as ConsolidatePendingPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const clientId = (payload.clientId ?? "").trim();
  const pendingIds = Array.isArray(payload.pendingIds)
    ? Array.from(new Set(payload.pendingIds.filter(Boolean)))
    : [];
  const dueDate = (payload.dueDate ?? "").trim();

  if (!clientId) {
    return NextResponse.json({ ok: false, error: "clientId is required" }, { status: 400 });
  }
  if (pendingIds.length === 0) {
    return NextResponse.json({ ok: false, error: "pendingIds is required" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    return NextResponse.json(
      { ok: false, error: "dueDate must be YYYY-MM-DD" },
      { status: 400 },
    );
  }

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json(
      { ok: false, error: "Google Sheets 未設定" },
      { status: 503 },
    );
  }

  try {
    const [pendingRes, arRes] = await Promise.all([
      client.sheets.spreadsheets.values.get({
        spreadsheetId: client.spreadsheetId,
        range: PENDING_MONTHLY_RANGE_DATA,
      }),
      client.sheets.spreadsheets.values.get({
        spreadsheetId: client.spreadsheetId,
        range: AR_RANGE_DATA,
      }),
    ]);

    const pendingRows = (pendingRes.data.values ?? []) as string[][];
    const pendingRecords = pendingRows.map(pendingMonthlyRowToRecord);
    const targets = pendingRecords.filter(
      (r) => pendingIds.includes(r.pendingId) && r.status === "pending",
    );

    if (targets.length === 0) {
      return NextResponse.json(
        { ok: false, error: "沒有可合併的待結項目" },
        { status: 400 },
      );
    }

    const allSameClient = targets.every((r) => r.clientId === clientId);
    if (!allSameClient) {
      return NextResponse.json(
        { ok: false, error: "pendingIds must all belong to the same clientId" },
        { status: 400 },
      );
    }

    const arRows = (arRes.data.values ?? []) as string[][];
    const existingArs = arRows.map(arRowToRecord);
    const arId = await generateArId(existingArs.map((ar) => ar.arId));
    const now = isoNow();
    const today = isoDateNow();
    const totalAmount = targets.reduce((sum, r) => sum + r.amount, 0);

    const schedules: ARScheduleRecord[] = targets.map((r, idx) => ({
      scheduleId: generateArScheduleId(arId, idx + 1),
      arId,
      seq: idx + 1,
      label: r.caseNameSnapshot || r.versionId,
      ratio: totalAmount > 0 ? r.amount / totalAmount : 0,
      amount: r.amount,
      dueDate,
      receivedAmount: 0,
      receivedDate: "",
      paymentMethod: "",
      scheduleStatus: "pending",
      adjustmentAmount: 0,
      notes: `案件 ${r.caseId} / 版本 ${r.versionId}`,
      createdAt: now,
      updatedAt: now,
    }));

    const { arStatus, hasOverdue } = calcARStatusFromSchedules(schedules, today);

    const first = targets[0];
    const arRecord: ARRecord = {
      arId,
      issueDate: today,
      caseId: "", // consolidated across multiple cases
      caseNameSnapshot: `月結 x${targets.length}`,
      quoteId: "",
      versionId: "",
      clientId,
      clientNameSnapshot: first.clientNameSnapshot,
      contactNameSnapshot: "",
      clientPhoneSnapshot: "",
      projectNameSnapshot: `${targets.length} 筆成交案件`,
      totalAmount,
      receivedAmount: 0,
      outstandingAmount: totalAmount,
      scheduleCount: schedules.length,
      arStatus,
      hasOverdue,
      lastReceivedAt: "",
      notes:
        payload.notes?.trim() ||
        `月結合併 ${targets.length} 筆案件 (${targets.map((t) => t.caseId).join(", ")})`,
      createdAt: now,
      updatedAt: now,
      createdBy: "auto-monthly",
    };

    await client.sheets.spreadsheets.values.append({
      spreadsheetId: client.spreadsheetId,
      range: AR_RANGE_FULL,
      valueInputOption: "RAW",
      requestBody: { values: [arRecordToRow(arRecord)] },
    });
    await client.sheets.spreadsheets.values.append({
      spreadsheetId: client.spreadsheetId,
      range: AR_SCHEDULE_RANGE_FULL,
      valueInputOption: "RAW",
      requestBody: { values: schedules.map(arScheduleRecordToRow) },
    });

    // Mark pending rows as consolidated in one batch update.
    const updates: Array<{ range: string; values: string[][] }> = [];
    pendingRows.forEach((row, idx) => {
      const rec = pendingMonthlyRowToRecord(row);
      if (!pendingIds.includes(rec.pendingId) || rec.status !== "pending") return;
      const next: PendingMonthlyRecord = {
        ...rec,
        status: "consolidated",
        consolidatedArId: arId,
        updatedAt: now,
      };
      updates.push({
        range: PENDING_MONTHLY_ROW_RANGE(idx + 2),
        values: [pendingMonthlyRecordToRow(next)],
      });
    });
    if (updates.length > 0) {
      await client.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: client.spreadsheetId,
        requestBody: {
          valueInputOption: "RAW",
          data: updates,
        },
      });
    }

    return NextResponse.json(
      { ok: true, ar: arRecord, schedules, consolidated: targets.length },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
