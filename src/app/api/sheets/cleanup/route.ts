import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME, verifySession } from "@/lib/auth";
import { getSheetsClient } from "@/lib/sheets-client";

function getSession(request: Request) {
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .find((c) => c.trim().startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.split("=")[1];
  return verifySession(token);
}

/**
 * DELETE /api/sheets/cleanup?caseId=CA-202604-010&keep=Q01&dryRun=true
 *
 * 刪除指定案件下除了 keep 之外的所有報價、版本、明細、佣金結算。
 * dryRun=true 時只列出會被刪除的 row，不實際刪除。
 */
export async function DELETE(request: Request) {
  const session = getSession(request);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const caseId = url.searchParams.get("caseId") ?? "";
  const keep = url.searchParams.get("keep") ?? "";
  const dryRun = url.searchParams.get("dryRun") === "true";

  if (!caseId || !keep) {
    return NextResponse.json(
      { ok: false, error: "需要 caseId 和 keep 參數，例: ?caseId=CA-202604-010&keep=Q01" },
      { status: 400 },
    );
  }

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Sheets 未設定" }, { status: 503 });
  }

  const keepQuoteId = `${caseId}-${keep}`;
  const prefix = `${caseId}-Q`;

  const sheets = [
    { name: "報價", range: "報價!A2:P", idCol: 0 },
    { name: "報價版本", range: "報價版本!A2:AU", idCol: 0 },
    { name: "報價版本明細", range: "報價版本明細!A2:AG", idCol: 0 },
    { name: "佣金結算", range: "佣金結算!A2:M", idCol: 0 },
  ];

  const result: Array<{ sheet: string; deleted: number; rows: string[] }> = [];

  for (const s of sheets) {
    let rows: string[][];
    try {
      const res = await client.sheets.spreadsheets.values.get({
        spreadsheetId: client.spreadsheetId,
        range: s.range,
      });
      rows = (res.data.values ?? []) as string[][];
    } catch {
      result.push({ sheet: s.name, deleted: 0, rows: ["sheet not found or empty"] });
      continue;
    }

    // 找出要刪除的 row index（從下往上刪，避免 index 偏移）
    const toDelete: number[] = [];
    const deletedIds: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const id = rows[i]?.[s.idCol] ?? "";
      // 匹配同案件的報價，但排除要保留的
      const isTargetQuote = id.startsWith(prefix) && !id.startsWith(keepQuoteId);
      if (isTargetQuote) {
        toDelete.push(i + 2); // sheet row number (1-indexed, +1 for header)
        deletedIds.push(id);
      }
    }

    if (!dryRun && toDelete.length > 0) {
      // 取得 sheetId (gid)
      const meta = await client.sheets.spreadsheets.get({
        spreadsheetId: client.spreadsheetId,
        fields: "sheets.properties",
      });
      const sheetMeta = meta.data.sheets?.find(
        (sh) => sh.properties?.title === s.name,
      );
      const sheetId = sheetMeta?.properties?.sheetId;

      if (sheetId !== undefined) {
        // 從下往上刪，避免 row index 偏移
        const sortedDesc = [...toDelete].sort((a, b) => b - a);
        const requests = sortedDesc.map((rowNum) => ({
          deleteDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: rowNum - 1, // 0-indexed
              endIndex: rowNum,
            },
          },
        }));

        await client.sheets.spreadsheets.batchUpdate({
          spreadsheetId: client.spreadsheetId,
          requestBody: { requests },
        });
      }
    }

    result.push({ sheet: s.name, deleted: toDelete.length, rows: deletedIds });
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    keep: keepQuoteId,
    result,
  });
}
