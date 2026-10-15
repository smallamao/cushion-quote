import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/api-auth";

import { getSheetsClient } from "@/lib/sheets-client";
import { deriveOptionMeta } from "@/lib/quote-options";
import type { VersionLineRecord } from "@/lib/types";

import {
  getVersionLineRows,
  getVersionRows,
  isoNow,
  lineRowToRecord,
  makeItemId,
  replaceVersionLines,
  versionRecordToRow,
  versionRowToRecord,
} from "../../../_v2-utils";

interface PutLinesPayload {
  lines: Array<Partial<VersionLineRecord>>;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ versionId: string }> },
) {
  // route 層再驗一次身分。middleware 已經把這條路徑限制在 admin，這裡是第二道鎖：
  // /api/sheets 底下多數端點原本只靠 middleware 那一道門，而 Next.js 近期就有三個
  // middleware bypass 的公告——一道門倒了不該等於全部資料大開（2026-10-15 弱點分析）。
  const guard = requireAdmin(request);
  if (guard.denied) return guard.denied;


  const { versionId } = await params;

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const rows = await getVersionLineRows(client);
    const lines = rows
      .map(lineRowToRecord)
      .filter((line) => line.versionId === versionId);

    return NextResponse.json({ lines });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ versionId: string }> },
) {
  // route 層再驗一次身分。middleware 已經把這條路徑限制在 admin，這裡是第二道鎖：
  // /api/sheets 底下多數端點原本只靠 middleware 那一道門，而 Next.js 近期就有三個
  // middleware bypass 的公告——一道門倒了不該等於全部資料大開（2026-10-15 弱點分析）。
  const guard = requireAdmin(request);
  if (guard.denied) return guard.denied;


  const { versionId } = await params;
  const payload = (await request.json()) as PutLinesPayload;

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const versionRows = await getVersionRows(client);
    const versionIndex = versionRows.findIndex((row) => row[0] === versionId);
    const version = versionIndex >= 0 ? versionRowToRecord(versionRows[versionIndex] ?? []) : undefined;
    if (!version) {
      return NextResponse.json({ ok: false, error: "version not found" }, { status: 404 });
    }

    const now = isoNow();
    const lines: VersionLineRecord[] = (payload.lines ?? []).map((line, index) => ({
      itemId: makeItemId(versionId, index + 1),
      versionId,
      quoteId: version.quoteId,
      caseId: version.caseId,
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
      panelInputMode: line.panelInputMode ?? "",
      surfaceWidthCm: line.surfaceWidthCm ?? 0,
      surfaceHeightCm: line.surfaceHeightCm ?? 0,
      splitDirection: line.splitDirection ?? "",
      splitCount: line.splitCount ?? 0,
      caiRoundingMode: line.caiRoundingMode ?? "",
      customSplitSizesCsv: line.customSplitSizesCsv ?? "",
    }));

    await replaceVersionLines(client, versionId, lines);

    // 明細變了 → 多方案旗標／最低方案金額跟著重算（旗標若編輯器手動設過就尊重，只更新最低方案）
    const optionMeta = deriveOptionMeta(lines);
    const updatedVersion = {
      ...version,
      isMultiOption: typeof version.isMultiOption === "boolean" ? version.isMultiOption : optionMeta.isMultiOption,
      optionMinAmount: optionMeta.optionMinAmount,
      updatedAt: now,
    };
    const sheetRow = versionIndex + 2;
    await client.sheets.spreadsheets.values.update({
      spreadsheetId: client.spreadsheetId,
      range: `報價版本!A${sheetRow}:AW${sheetRow}`,
      valueInputOption: "RAW",
      requestBody: { values: [versionRecordToRow(updatedVersion)] },
    });
    return NextResponse.json({ ok: true, versionId, lineCount: lines.length, ...optionMeta });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
