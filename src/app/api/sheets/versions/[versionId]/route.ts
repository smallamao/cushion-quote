import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import { deriveOptionMeta } from "@/lib/quote-options";
import type { QuoteVersionRecord, VersionLineRecord } from "@/lib/types";

import {
  calculateNextFollowUpDate,
  calculateReminderStatus,
  getVersionLineRows,
  getVersionRows,
  isoNow,
  lineRowToRecord,
  makeItemId,
  replaceVersionLines,
  versionRecordToRow,
  versionRowToRecord,
} from "../../_v2-utils";
import { syncAutoCommissionSettlements } from "../../_settlement-utils";
import { syncVersionToParents } from "../../_version-sync-utils";

interface PutVersionPayload {
  version: QuoteVersionRecord;
  lines: Array<Partial<VersionLineRecord>>;
}

function normalizeVersion(record: QuoteVersionRecord, now: string): QuoteVersionRecord {
  const sentAt = record.sentAt || (record.versionStatus === "sent" ? now : "");
  const nextFollowUpDate =
    record.nextFollowUpDate || calculateNextFollowUpDate(sentAt, record.followUpDays);
  return {
    ...record,
    sentAt,
    nextFollowUpDate,
    reminderStatus: calculateReminderStatus({
      versionStatus: record.versionStatus,
      sentAt,
      nextFollowUpDate,
      lastFollowUpAt: record.lastFollowUpAt,
    }),
    updatedAt: now,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ versionId: string }> },
) {
  const { versionId } = await params;

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const [versionRows, lineRows] = await Promise.all([
      getVersionRows(client),
      getVersionLineRows(client),
    ]);
    const version = versionRows
      .map(versionRowToRecord)
      .find((row) => row.versionId === versionId);

    if (!version) {
      return NextResponse.json({ ok: false, error: "version not found" }, { status: 404 });
    }

    const lines = lineRows
      .map(lineRowToRecord)
      .filter((line) => line.versionId === versionId);

    return NextResponse.json({ version, lines });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ versionId: string }> },
) {
  const { versionId } = await params;
  const payload = (await request.json()) as PutVersionPayload;

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const versionRows = await getVersionRows(client);
    const rowIndex = versionRows.findIndex((row) => row[0] === versionId);
    if (rowIndex === -1) {
      return NextResponse.json({ ok: false, error: "version not found" }, { status: 404 });
    }
    if (payload.version.versionId !== versionId) {
      return NextResponse.json({ ok: false, error: "versionId mismatch" }, { status: 400 });
    }

    const now = isoNow();
    const optionMeta = deriveOptionMeta(payload.lines ?? []);
    const isMultiOption =
      typeof payload.version.isMultiOption === "boolean" ? payload.version.isMultiOption : optionMeta.isMultiOption;
    if (payload.version.versionStatus === "accepted" && isMultiOption) {
      return NextResponse.json(
        { ok: false, error: "多方案報價不能直接接受，請先建立「確認方案」的新版本（只留客人選的方案）" },
        { status: 409 },
      );
    }
    const record = normalizeVersion(
      {
        ...payload.version,
        isMultiOption,
        optionMinAmount: optionMeta.optionMinAmount,
        updatedAt: now,
      },
      now,
    );

    const sheetRow = rowIndex + 2;
    await client.sheets.spreadsheets.values.update({
      spreadsheetId: client.spreadsheetId,
      range: `報價版本!A${sheetRow}:AW${sheetRow}`,
      valueInputOption: "RAW",
      requestBody: { values: [versionRecordToRow(record)] },
    });

    const lines: VersionLineRecord[] = payload.lines.map((line, index) => ({
      itemId: makeItemId(versionId, index + 1),
      versionId,
      quoteId: record.quoteId,
      caseId: record.caseId,
      lineNo: line.lineNo ?? index + 1,
      itemName: line.itemName ?? "",
      spec: line.spec ?? "",
      materialId: line.materialId ?? "",
      qty: line.qty ?? 0,
      unit: line.unit ?? "式",
      unitPrice: line.unitPrice ?? 0,
      lineAmount: line.lineAmount ?? 0,
      estimatedUnitCost: line.estimatedUnitCost ?? 0,
      estimatedCostAmount: line.estimatedCostAmount ?? 0,
      lineMarginAmount: line.lineMarginAmount ?? 0,
      lineMarginRate: line.lineMarginRate ?? 0,
      isCostItem: line.isCostItem ?? false,
      showOnQuote: line.showOnQuote ?? true,
      notes: line.notes ?? "",
      imageUrl: line.imageUrl ?? "",
      specImageUrl: line.specImageUrl ?? "",
      createdAt: line.createdAt ?? now,
      updatedAt: now,
      installHeightTier: line.installHeightTier ?? "",
      panelSizeTier: line.panelSizeTier ?? "",
      installSurchargeRate: line.installSurchargeRate ?? 0,
      // v0.3.2 fields
      panelInputMode: line.panelInputMode ?? "",
      surfaceWidthCm: line.surfaceWidthCm ?? 0,
      surfaceHeightCm: line.surfaceHeightCm ?? 0,
      splitDirection: line.splitDirection ?? "",
      splitCount: line.splitCount ?? 0,
      caiRoundingMode: line.caiRoundingMode ?? "",
      customSplitSizesCsv: line.customSplitSizesCsv ?? "",
    }));

    await replaceVersionLines(client, versionId, lines);

    await syncAutoCommissionSettlements(client, record);

    // 版本狀態可能在編輯器內變更 → 連動報價/案件/應收帳款，避免狀態脫鉤
    await syncVersionToParents(client, record);

    return NextResponse.json({ ok: true, versionId, lineCount: lines.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

interface VersionPatchPayload {
  versionStatus?: QuoteVersionRecord["versionStatus"];
  signedBack?: boolean;
  signedBackDate?: string;
  signedContractUrls?: string[];
  signedNotes?: string;
  /** 「已追蹤」快速鍵：記錄追蹤時間並重排下一輪 */
  lastFollowUpAt?: string;
  nextFollowUpDate?: string;
  /** 補充說明附圖（agent 端點補圖用；編輯器走 PUT） */
  descriptionImageUrl?: string;
}

/** 報價追蹤預設間隔（天）；版本自帶 followUpDays>0 時以版本為準 */
const DEFAULT_FOLLOW_UP_DAYS = 3;

function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("sv-SE");
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ versionId: string }> },
) {
  const { versionId } = await params;
  const payload = (await request.json()) as VersionPatchPayload;

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const versionRows = await getVersionRows(client);
    const rowIndex = versionRows.findIndex((row) => row[0] === versionId);
    if (rowIndex === -1) {
      return NextResponse.json({ ok: false, error: "version not found" }, { status: 404 });
    }

    const existing = versionRowToRecord(versionRows[rowIndex] ?? []);
    if (payload.versionStatus === "accepted" && existing.isMultiOption) {
      return NextResponse.json(
        { ok: false, error: "多方案報價不能直接接受，請先建立「確認方案」的新版本（只留客人選的方案）" },
        { status: 409 },
      );
    }
    const now = isoNow();
    const updated: QuoteVersionRecord = {
      ...existing,
      versionStatus: payload.versionStatus ?? existing.versionStatus,
      signedBack: payload.signedBack ?? existing.signedBack,
      signedBackDate: payload.signedBackDate ?? existing.signedBackDate,
      signedContractUrls: payload.signedContractUrls ?? existing.signedContractUrls,
      signedNotes: payload.signedNotes ?? existing.signedNotes,
      lastFollowUpAt: payload.lastFollowUpAt ?? existing.lastFollowUpAt,
      nextFollowUpDate: payload.nextFollowUpDate ?? existing.nextFollowUpDate,
      descriptionImageUrl: payload.descriptionImageUrl ?? existing.descriptionImageUrl,
      updatedAt: now,
    };

    // 追蹤排程連動（機制先前只存在於 PUT 的 normalizeVersion，狀態下拉走的
    // PATCH 漏接 → 追蹤欄位從未被寫入、行事曆報價追蹤永遠是空的）：
    const today = now.slice(0, 10);
    if (updated.versionStatus === "sent") {
      if (!updated.sentAt) updated.sentAt = now;
      if (updated.followUpDays <= 0) updated.followUpDays = DEFAULT_FOLLOW_UP_DAYS;
      if (!payload.nextFollowUpDate && !existing.nextFollowUpDate) {
        updated.nextFollowUpDate = addDaysStr(today, updated.followUpDays);
      }
    }
    if (["accepted", "rejected", "superseded"].includes(updated.versionStatus)) {
      updated.nextFollowUpDate = ""; // 已成交/已拒絕：追蹤結束，從行事曆與待追蹤清單消失
    }
    updated.reminderStatus = calculateReminderStatus(updated);

    const sheetRow = rowIndex + 2;
    await client.sheets.spreadsheets.values.update({
      spreadsheetId: client.spreadsheetId,
      range: `報價版本!A${sheetRow}:AW${sheetRow}`,
      valueInputOption: "RAW",
      requestBody: { values: [versionRecordToRow(updated)] },
    });

    // 狀態連動（修正「版本已接受、案件仍報價中」的脫鉤）：
    // 報價列表的狀態下拉、合約回簽都走這個端點，過去漏了連動，
    // 造成版本 accepted 但報價/案件/應收帳款全部沒跟上。
    await syncAutoCommissionSettlements(client, updated);
    await syncVersionToParents(client, updated);

    return NextResponse.json({ ok: true, version: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
