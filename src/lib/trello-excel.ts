import ExcelJS from "exceljs";

import type { ExportResult, PivotChartPoint, SourceChartPoint, ExportedCard } from "./trello-exporter";

// ── Color palette ─────────────────────────────────────────

const HDR_BG   = "2D7D45";   // dark green header
const HDR_TXT  = "FFFFFF";   // white text
const SUB_BG   = "E8F5E9";   // light green subtotal row
const TOT_BG   = "1B5E20";   // deep green total row

// ── Style helpers ─────────────────────────────────────────

function solidFill(hex: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb: hex } } as ExcelJS.Fill;
}

function border(color = "B0BEC5"): Partial<ExcelJS.Borders> {
  const s: ExcelJS.Border = { style: "thin", color: { argb: color } };
  return { top: s, bottom: s, left: s, right: s };
}

function applyHeader(cell: ExcelJS.Cell) {
  cell.fill = solidFill(HDR_BG);
  cell.font = { bold: true, color: { argb: HDR_TXT }, size: 10 };
  cell.alignment = { horizontal: "center", vertical: "middle" };
  cell.border = border("1A5E34");
}

function applyData(cell: ExcelJS.Cell) {
  if (!cell.border) cell.border = border();
}

function applySubtotal(cell: ExcelJS.Cell) {
  cell.fill = solidFill(SUB_BG);
  cell.font = { bold: true, size: 10 };
  cell.border = border("1A5E34");
}

// Column letter for dynamic column count (handles A-Z, AA-AZ, etc.)
function colLetter(n: number): string {
  let result = "";
  while (n > 0) {
    n--;
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26);
  }
  return result;
}

function rocYearMonth(date: Date): string {
  const roc = date.getFullYear() - 1911;
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${roc}.${m}`;
}

// ── Sheet 1: 出貨明細 ──────────────────────────────────────

function buildShipping(wb: ExcelJS.Workbook, cards: ExportedCard[], label: string) {
  const ws = wb.addWorksheet("出貨明細");

  ws.columns = [
    { width: 22 },  // A: 單號
    { width: 13 },  // B: 下單日
    { width: 14 },  // C: 沙發
    { width: 14 },  // D: 床組
    { width: 14 },  // E: 傢俱
    { width: 13 },  // F: 出貨日
    { width: 9  },  // G: 組別
  ];

  // Title
  ws.mergeCells("A1:G1");
  const title = ws.getCell("A1");
  title.value = `${label} 出貨明細`;
  title.fill = solidFill(HDR_BG);
  title.font = { bold: true, size: 13, color: { argb: HDR_TXT } };
  title.alignment = { horizontal: "center", vertical: "middle" };
  title.border = border("1A5E34");
  ws.getRow(1).height = 24;

  // Header
  const hRow = ws.addRow(["單號", "下單日", "沙發", "床組", "傢俱", "出貨日", "組別"]);
  hRow.height = 18;
  hRow.eachCell((cell) => applyHeader(cell));

  // Data
  let sofaSum = 0, beddingSum = 0, furnitureSum = 0;

  for (const card of cards) {
    const row = ws.addRow([
      card.name,
      card.orderDate ?? null,
      card.sofaAmount    || null,
      card.beddingAmount || null,
      card.furnitureAmount || null,
      card.due,
      card.productCode,
    ]);

    sofaSum      += card.sofaAmount;
    beddingSum   += card.beddingAmount;
    furnitureSum += card.furnitureAmount;

    // Date columns: B(2), F(6)
    for (const ci of [2, 6]) {
      const cell = row.getCell(ci);
      if (cell.value) {
        cell.numFmt = "yyyy/mm/dd";
        cell.alignment = { horizontal: "center" };
      }
    }
    // Money columns: C(3) 沙發, D(4) 床組, E(5) 傢俱
    for (const ci of [3, 4, 5]) {
      const cell = row.getCell(ci);
      if (cell.value !== null && cell.value !== undefined) {
        cell.numFmt = "$#,##0";
        cell.alignment = { horizontal: "right" };
      }
    }
    // 組別 center
    row.getCell(7).alignment = { horizontal: "center" };

    row.eachCell({ includeEmpty: true }, applyData);
  }

  // 小計
  const subRow = ws.addRow([
    "小計", null,
    sofaSum      || null,
    beddingSum   || null,
    furnitureSum || null,
    null, null,
  ]);
  subRow.height = 18;
  subRow.eachCell({ includeEmpty: true }, (cell, ci) => {
    applySubtotal(cell);
    if (ci === 1) cell.alignment = { horizontal: "right" };
    if (ci >= 3 && ci <= 5 && cell.value !== null && cell.value !== undefined) {
      cell.numFmt = "$#,##0";
      cell.alignment = { horizontal: "right" };
    }
  });

  // 總金額
  const grand = sofaSum + beddingSum + furnitureSum;
  const totRow = ws.addRow([null, null, null, null, null, null, null]);
  totRow.height = 24;

  ws.mergeCells(`A${totRow.number}:B${totRow.number}`);
  ws.mergeCells(`C${totRow.number}:E${totRow.number}`);

  const lblCell = ws.getCell(`A${totRow.number}`);
  lblCell.value = "總金額";
  lblCell.fill = solidFill(TOT_BG);
  lblCell.font = { bold: true, size: 11, color: { argb: HDR_TXT } };
  lblCell.alignment = { horizontal: "center", vertical: "middle" };
  lblCell.border = border("0D3D13");

  const amtCell = ws.getCell(`C${totRow.number}`);
  amtCell.value = grand;
  amtCell.numFmt = "$#,##0";
  amtCell.fill = solidFill(TOT_BG);
  amtCell.font = { bold: true, size: 13, color: { argb: HDR_TXT } };
  amtCell.alignment = { horizontal: "center", vertical: "middle" };
  amtCell.border = border("0D3D13");

  // Fill remaining cells in total row
  for (const ci of [6, 7]) {
    const cell = totRow.getCell(ci);
    cell.fill = solidFill(TOT_BG);
    cell.border = border("0D3D13");
  }
}

// ── Sheet 2: 出貨樞紐分析 ─────────────────────────────────

function buildPivot(wb: ExcelJS.Workbook, pivotData: PivotChartPoint[], label: string) {
  const ws = wb.addWorksheet("樞紐分析");

  const codes = pivotData.map((d) => d.productCode);
  const totalCols = 1 + codes.length + 1; // label col + products + 總計

  // Column widths
  ws.getColumn(1).width = 8;
  for (let i = 0; i < codes.length; i++) ws.getColumn(i + 2).width = 13;
  ws.getColumn(totalCols).width = 14;

  const lastCol = colLetter(totalCols);

  // Title
  ws.mergeCells(`A1:${lastCol}1`);
  const title = ws.getCell("A1");
  title.value = `${label} 出貨明細分析表格`;
  title.fill = solidFill(HDR_BG);
  title.font = { bold: true, size: 12, color: { argb: HDR_TXT } };
  title.alignment = { horizontal: "center", vertical: "middle" };
  title.border = border("1A5E34");
  ws.getRow(1).height = 22;

  // Header: blank | codes... | 總計
  const hRow = ws.addRow(["", ...codes, "總計"]);
  hRow.height = 18;
  hRow.eachCell((cell) => applyHeader(cell));

  // Aggregate
  const totals = { sofa: 0, furniture: 0, bedding: 0, count: 0 };
  for (const d of pivotData) {
    totals.sofa      += d.sofa;
    totals.furniture += d.furniture;
    totals.bedding   += d.bedding;
    totals.count     += d.count;
  }

  const dataRows: Array<{ label: string; values: (number | null)[]; total: number; money: boolean }> = [
    { label: "沙發", values: pivotData.map((d) => d.sofa      || null), total: totals.sofa,      money: true  },
    { label: "傢俱", values: pivotData.map((d) => d.furniture || null), total: totals.furniture, money: true  },
    { label: "床組", values: pivotData.map((d) => d.bedding   || null), total: totals.bedding,   money: true  },
    { label: "組數", values: pivotData.map((d) => d.count),             total: totals.count,     money: false },
  ];

  for (const dr of dataRows) {
    const row = ws.addRow([dr.label, ...dr.values, dr.total]);
    row.height = 17;
    row.eachCell({ includeEmpty: true }, (cell, ci) => {
      cell.border = border();
      if (ci === 1) {
        // Row label
        applySubtotal(cell);
        cell.alignment = { horizontal: "center" };
      } else if (ci === totalCols) {
        // 總計 column
        cell.font = { bold: true };
        cell.fill = solidFill(SUB_BG);
        if (dr.money && cell.value !== null && cell.value !== undefined) {
          cell.numFmt = "$#,##0";
          cell.alignment = { horizontal: "right" };
        } else {
          cell.alignment = { horizontal: "center" };
        }
      } else if (dr.money && cell.value !== null && cell.value !== undefined) {
        cell.numFmt = "$#,##0";
        cell.alignment = { horizontal: "right" };
      } else if (!dr.money) {
        cell.alignment = { horizontal: "center" };
      }
    });
  }
}

// ── Sheet 3: 來客分析 ─────────────────────────────────────

function buildSource(wb: ExcelJS.Workbook, sourceData: SourceChartPoint[], label: string) {
  const ws = wb.addWorksheet("來客分析");

  const channels = sourceData.map((d) => d.channel);
  const totalCols = 1 + channels.length + 1;
  const lastCol = colLetter(totalCols);
  const grandTotal = sourceData.reduce((s, d) => s + d.count, 0);

  // Column widths
  ws.getColumn(1).width = 8;
  for (let i = 0; i < channels.length; i++) ws.getColumn(i + 2).width = 14;
  ws.getColumn(totalCols).width = 10;

  // Title
  ws.mergeCells(`A1:${lastCol}1`);
  const title = ws.getCell("A1");
  title.value = `${label} 來客分析表格`;
  title.fill = solidFill(HDR_BG);
  title.font = { bold: true, size: 12, color: { argb: HDR_TXT } };
  title.alignment = { horizontal: "center", vertical: "middle" };
  title.border = border("1A5E34");
  ws.getRow(1).height = 22;

  // Header
  const hRow = ws.addRow(["", ...channels, "總計"]);
  hRow.height = 18;
  hRow.eachCell((cell) => applyHeader(cell));

  // 組數 row
  const cntRow = ws.addRow(["組數", ...sourceData.map((d) => d.count), grandTotal]);
  cntRow.height = 17;
  cntRow.eachCell({ includeEmpty: true }, (cell, ci) => {
    cell.border = border();
    cell.alignment = { horizontal: "center" };
    if (ci === 1) applySubtotal(cell);
    if (ci === totalCols) {
      cell.font = { bold: true };
      cell.fill = solidFill(SUB_BG);
    }
  });

  if (sourceData.length === 0) {
    const noteRow = ws.addRow(["（本月無「分析/」標籤資料）"]);
    ws.mergeCells(`A${noteRow.number}:${lastCol}${noteRow.number}`);
    const cell = ws.getCell(`A${noteRow.number}`);
    cell.font = { italic: true, color: { argb: "FF9E9E9E" }, size: 9 };
    cell.alignment = { horizontal: "center" };
  }
}

// ── Main export ───────────────────────────────────────────

export async function generateExcelBuffer(result: ExportResult, sinceDate: Date): Promise<Buffer> {
  const label = rocYearMonth(sinceDate);

  const wb = new ExcelJS.Workbook();
  wb.creator = "馬鈴薯沙發營運系統";
  wb.created = new Date();

  buildShipping(wb, result.cards, label);
  buildPivot(wb, result.pivotData, label);
  buildSource(wb, result.sourceData, label);

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
