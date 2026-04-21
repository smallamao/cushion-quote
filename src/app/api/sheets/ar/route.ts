import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import {
  AR_RANGE_DATA,
  AR_RANGE_FULL,
  AR_SCHEDULE_RANGE_DATA,
  AR_SCHEDULE_RANGE_FULL,
  arRecordToRow,
  arRowToRecord,
  arScheduleRecordToRow,
  arScheduleRowToRecord,
  calcARStatusFromSchedules,
  generateArId,
  generateArScheduleId,
  isoDateNow,
  isoNow,
} from "@/lib/ar-utils";
import type {
  ARRecord,
  ARScheduleRecord,
  CreateARPayload,
} from "@/lib/types";
import {
  getVersionRows,
  versionRowToRecord,
} from "../_v2-utils";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const caseId = searchParams.get("caseId")?.trim() ?? "";
  const clientId = searchParams.get("clientId")?.trim() ?? "";
  const status = searchParams.get("status")?.trim() ?? "";
  const overdueOnly = searchParams.get("overdueOnly") === "true";
  const includeSchedules = searchParams.get("includeSchedules") === "true";

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({
      ars: [] as Array<ARRecord & { schedules?: ARScheduleRecord[] }>,
    });
  }

  try {
    const arPromise = client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: AR_RANGE_DATA,
    });
    const schedulePromise = includeSchedules
      ? client.sheets.spreadsheets.values.get({
          spreadsheetId: client.spreadsheetId,
          range: AR_SCHEDULE_RANGE_DATA,
        })
      : Promise.resolve(null);

    const [arRes, scheduleRes] = await Promise.all([arPromise, schedulePromise]);
    const arRows = (arRes.data.values ?? []) as string[][];

    const arList = arRows
      .map(arRowToRecord)
      .filter((ar) => !caseId || ar.caseId === caseId)
      .filter((ar) => !clientId || ar.clientId === clientId)
      .filter((ar) => !status || ar.arStatus === status)
      .filter((ar) => !overdueOnly || ar.hasOverdue);

    if (includeSchedules && scheduleRes) {
      const scheduleRows = (scheduleRes.data.values ?? []) as string[][];
      const allSchedules = scheduleRows.map(arScheduleRowToRecord);
      const withSchedules = arList.map((ar) => ({
        ...ar,
        schedules: allSchedules
          .filter((s) => s.arId === ar.arId)
          .sort((a, b) => a.seq - b.seq),
      }));
      return NextResponse.json({ ars: withSchedules });
    }

    return NextResponse.json({ ars: arList });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const payload = (await request.json()) as CreateARPayload;
  if (!payload.versionId) {
    return NextResponse.json(
      { ok: false, error: "versionId is required" },
      { status: 400 },
    );
  }
  if (!Array.isArray(payload.schedules) || payload.schedules.length === 0) {
    return NextResponse.json(
      { ok: false, error: "schedules is required" },
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
    const [versionRows, arRes] = await Promise.all([
      getVersionRows(client),
      client.sheets.spreadsheets.values.get({
        spreadsheetId: client.spreadsheetId,
        range: AR_RANGE_DATA,
      }),
    ]);

    const version = versionRows
      .map(versionRowToRecord)
      .find((v) => v.versionId === payload.versionId);
    if (!version) {
      return NextResponse.json(
        { ok: false, error: "version not found" },
        { status: 404 },
      );
    }

    const existingArs = ((arRes.data.values ?? []) as string[][]).map(arRowToRecord);
    const existingIds = existingArs.map((ar) => ar.arId);
    const existingForVersion = existingArs.find(
      (ar) => ar.versionId === payload.versionId && ar.arStatus !== "cancelled",
    );
    if (existingForVersion) {
      return NextResponse.json(
        {
          ok: false,
          error: `此版本已有應收帳款 ${existingForVersion.arId}`,
          arId: existingForVersion.arId,
        },
        { status: 409 },
      );
    }

    const now = isoNow();
    const today = isoDateNow();
    const arId = await generateArId(existingIds);

    const totalAmount = payload.schedules.reduce((sum, s) => sum + s.amount, 0);

    const schedules: ARScheduleRecord[] = payload.schedules.map((s, idx) => ({
      scheduleId: generateArScheduleId(arId, idx + 1),
      arId,
      seq: idx + 1,
      label: s.label,
      ratio: s.ratio,
      amount: s.amount,
      dueDate: s.dueDate,
      receivedAmount: 0,
      receivedDate: "",
      paymentMethod: "",
      scheduleStatus: "pending",
      adjustmentAmount: 0,
      notes: "",
      createdAt: now,
      updatedAt: now,
    }));

    const { arStatus, hasOverdue } = calcARStatusFromSchedules(schedules, today);

    // Look up client info via case → use case's clientId
    // For MVP, we rely on version.clientNameSnapshot etc.
    const arRecord: ARRecord = {
      arId,
      issueDate: today,
      caseId: version.caseId,
      caseNameSnapshot: version.projectNameSnapshot,
      quoteId: version.quoteId,
      versionId: version.versionId,
      clientId: "",
      clientNameSnapshot: version.clientNameSnapshot,
      contactNameSnapshot: version.contactNameSnapshot,
      clientPhoneSnapshot: version.clientPhoneSnapshot,
      projectNameSnapshot: version.projectNameSnapshot,
      totalAmount,
      receivedAmount: 0,
      outstandingAmount: totalAmount,
      scheduleCount: schedules.length,
      arStatus,
      hasOverdue,
      lastReceivedAt: "",
      notes: payload.notes ?? "",
      createdAt: now,
      updatedAt: now,
      createdBy: "",
    };

    // Append AR record
    await client.sheets.spreadsheets.values.append({
      spreadsheetId: client.spreadsheetId,
      range: AR_RANGE_FULL,
      valueInputOption: "RAW",
      requestBody: { values: [arRecordToRow(arRecord)] },
    });

    // Append schedule rows
    await client.sheets.spreadsheets.values.append({
      spreadsheetId: client.spreadsheetId,
      range: AR_SCHEDULE_RANGE_FULL,
      valueInputOption: "RAW",
      requestBody: { values: schedules.map(arScheduleRecordToRow) },
    });

    return NextResponse.json({ ok: true, ar: arRecord, schedules }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
