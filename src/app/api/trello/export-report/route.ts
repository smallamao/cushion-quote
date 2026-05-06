import { NextResponse } from "next/server";

import { getSession } from "@/app/api/sheets/einvoices/_auth";
import { generateCsvFiles } from "@/lib/trello-csv";
import { generateExcelBuffer } from "@/lib/trello-excel";
import { exporterMouthReport } from "@/lib/trello-exporter";

interface ExportRequest {
  since: string;
  until: string;
  labelNames?: string[];
}

export async function POST(request: Request) {
  const session = getSession(request as unknown as Request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: ExportRequest;
  try {
    body = (await request.json()) as ExportRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "請求格式錯誤" }, { status: 400 });
  }

  if (!body.since || !body.until) {
    return NextResponse.json({ ok: false, error: "缺少 since / until 參數" }, { status: 400 });
  }

  try {
    const result = await exporterMouthReport(body.since, body.until, body.labelNames);

    const sinceDate = new Date(body.since.replace(/\//g, "-") + "T00:00:00+08:00");

    const rocYear = sinceDate.getFullYear() - 1911;
    const month = String(sinceDate.getMonth() + 1).padStart(2, "0");

    const [csvFiles, excelBuffer] = await Promise.all([
      Promise.resolve(generateCsvFiles(result, sinceDate)),
      generateExcelBuffer(result, sinceDate),
    ]);

    return NextResponse.json({
      ok: true,
      cardCount: result.cardCount,
      pivotData: result.pivotData,
      sourceData: result.sourceData,
      csvFiles,
      excel: {
        base64: excelBuffer.toString("base64"),
        filename: `出貨報表_${rocYear}${month}.xlsx`,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "匯出失敗";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
