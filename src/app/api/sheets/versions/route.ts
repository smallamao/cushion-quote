import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import type { CaseRecord, QuotePlanRecord, QuoteVersionRecord, VersionLineRecord } from "@/lib/types";

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

  const caseRows = await getCaseRows(client);
  const caseRowIndex = caseRows.findIndex((row) => row[0] === version.caseId);
  if (caseRowIndex !== -1) {
    const caseRecord = caseRowToRecord(caseRows[caseRowIndex] ?? []);
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
      range: `案件!A${sheetRow}:X${sheetRow}`,
      valueInputOption: "RAW",
      requestBody: { values: [caseRecordToRow(nextCase)] },
    });
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
