import type { ExportedCard, ExportResult, PivotChartPoint, SourceChartPoint } from "@/lib/trello-exporter";

export interface CsvFile {
  filename: string;
  base64: string;
}

// ── Helpers ───────────────────────────────────────────────

function cell(v: string | number | null | undefined): string {
  const s = String(v ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvRow(...values: (string | number | null | undefined)[]): string {
  return values.map(cell).join(",");
}

function fmtDate(d: Date): string {
  const y = d.getFullYear() - 1911;
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}

// ── Sheet builders ────────────────────────────────────────

function buildShippingCsv(cards: ExportedCard[]): string {
  const header = csvRow("#", "單號", "下單日", "沙發", "床組", "傢俱", "出貨日", "組別");
  const rows = cards.map((c, i) =>
    csvRow(
      i + 1,
      c.orderNumber,
      c.orderDate ? fmtDate(c.orderDate) : "",
      c.sofaAmount || null,
      c.beddingAmount || null,
      c.furnitureAmount || null,
      fmtDate(c.due),
      c.productCode,
    )
  );
  const sofaTotal = cards.reduce((s, c) => s + c.sofaAmount, 0);
  const beddingTotal = cards.reduce((s, c) => s + c.beddingAmount, 0);
  const furnitureTotal = cards.reduce((s, c) => s + c.furnitureAmount, 0);
  const grandTotal = sofaTotal + beddingTotal + furnitureTotal;
  const subtotal = csvRow("", "小計", "", sofaTotal || null, beddingTotal || null, furnitureTotal || null, "", "");
  const totalRow = csvRow("", "總金額", "", grandTotal || null, "", "", "", "");
  return "﻿" + [header, ...rows, subtotal, totalRow].join("\r\n");
}

function buildPivotCsv(data: PivotChartPoint[]): string {
  const codes = data.map((d) => d.productCode);
  const header = csvRow("", ...codes);
  const sofaRow = csvRow("沙發", ...data.map((d) => d.sofa || null));
  const beddingRow = csvRow("床組", ...data.map((d) => d.bedding || null));
  const furnitureRow = csvRow("傢俱", ...data.map((d) => d.furniture || null));
  const countRow = csvRow("組數", ...data.map((d) => d.count));
  return "﻿" + [header, sofaRow, beddingRow, furnitureRow, countRow].join("\r\n");
}

function buildSourceCsv(data: SourceChartPoint[]): string {
  if (data.length === 0) return "﻿組數\r\n（無資料）";
  const channels = data.map((d) => d.channel);
  const header = csvRow("", ...channels);
  const countRow = csvRow("組數", ...data.map((d) => d.count));
  return "﻿" + [header, countRow].join("\r\n");
}

// ── Public API ────────────────────────────────────────────

export function generateCsvFiles(result: ExportResult, sinceDate: Date): CsvFile[] {
  const rocYear = sinceDate.getFullYear() - 1911;
  const month = String(sinceDate.getMonth() + 1).padStart(2, "0");
  const prefix = `${rocYear}${month}`;

  const encode = (s: string) => Buffer.from(s, "utf8").toString("base64");

  return [
    { filename: `出貨明細_${prefix}.csv`, base64: encode(buildShippingCsv(result.cards)) },
    { filename: `樞紐分析_${prefix}.csv`, base64: encode(buildPivotCsv(result.pivotData)) },
    { filename: `來客分析_${prefix}.csv`, base64: encode(buildSourceCsv(result.sourceData)) },
  ];
}
