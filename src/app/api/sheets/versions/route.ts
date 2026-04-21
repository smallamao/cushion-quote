import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import type {
  ARRecord,
  ARScheduleRecord,
  CaseRecord,
  PendingMonthlyRecord,
  QuotePlanRecord,
  QuoteVersionRecord,
  VersionLineRecord,
} from "@/lib/types";
import type { BillingType } from "@/lib/types/company";
import {
  AR_RANGE_DATA,
  AR_RANGE_FULL,
  AR_ROW_RANGE,
  AR_SCHEDULE_RANGE_DATA,
  AR_SCHEDULE_RANGE_FULL,
  AR_SCHEDULE_ROW_RANGE,
  PENDING_MONTHLY_RANGE_DATA,
  PENDING_MONTHLY_RANGE_FULL,
  PENDING_MONTHLY_ROW_RANGE,
  arRecordToRow,
  arRowToRecord,
  arScheduleRecordToRow,
  arScheduleRowToRecord,
  calcARStatusFromSchedules,
  generateArId,
  generateArScheduleId,
  generatePendingMonthlyId,
  pendingMonthlyRecordToRow,
  pendingMonthlyRowToRecord,
} from "@/lib/ar-utils";

import {
  caseRecordToRow,
  caseRowToRecord,
  generateCaseId,
  generateQuoteId,
  generateVersionId,
  getCaseRows,
  getQuoteRows,
  getVersionLineRows,
  getVersionRows,
  isoDateNow,
  isoNow,
  lineRecordToRow,
  lineRowToRecord,
  makeItemId,
  normalizeVersionUpdate,
  quoteRecordToRow,
  quoteRowToRecord,
  sortSheetRows,
  versionRecordToRow,
  versionRowToRecord,
} from "../_v2-utils";
import { syncAutoCommissionSettlements } from "../_settlement-utils";

type CreateVersionAction = "new_version" | "use_as_template" | "new_quote_same_case";

interface NewVersionPayload {
  action: "new_version";
  basedOnVersionId: string;
  versionLabel?: string;
  quoteDate?: string;
  validUntil?: string;
  followUpDays?: number;
  internalNotes?: string;
}

interface UseAsTemplatePayload {
  action: "use_as_template";
  sourceVersionId: string;
  caseDraft?: Partial<CaseRecord>;
  quoteDraft?: Partial<QuotePlanRecord>;
  versionDraft?: Partial<QuoteVersionRecord>;
}

interface NewQuoteSameCasePayload {
  action: "new_quote_same_case";
  sourceVersionId: string;
  targetCaseId: string;
  quoteName?: string;
  quoteDraft?: Partial<QuotePlanRecord>;
  versionDraft?: Partial<QuoteVersionRecord>;
}

type CreateVersionPayload = NewVersionPayload | UseAsTemplatePayload | NewQuoteSameCasePayload;

function copyLinesToVersion(
  sourceLines: VersionLineRecord[],
  version: Pick<QuoteVersionRecord, "versionId" | "quoteId" | "caseId">,
  now: string,
): VersionLineRecord[] {
  return sourceLines.map((line, index) => ({
    ...line,
    itemId: makeItemId(version.versionId, index + 1),
    versionId: version.versionId,
    quoteId: version.quoteId,
    caseId: version.caseId,
    lineNo: index + 1,
    createdAt: now,
    updatedAt: now,
  }));
}

const DEFAULT_AR_DUE_DAYS = 7;

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function getCompanyBillingType(
  client: NonNullable<Awaited<ReturnType<typeof getSheetsClient>>>,
  clientId: string,
): Promise<BillingType> {
  if (!clientId) return "per_quote";
  try {
    const res = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: "客戶資料庫!A2:R",
    });
    const rows = (res.data.values ?? []) as string[][];
    const hit = rows.find((r) => (r[0] ?? "") === clientId);
    if (!hit) return "per_quote";
    const raw = hit[17] ?? "per_quote";
    return raw === "monthly" ? "monthly" : "per_quote";
  } catch {
    return "per_quote";
  }
}

async function syncARFromVersion(
  client: NonNullable<Awaited<ReturnType<typeof getSheetsClient>>>,
  version: QuoteVersionRecord,
  caseClientId: string,
): Promise<void> {
  const now = isoNow();
  const today = isoDateNow();

  const arRes = await client.sheets.spreadsheets.values.get({
    spreadsheetId: client.spreadsheetId,
    range: AR_RANGE_DATA,
  });
  const arRows = (arRes.data.values ?? []) as string[][];
  const ars = arRows.map(arRowToRecord);
  const existing = ars.find(
    (ar) => ar.versionId === version.versionId && ar.createdBy === "auto",
  );

  if (version.versionStatus === "accepted") {
    // Cancel path never applies here; only create if nothing active exists.
    if (existing && existing.arStatus !== "cancelled") return; // already there
    if (
      ars.some(
        (ar) =>
          ar.versionId === version.versionId &&
          ar.arStatus !== "cancelled" &&
          ar.createdBy !== "auto",
      )
    ) {
      // A user manually made an AR for this version; do not double-book.
      return;
    }

    const billingType = await getCompanyBillingType(client, caseClientId);
    const totalAmount = version.totalAmount;
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) return;

    if (billingType === "monthly") {
      await upsertPendingMonthly(client, version, caseClientId);
      return;
    }
    if (billingType !== "per_quote") return;

    const arId = await generateArId(ars.map((ar) => ar.arId));
    const schedule: ARScheduleRecord = {
      scheduleId: generateArScheduleId(arId, 1),
      arId,
      seq: 1,
      label: "全額",
      ratio: 1,
      amount: totalAmount,
      dueDate: addDays(today, DEFAULT_AR_DUE_DAYS),
      receivedAmount: 0,
      receivedDate: "",
      paymentMethod: "",
      scheduleStatus: "pending",
      adjustmentAmount: 0,
      notes: "",
      createdAt: now,
      updatedAt: now,
    };
    const { arStatus, hasOverdue } = calcARStatusFromSchedules([schedule], today);

    const arRecord: ARRecord = {
      arId,
      issueDate: today,
      caseId: version.caseId,
      caseNameSnapshot: version.projectNameSnapshot,
      quoteId: version.quoteId,
      versionId: version.versionId,
      clientId: caseClientId,
      clientNameSnapshot: version.clientNameSnapshot,
      contactNameSnapshot: version.contactNameSnapshot,
      clientPhoneSnapshot: version.clientPhoneSnapshot,
      projectNameSnapshot: version.projectNameSnapshot,
      totalAmount,
      receivedAmount: 0,
      outstandingAmount: totalAmount,
      scheduleCount: 1,
      arStatus,
      hasOverdue,
      lastReceivedAt: "",
      notes: "報價成交自動開立",
      createdAt: now,
      updatedAt: now,
      createdBy: "auto",
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
      requestBody: { values: [arScheduleRecordToRow(schedule)] },
    });
    return;
  }

  // Version moved away from "accepted" (rejected / superseded / reverted):
  // cancel any auto-created AR + its pending schedules so the ledger stays
  // consistent without deleting audit data.
  if (existing && existing.arStatus !== "cancelled") {
    const arRowIdx = arRows.findIndex((r) => (r[0] ?? "") === existing.arId);
    if (arRowIdx >= 0) {
      const cancelled: ARRecord = {
        ...existing,
        arStatus: "cancelled",
        notes: existing.notes
          ? `${existing.notes}\n版本狀態變更,自動取消`
          : "版本狀態變更,自動取消",
        updatedAt: now,
      };
      await client.sheets.spreadsheets.values.update({
        spreadsheetId: client.spreadsheetId,
        range: AR_ROW_RANGE(arRowIdx + 2),
        valueInputOption: "RAW",
        requestBody: { values: [arRecordToRow(cancelled)] },
      });

      // Waive schedules that have no money received so reports don't
      // count them as outstanding anymore.
      const schedRes = await client.sheets.spreadsheets.values.get({
        spreadsheetId: client.spreadsheetId,
        range: AR_SCHEDULE_RANGE_DATA,
      });
      const schedRows = (schedRes.data.values ?? []) as string[][];
      for (let i = 0; i < schedRows.length; i++) {
        const sched = arScheduleRowToRecord(schedRows[i]);
        if (sched.arId !== existing.arId) continue;
        if (sched.receivedAmount > 0) continue;
        if (sched.scheduleStatus === "paid" || sched.scheduleStatus === "waived") continue;
        const next: ARScheduleRecord = {
          ...sched,
          scheduleStatus: "waived",
          updatedAt: now,
        };
        await client.sheets.spreadsheets.values.update({
          spreadsheetId: client.spreadsheetId,
          range: AR_SCHEDULE_ROW_RANGE(i + 2),
          valueInputOption: "RAW",
          requestBody: { values: [arScheduleRecordToRow(next)] },
        });
      }
    }
  }

  // Also cancel any pending-monthly entry for this version that hasn't
  // been consolidated yet (consolidated entries are frozen by design).
  try {
    const pendingRes = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: PENDING_MONTHLY_RANGE_DATA,
    });
    const pendingRows = (pendingRes.data.values ?? []) as string[][];
    for (let i = 0; i < pendingRows.length; i++) {
      const rec = pendingMonthlyRowToRecord(pendingRows[i]);
      if (rec.versionId !== version.versionId) continue;
      if (rec.status !== "pending") continue;
      const cancelled: PendingMonthlyRecord = {
        ...rec,
        status: "cancelled",
        notes: rec.notes
          ? `${rec.notes}\n版本狀態變更,自動取消`
          : "版本狀態變更,自動取消",
        updatedAt: now,
      };
      await client.sheets.spreadsheets.values.update({
        spreadsheetId: client.spreadsheetId,
        range: PENDING_MONTHLY_ROW_RANGE(i + 2),
        valueInputOption: "RAW",
        requestBody: { values: [pendingMonthlyRecordToRow(cancelled)] },
      });
    }
  } catch {
    // 月結待出 sheet may not exist yet; silently skip.
  }
}

async function upsertPendingMonthly(
  client: NonNullable<Awaited<ReturnType<typeof getSheetsClient>>>,
  version: QuoteVersionRecord,
  clientId: string,
): Promise<void> {
  const now = isoNow();
  const today = isoDateNow();
  try {
    const res = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: PENDING_MONTHLY_RANGE_DATA,
    });
    const rows = (res.data.values ?? []) as string[][];
    const records = rows.map(pendingMonthlyRowToRecord);
    const existing = records.find((r) => r.versionId === version.versionId);
    if (existing) {
      // If it was cancelled previously (user toggled status back and forth),
      // re-activate it. If it was already consolidated, leave alone — the
      // admin must handle that case manually.
      if (existing.status === "cancelled") {
        const idx = records.findIndex((r) => r.pendingId === existing.pendingId);
        const revived: PendingMonthlyRecord = {
          ...existing,
          status: "pending",
          amount: version.totalAmount,
          acceptedAt: existing.acceptedAt || today,
          notes: "",
          updatedAt: now,
        };
        await client.sheets.spreadsheets.values.update({
          spreadsheetId: client.spreadsheetId,
          range: PENDING_MONTHLY_ROW_RANGE(idx + 2),
          valueInputOption: "RAW",
          requestBody: { values: [pendingMonthlyRecordToRow(revived)] },
        });
      }
      return;
    }
    const pendingId = await generatePendingMonthlyId(records.map((r) => r.pendingId));
    const record: PendingMonthlyRecord = {
      pendingId,
      versionId: version.versionId,
      quoteId: version.quoteId,
      caseId: version.caseId,
      clientId,
      clientNameSnapshot: version.clientNameSnapshot,
      caseNameSnapshot: version.projectNameSnapshot,
      projectNameSnapshot: version.projectNameSnapshot,
      amount: version.totalAmount,
      acceptedAt: today,
      consolidatedArId: "",
      status: "pending",
      notes: "",
      createdAt: now,
      updatedAt: now,
    };
    await client.sheets.spreadsheets.values.append({
      spreadsheetId: client.spreadsheetId,
      range: PENDING_MONTHLY_RANGE_FULL,
      valueInputOption: "RAW",
      requestBody: { values: [pendingMonthlyRecordToRow(record)] },
    });
  } catch {
    // Most likely the 月結待出 sheet hasn't been migrated yet.
    // Admin needs to run migrate-v13; no-op for now.
  }
}

async function syncVersionToParents(client: NonNullable<Awaited<ReturnType<typeof getSheetsClient>>>, version: QuoteVersionRecord): Promise<void> {
  const now = isoNow();
  const quoteRows = await getQuoteRows(client);
  const quoteRowIndex = quoteRows.findIndex((row) => row[0] === version.quoteId);
  if (quoteRowIndex !== -1) {
    const quote = quoteRowToRecord(quoteRows[quoteRowIndex] ?? []);
    const nextQuote: QuotePlanRecord = {
      ...quote,
      currentVersionId: version.versionId,
      latestSentAt: version.sentAt || quote.latestSentAt,
      nextFollowUpDate: version.nextFollowUpDate || quote.nextFollowUpDate,
      quoteStatus:
        version.versionStatus === "accepted"
          ? "adopted"
          : version.versionStatus === "rejected"
            ? "not_adopted"
            : quote.quoteStatus,
      selectedVersionId:
        version.versionStatus === "accepted" ? version.versionId : quote.selectedVersionId,
      updatedAt: now,
    };
    const sheetRow = quoteRowIndex + 2;
    await client.sheets.spreadsheets.values.update({
      spreadsheetId: client.spreadsheetId,
      range: `報價!A${sheetRow}:P${sheetRow}`,
      valueInputOption: "RAW",
      requestBody: { values: [quoteRecordToRow(nextQuote)] },
    });
  }

  let caseClientId = "";
  const caseRows = await getCaseRows(client);
  const caseRowIndex = caseRows.findIndex((row) => row[0] === version.caseId);
  if (caseRowIndex !== -1) {
    const caseRecord = caseRowToRecord(caseRows[caseRowIndex] ?? []);
    caseClientId = caseRecord.clientId;
    const nextCase: CaseRecord = {
      ...caseRecord,
      latestQuoteId: version.quoteId,
      latestVersionId: version.versionId,
      latestSentAt: version.sentAt || caseRecord.latestSentAt,
      nextFollowUpDate: version.nextFollowUpDate || caseRecord.nextFollowUpDate,
      caseStatus:
        version.versionStatus === "accepted"
          ? "won"
          : version.versionStatus === "rejected"
            ? "lost"
            : caseRecord.caseStatus,
      wonVersionId:
        version.versionStatus === "accepted" ? version.versionId : caseRecord.wonVersionId,
      updatedAt: now,
    };
    const sheetRow = caseRowIndex + 2;
    await client.sheets.spreadsheets.values.update({
      spreadsheetId: client.spreadsheetId,
      range: `案件!A${sheetRow}:AA${sheetRow}`,
      valueInputOption: "RAW",
      requestBody: { values: [caseRecordToRow(nextCase)] },
    });
  }

  try {
    await syncARFromVersion(client, version, caseClientId);
  } catch {
    // AR sync is best-effort; never block the status update itself.
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const quoteId = searchParams.get("quoteId")?.trim() ?? "";
  const clientId = searchParams.get("clientId")?.trim() ?? "";
  const includeLines = searchParams.get("includeLines") !== "false";

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ versions: [] as Array<QuoteVersionRecord & { lines?: VersionLineRecord[] }> });
  }

  try {
    let allowedCaseIds: Set<string> | null = null;
    if (clientId) {
      const caseRows = await getCaseRows(client);
      allowedCaseIds = new Set(
        caseRows.map(caseRowToRecord).filter((c) => c.clientId === clientId).map((c) => c.caseId),
      );
    }

    const versionRowsPromise = getVersionRows(client);
    const lineRowsPromise = includeLines ? getVersionLineRows(client) : Promise.resolve([]);
    const [versionRows, lineRows] = await Promise.all([versionRowsPromise, lineRowsPromise]);

    const lines = includeLines ? lineRows.map(lineRowToRecord) : [];
    const versions = versionRows
      .map(versionRowToRecord)
      .filter((version) => !quoteId || version.quoteId === quoteId)
      .filter((version) => !allowedCaseIds || allowedCaseIds.has(version.caseId))
      .map((version) => ({
        ...version,
        ...(includeLines ? { lines: lines.filter((line) => line.versionId === version.versionId) } : {}),
      }));

    return NextResponse.json({ versions });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const payload = (await request.json()) as CreateVersionPayload & { action?: CreateVersionAction };
  if (!payload.action) {
    return NextResponse.json({ ok: false, error: "action is required" }, { status: 400 });
  }

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    if (payload.action === "new_version") {
      const basedOnVersionId = payload.basedOnVersionId?.trim() ?? "";
      if (!basedOnVersionId) {
        return NextResponse.json({ ok: false, error: "basedOnVersionId is required" }, { status: 400 });
      }

      const [versionRows, lineRows] = await Promise.all([
        getVersionRows(client),
        getVersionLineRows(client),
      ]);

      const baseRowIndex = versionRows.findIndex((row) => row[0] === basedOnVersionId);
      if (baseRowIndex === -1) {
        return NextResponse.json({ ok: false, error: "source version not found" }, { status: 404 });
      }

      const baseVersion = versionRowToRecord(versionRows[baseRowIndex] ?? []);
      const { versionId, versionNo } = await generateVersionId(client, baseVersion.quoteId);
      const now = isoNow();
      const today = isoDateNow();

      const draft: QuoteVersionRecord = normalizeVersionUpdate(
        {
          ...baseVersion,
          versionId,
          versionNo,
          basedOnVersionId,
          versionLabel: payload.versionLabel ?? `V${String(versionNo).padStart(2, "0")}`,
          versionStatus: "draft",
          quoteDate: payload.quoteDate ?? today,
          sentAt: "",
          validUntil: payload.validUntil ?? "",
          followUpDays: payload.followUpDays ?? baseVersion.followUpDays,
          nextFollowUpDate: "",
          lastFollowUpAt: "",
          internalNotes: payload.internalNotes ?? baseVersion.internalNotes,
          snapshotLocked: false,
          snapshotLockedAt: "",
          createdAt: now,
          updatedAt: now,
        },
        now,
      );

      const superseded = normalizeVersionUpdate(
        {
          ...baseVersion,
          versionStatus: "superseded",
        },
        now,
      );

      const baseSheetRow = baseRowIndex + 2;
      await client.sheets.spreadsheets.values.update({
        spreadsheetId: client.spreadsheetId,
        range: `報價版本!A${baseSheetRow}:AU${baseSheetRow}`,
        valueInputOption: "RAW",
        requestBody: { values: [versionRecordToRow(superseded)] },
      });

      await client.sheets.spreadsheets.values.append({
        spreadsheetId: client.spreadsheetId,
          range: "報價版本!A:AU",
        valueInputOption: "RAW",
        requestBody: { values: [versionRecordToRow(draft)] },
      });

      const baseLines = lineRows
        .map(lineRowToRecord)
        .filter((line) => line.versionId === basedOnVersionId);
      const copiedLines = copyLinesToVersion(baseLines, draft, now);
      if (copiedLines.length > 0) {
        await client.sheets.spreadsheets.values.append({
          spreadsheetId: client.spreadsheetId,
          range: "報價版本明細!A:AG",
          valueInputOption: "RAW",
          requestBody: { values: copiedLines.map(lineRecordToRow) },
        });
      }

      await syncAutoCommissionSettlements(client, draft);

      await syncVersionToParents(client, draft);
      await sortSheetRows(client, {
        sheetName: "報價版本",
        dataRange: "報價版本!A2:AU",
        totalColumnCount: 47,
        primarySortColumnIndex: 35,
        secondarySortColumnIndex: 0,
      });
      await sortSheetRows(client, {
        sheetName: "報價",
        dataRange: "報價!A2:P",
        totalColumnCount: 16,
        primarySortColumnIndex: 14,
        secondarySortColumnIndex: 0,
      });
      await sortSheetRows(client, {
        sheetName: "案件",
        dataRange: "案件!A2:X",
        totalColumnCount: 24,
        primarySortColumnIndex: 18,
        secondarySortColumnIndex: 0,
      });
      return NextResponse.json({ ok: true, versionId: draft.versionId }, { status: 201 });
    }

    if (payload.action === "new_quote_same_case") {
      const sourceVersionId = payload.sourceVersionId?.trim() ?? "";
      const targetCaseId = payload.targetCaseId?.trim() ?? "";

      if (!sourceVersionId) {
        return NextResponse.json({ ok: false, error: "sourceVersionId is required" }, { status: 400 });
      }
      if (!targetCaseId) {
        return NextResponse.json({ ok: false, error: "targetCaseId is required" }, { status: 400 });
      }

      const [caseRows, versionRows, lineRows, quoteRows] = await Promise.all([
        getCaseRows(client),
        getVersionRows(client),
        getVersionLineRows(client),
        getQuoteRows(client),
      ]);

      const targetCase = caseRows
        .map(caseRowToRecord)
        .find((record) => record.caseId === targetCaseId);
      if (!targetCase) {
        return NextResponse.json({ ok: false, error: "target case not found" }, { status: 404 });
      }

      const sourceVersion = versionRows
        .map(versionRowToRecord)
        .find((version) => version.versionId === sourceVersionId);
      if (!sourceVersion) {
        return NextResponse.json({ ok: false, error: "source version not found" }, { status: 404 });
      }

      const sourceQuote = quoteRows
        .map(quoteRowToRecord)
        .find((quote) => quote.quoteId === sourceVersion.quoteId);
      const sourceLines = lineRows
        .map(lineRowToRecord)
        .filter((line) => line.versionId === sourceVersionId);

      const now = isoNow();
      const today = isoDateNow();
      const { quoteId, quoteSeq } = await generateQuoteId(client, targetCaseId);
      const versionId = `${quoteId}-V01`;

      const quoteDraft = payload.quoteDraft ?? {};
      const quoteRecord: QuotePlanRecord = {
        quoteId,
        caseId: targetCaseId,
        quoteSeq,
        quoteName: payload.quoteName ?? quoteDraft.quoteName ?? sourceQuote?.quoteName ?? "",
        quoteType: quoteDraft.quoteType ?? sourceQuote?.quoteType ?? "",
        scopeNote: quoteDraft.scopeNote ?? sourceQuote?.scopeNote ?? "",
        quoteStatus: quoteDraft.quoteStatus ?? "draft",
        currentVersionId: versionId,
        selectedVersionId: "",
        versionCount: 1,
        latestSentAt: "",
        nextFollowUpDate: "",
        sortOrder: quoteDraft.sortOrder ?? quoteSeq,
        internalNotes: quoteDraft.internalNotes ?? "",
        createdAt: now,
        updatedAt: now,
      };

      const versionDraft = payload.versionDraft ?? {};
      const draftVersion = normalizeVersionUpdate(
        {
          ...sourceVersion,
          ...versionDraft,
          versionId,
          quoteId,
          caseId: targetCaseId,
          versionNo: 1,
          basedOnVersionId: sourceVersionId,
          versionLabel: versionDraft.versionLabel ?? "V01 初版",
          versionStatus: versionDraft.versionStatus ?? "draft",
          quoteDate: versionDraft.quoteDate ?? today,
          sentAt: "",
          nextFollowUpDate: "",
          lastFollowUpAt: "",
          reminderStatus: "not_sent",
          snapshotLocked: false,
          snapshotLockedAt: "",
          clientNameSnapshot: targetCase.clientNameSnapshot,
          contactNameSnapshot: targetCase.contactNameSnapshot,
          clientPhoneSnapshot: targetCase.phoneSnapshot,
          projectNameSnapshot: targetCase.caseName,
          projectAddressSnapshot: targetCase.projectAddress,
          channelSnapshot: targetCase.channelSnapshot,
          quoteNameSnapshot: quoteRecord.quoteName,
          createdAt: now,
          updatedAt: now,
        },
        now,
      );

      const copiedLines = copyLinesToVersion(sourceLines, draftVersion, now);

      await client.sheets.spreadsheets.values.append({
        spreadsheetId: client.spreadsheetId,
        range: "報價!A:P",
        valueInputOption: "RAW",
        requestBody: { values: [quoteRecordToRow(quoteRecord)] },
      });
      await client.sheets.spreadsheets.values.append({
        spreadsheetId: client.spreadsheetId,
        range: "報價版本!A:AU",
        valueInputOption: "RAW",
        requestBody: { values: [versionRecordToRow(draftVersion)] },
      });
      if (copiedLines.length > 0) {
        await client.sheets.spreadsheets.values.append({
          spreadsheetId: client.spreadsheetId,
          range: "報價版本明細!A:AG",
          valueInputOption: "RAW",
          requestBody: { values: copiedLines.map(lineRecordToRow) },
        });
      }

      await syncAutoCommissionSettlements(client, draftVersion);
      await syncVersionToParents(client, draftVersion);
      await sortSheetRows(client, {
        sheetName: "報價版本",
        dataRange: "報價版本!A2:AU",
        totalColumnCount: 47,
        primarySortColumnIndex: 35,
        secondarySortColumnIndex: 0,
      });
      await sortSheetRows(client, {
        sheetName: "報價",
        dataRange: "報價!A2:P",
        totalColumnCount: 16,
        primarySortColumnIndex: 14,
        secondarySortColumnIndex: 0,
      });
      await sortSheetRows(client, {
        sheetName: "案件",
        dataRange: "案件!A2:X",
        totalColumnCount: 24,
        primarySortColumnIndex: 18,
        secondarySortColumnIndex: 0,
      });

      return NextResponse.json({ ok: true, caseId: targetCaseId, quoteId, versionId }, { status: 201 });
    }

    const sourceVersionId = payload.sourceVersionId?.trim() ?? "";
    if (!sourceVersionId) {
      return NextResponse.json({ ok: false, error: "sourceVersionId is required" }, { status: 400 });
    }

    const [caseRows, versionRows, lineRows, quoteRows] = await Promise.all([
      getCaseRows(client),
      getVersionRows(client),
      getVersionLineRows(client),
      getQuoteRows(client),
    ]);
    const sourceVersion = versionRows
      .map(versionRowToRecord)
      .find((version) => version.versionId === sourceVersionId);
    if (!sourceVersion) {
      return NextResponse.json({ ok: false, error: "source version not found" }, { status: 404 });
    }

    const sourceQuote = quoteRows
      .map(quoteRowToRecord)
      .find((quote) => quote.quoteId === sourceVersion.quoteId);
    const sourceCase = caseRows
      .map(caseRowToRecord)
      .find((record) => record.caseId === sourceVersion.caseId);
    const sourceLines = lineRows
      .map(lineRowToRecord)
      .filter((line) => line.versionId === sourceVersionId);

    const now = isoNow();
    const today = isoDateNow();
    const caseId = await generateCaseId(client);
    const { quoteId, quoteSeq } = await generateQuoteId(client, caseId);
    const versionId = `${quoteId}-V01`;

    const caseDraft = payload.caseDraft ?? {};
    const caseRecord: CaseRecord = {
      caseId,
      caseName: caseDraft.caseName ?? sourceVersion.projectNameSnapshot,
      clientId: caseDraft.clientId ?? "",
      clientNameSnapshot: caseDraft.clientNameSnapshot ?? sourceVersion.clientNameSnapshot,
      contactNameSnapshot: caseDraft.contactNameSnapshot ?? sourceVersion.contactNameSnapshot,
      phoneSnapshot: caseDraft.phoneSnapshot ?? sourceVersion.clientPhoneSnapshot,
      projectAddress: caseDraft.projectAddress ?? sourceVersion.projectAddressSnapshot,
      channelSnapshot: caseDraft.channelSnapshot ?? sourceVersion.channelSnapshot,
      leadSource: caseDraft.leadSource ?? sourceCase?.leadSource ?? "unknown",
      leadSourceDetail: caseDraft.leadSourceDetail ?? sourceCase?.leadSourceDetail ?? "",
      leadSourceContact: caseDraft.leadSourceContact ?? sourceCase?.leadSourceContact ?? "",
      leadSourceNotes: caseDraft.leadSourceNotes ?? sourceCase?.leadSourceNotes ?? "",
      caseStatus: caseDraft.caseStatus ?? "quoting",
      inquiryDate: caseDraft.inquiryDate ?? today,
      latestQuoteId: quoteId,
      latestVersionId: versionId,
      latestSentAt: "",
      nextFollowUpDate: "",
      lastFollowUpAt: "",
      wonVersionId: "",
      lostReason: "",
      internalNotes: caseDraft.internalNotes ?? "",
      createdAt: now,
      updatedAt: now,
      shippingStatus: caseDraft.shippingStatus ?? "not_started",
      trackingNo: caseDraft.trackingNo ?? "",
      shippedAt: caseDraft.shippedAt ?? "",
    };

    const quoteDraft = payload.quoteDraft ?? {};
    const quoteRecord: QuotePlanRecord = {
      quoteId,
      caseId,
      quoteSeq,
      quoteName: quoteDraft.quoteName ?? sourceQuote?.quoteName ?? "",
      quoteType: quoteDraft.quoteType ?? sourceQuote?.quoteType ?? "",
      scopeNote: quoteDraft.scopeNote ?? sourceQuote?.scopeNote ?? "",
      quoteStatus: quoteDraft.quoteStatus ?? "draft",
      currentVersionId: versionId,
      selectedVersionId: "",
      versionCount: 1,
      latestSentAt: "",
      nextFollowUpDate: "",
      sortOrder: quoteDraft.sortOrder ?? 1,
      internalNotes: quoteDraft.internalNotes ?? "",
      createdAt: now,
      updatedAt: now,
    };

    const versionDraft = payload.versionDraft ?? {};
    const draftVersion = normalizeVersionUpdate(
      {
        ...sourceVersion,
        ...versionDraft,
        versionId,
        quoteId,
        caseId,
        versionNo: 1,
        basedOnVersionId: sourceVersionId,
        versionLabel: versionDraft.versionLabel ?? "V01",
        versionStatus: versionDraft.versionStatus ?? "draft",
        quoteDate: versionDraft.quoteDate ?? today,
        sentAt: "",
        nextFollowUpDate: "",
        lastFollowUpAt: "",
        reminderStatus: "not_sent",
        snapshotLocked: false,
        snapshotLockedAt: "",
        clientNameSnapshot: caseRecord.clientNameSnapshot,
        contactNameSnapshot: caseRecord.contactNameSnapshot,
        clientPhoneSnapshot: caseRecord.phoneSnapshot,
        projectNameSnapshot: caseRecord.caseName,
        projectAddressSnapshot: caseRecord.projectAddress,
        channelSnapshot: caseRecord.channelSnapshot,
        quoteNameSnapshot: quoteRecord.quoteName,
        createdAt: now,
        updatedAt: now,
      },
      now,
    );

    const copiedLines = copyLinesToVersion(sourceLines, draftVersion, now);

    await client.sheets.spreadsheets.values.append({
      spreadsheetId: client.spreadsheetId,
      range: "案件!A:X",
      valueInputOption: "RAW",
      requestBody: { values: [caseRecordToRow(caseRecord)] },
    });
    await client.sheets.spreadsheets.values.append({
      spreadsheetId: client.spreadsheetId,
      range: "報價!A:P",
      valueInputOption: "RAW",
      requestBody: { values: [quoteRecordToRow(quoteRecord)] },
    });
    await client.sheets.spreadsheets.values.append({
      spreadsheetId: client.spreadsheetId,
        range: "報價版本!A:AU",
      valueInputOption: "RAW",
      requestBody: { values: [versionRecordToRow(draftVersion)] },
    });
    if (copiedLines.length > 0) {
      await client.sheets.spreadsheets.values.append({
        spreadsheetId: client.spreadsheetId,
        range: "報價版本明細!A:AG",
        valueInputOption: "RAW",
        requestBody: { values: copiedLines.map(lineRecordToRow) },
      });
    }

    await syncAutoCommissionSettlements(client, draftVersion);
    await sortSheetRows(client, {
      sheetName: "案件",
      dataRange: "案件!A2:X",
      totalColumnCount: 24,
      primarySortColumnIndex: 18,
      secondarySortColumnIndex: 0,
    });
    await sortSheetRows(client, {
      sheetName: "報價",
      dataRange: "報價!A2:P",
      totalColumnCount: 16,
      primarySortColumnIndex: 14,
      secondarySortColumnIndex: 0,
    });
    await sortSheetRows(client, {
      sheetName: "報價版本",
      dataRange: "報價版本!A2:AU",
      totalColumnCount: 47,
      primarySortColumnIndex: 35,
      secondarySortColumnIndex: 0,
    });

    return NextResponse.json({ ok: true, caseId, quoteId, versionId }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const payload = (await request.json()) as Partial<QuoteVersionRecord> & { versionId?: string };
  const versionId = payload.versionId?.trim() ?? "";
  if (!versionId) {
    return NextResponse.json({ ok: false, error: "versionId is required" }, { status: 400 });
  }

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const rows = await getVersionRows(client);
    const rowIndex = rows.findIndex((row) => row[0] === versionId);
    if (rowIndex === -1) {
      return NextResponse.json({ ok: false, error: "version not found" }, { status: 404 });
    }

    const now = isoNow();
    const current = versionRowToRecord(rows[rowIndex] ?? []);
    const merged = normalizeVersionUpdate(
      {
        ...current,
        ...payload,
        versionId: current.versionId,
        quoteId: current.quoteId,
        caseId: current.caseId,
        versionNo: current.versionNo,
        createdAt: current.createdAt,
      },
      now,
    );

    const sheetRow = rowIndex + 2;
    await client.sheets.spreadsheets.values.update({
      spreadsheetId: client.spreadsheetId,
        range: `報價版本!A${sheetRow}:AU${sheetRow}`,
      valueInputOption: "RAW",
      requestBody: { values: [versionRecordToRow(merged)] },
    });

    await syncAutoCommissionSettlements(client, merged);

    await syncVersionToParents(client, merged);
    return NextResponse.json({ ok: true, versionId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
