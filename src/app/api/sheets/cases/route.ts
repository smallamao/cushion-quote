import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import type { CaseRecord } from "@/lib/types";

import {
  caseRecordToRow,
  caseRowToRecord,
  generateCaseId,
  getCaseRows,
  getSheetId,
  getQuoteRows,
  getVersionRows,
  getVersionLineRows,
  isoDateNow,
  isoNow,
  sortSheetRows,
} from "../_v2-utils";

export async function GET() {
  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ cases: [] as CaseRecord[] });
  }

  try {
    const rows = await getCaseRows(client);
    return NextResponse.json({ cases: rows.map(caseRowToRecord) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const payload = (await request.json()) as Partial<CaseRecord>;

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const caseId = await generateCaseId(client);
    const now = isoNow();
    const today = isoDateNow();
    const record: CaseRecord = {
      caseId,
      caseName: payload.caseName ?? "",
      clientId: payload.clientId ?? "",
      clientNameSnapshot: payload.clientNameSnapshot ?? "",
      contactNameSnapshot: payload.contactNameSnapshot ?? "",
      phoneSnapshot: payload.phoneSnapshot ?? "",
      projectAddress: payload.projectAddress ?? "",
      channelSnapshot: payload.channelSnapshot ?? "wholesale",
      leadSource: payload.leadSource ?? "unknown",
      leadSourceDetail: payload.leadSourceDetail ?? "",
      leadSourceContact: payload.leadSourceContact ?? "",
      leadSourceNotes: payload.leadSourceNotes ?? "",
      caseStatus: payload.caseStatus ?? "new",
      inquiryDate: payload.inquiryDate ?? today,
      latestQuoteId: payload.latestQuoteId ?? "",
      latestVersionId: payload.latestVersionId ?? "",
      latestSentAt: payload.latestSentAt ?? "",
      nextFollowUpDate: payload.nextFollowUpDate ?? "",
      lastFollowUpAt: payload.lastFollowUpAt ?? "",
      wonVersionId: payload.wonVersionId ?? "",
      lostReason: payload.lostReason ?? "",
      internalNotes: payload.internalNotes ?? "",
      createdAt: now,
      updatedAt: now,
      shippingStatus: payload.shippingStatus ?? "not_started",
      trackingNo: payload.trackingNo ?? "",
      shippedAt: payload.shippedAt ?? "",
      referredByCompanyId: payload.referredByCompanyId ?? "",
      referredByCompanyName: payload.referredByCompanyName ?? "",
    };

    await client.sheets.spreadsheets.values.append({
      spreadsheetId: client.spreadsheetId,
      range: "案件!A:AC",
      valueInputOption: "RAW",
      requestBody: { values: [caseRecordToRow(record)] },
    });

    await sortSheetRows(client, {
      sheetName: "案件",
      dataRange: "案件!A2:AC",
      totalColumnCount: 29,
      primarySortColumnIndex: 18,
      secondarySortColumnIndex: 0,
    });

    return NextResponse.json({ ok: true, caseId }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const payload = (await request.json()) as Partial<CaseRecord> & { caseId?: string };
  const caseId = payload.caseId?.trim() ?? "";

  if (!caseId) {
    return NextResponse.json({ ok: false, error: "caseId is required" }, { status: 400 });
  }

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const rows = await getCaseRows(client);
    const rowIndex = rows.findIndex((row) => row[0] === caseId);
    if (rowIndex === -1) {
      return NextResponse.json({ ok: false, error: "case not found" }, { status: 404 });
    }

    const current = caseRowToRecord(rows[rowIndex] ?? []);
    const merged: CaseRecord = {
      ...current,
      ...payload,
      caseId: current.caseId,
      createdAt: current.createdAt,
      updatedAt: isoNow(),
    };

    const sheetRow = rowIndex + 2;
    await client.sheets.spreadsheets.values.update({
      spreadsheetId: client.spreadsheetId,
        range: `案件!A${sheetRow}:AC${sheetRow}`,
      valueInputOption: "RAW",
      requestBody: { values: [caseRecordToRow(merged)] },
    });

    return NextResponse.json({ ok: true, caseId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const caseId = searchParams.get("caseId")?.trim() ?? "";

  if (!caseId) {
    return NextResponse.json({ ok: false, error: "caseId is required" }, { status: 400 });
  }

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    // Get all data to find related records
    const [caseRows, quoteRows, versionRows, lineRows] = await Promise.all([
      getCaseRows(client),
      getQuoteRows(client),
      getVersionRows(client),
      getVersionLineRows(client),
    ]);

    // Find the case row index
    const caseRowIndex = caseRows.findIndex((row) => row[0] === caseId);
    if (caseRowIndex === -1) {
      return NextResponse.json({ ok: false, error: "案件不存在" }, { status: 404 });
    }

    // Find all quotes under this case
    const quoteIndicesToDelete = quoteRows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => row[1] === caseId) // quoteRows[1] is caseId
      .map(({ index }) => index);

    // Find all versions under this case
    const versionIndicesToDelete = versionRows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => row[2] === caseId) // versionRows[2] is caseId
      .map(({ index }) => index);

    // Find all version lines under this case
    const lineIndicesToDelete = lineRows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => row[3] === caseId) // lineRows[3] is caseId
      .map(({ index }) => index);

    // Delete in reverse order to avoid index shifting issues
    // Delete version lines first
    for (const index of lineIndicesToDelete.sort((a, b) => b - a)) {
      const sheetRow = index + 2;
      await client.sheets.spreadsheets.batchUpdate({
        spreadsheetId: client.spreadsheetId,
        requestBody: {
          requests: [
            {
              deleteDimension: {
                range: {
                  sheetId: await getSheetId(client, "報價版本明細"),
                  dimension: "ROWS",
                  startIndex: sheetRow - 1,
                  endIndex: sheetRow,
                },
              },
            },
          ],
        },
      });
    }

    // Delete versions
    for (const index of versionIndicesToDelete.sort((a, b) => b - a)) {
      const sheetRow = index + 2;
      await client.sheets.spreadsheets.batchUpdate({
        spreadsheetId: client.spreadsheetId,
        requestBody: {
          requests: [
            {
              deleteDimension: {
                range: {
                  sheetId: await getSheetId(client, "報價版本"),
                  dimension: "ROWS",
                  startIndex: sheetRow - 1,
                  endIndex: sheetRow,
                },
              },
            },
          ],
        },
      });
    }

    // Delete quotes
    for (const index of quoteIndicesToDelete.sort((a, b) => b - a)) {
      const sheetRow = index + 2;
      await client.sheets.spreadsheets.batchUpdate({
        spreadsheetId: client.spreadsheetId,
        requestBody: {
          requests: [
            {
              deleteDimension: {
                range: {
                  sheetId: await getSheetId(client, "報價"),
                  dimension: "ROWS",
                  startIndex: sheetRow - 1,
                  endIndex: sheetRow,
                },
              },
            },
          ],
        },
      });
    }

    // Delete the case
    const caseSheetRow = caseRowIndex + 2;
    await client.sheets.spreadsheets.batchUpdate({
      spreadsheetId: client.spreadsheetId,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: await getSheetId(client, "案件"),
                dimension: "ROWS",
                startIndex: caseSheetRow - 1,
                endIndex: caseSheetRow,
              },
            },
          },
        ],
      },
    });

    return NextResponse.json({
      ok: true,
      deleted: {
        case: 1,
        quotes: quoteIndicesToDelete.length,
        versions: versionIndicesToDelete.length,
        lines: lineIndicesToDelete.length,
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
