import ExcelJS from "exceljs";

import type { ExportResult, PivotChartPoint, SourceChartPoint, ExportedCard } from "./trello-exporter";

// ── Color palette (same as UI) ────────────────────────────

const PALETTE = [
  "#2563eb", "#16a34a", "#f59e0b", "#dc2626",
  "#7c3aed", "#0891b2", "#db2777", "#65a30d",
  "#ea580c", "#0284c7", "#9333ea", "#d97706",
];

// ── Excel style helpers ───────────────────────────────────

const HDR_BG  = "2D7D45";
const HDR_TXT = "FFFFFF";
const SUB_BG  = "E8F5E9";
const TOT_BG  = "1B5E20";

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

function applySubtotal(cell: ExcelJS.Cell) {
  cell.fill = solidFill(SUB_BG);
  cell.font = { bold: true, size: 10 };
  cell.border = border("1A5E34");
}

function applyData(cell: ExcelJS.Cell) {
  if (!cell.border) cell.border = border();
}

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
  return `${date.getFullYear() - 1911}.${String(date.getMonth() + 1).padStart(2, "0")}`;
}

// ── SVG chart generators ──────────────────────────────────

function svgBar(data: PivotChartPoint[], w = 500, h = 200): string {
  if (data.length === 0) return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="white"/></svg>`;

  const padL = 28, padB = 48, padT = 18, padR = 8;
  const chartW = w - padL - padR;
  const chartH = h - padB - padT;
  const n = data.length;
  const slotW = Math.floor(chartW / n);
  const barW = Math.max(6, slotW - 6);
  const maxVal = Math.max(...data.map((d) => d.count), 1);

  const bars = data.map((d, i) => {
    const barH = Math.round((d.count / maxVal) * chartH);
    const x = padL + i * slotW + Math.floor((slotW - barW) / 2);
    const y = padT + chartH - barH;
    const color = PALETTE[i % PALETTE.length];
    const cx = x + barW / 2;
    const ly = padT + chartH + 12;
    return [
      `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" fill="${color}" rx="2"/>`,
      `<text x="${cx.toFixed(1)}" y="${(y - 3).toFixed(1)}" text-anchor="middle" font-family="Arial" font-size="9" fill="#333">${d.count}</text>`,
      `<text x="${cx.toFixed(1)}" y="${ly}" text-anchor="end" font-family="Arial" font-size="9" fill="#555" transform="rotate(-40 ${cx.toFixed(1)} ${ly})">${d.productCode}</text>`,
    ].join("");
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
<rect width="${w}" height="${h}" fill="white"/>
<line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + chartH}" stroke="#ccc" stroke-width="1"/>
<line x1="${padL}" y1="${padT + chartH}" x2="${w - padR}" y2="${padT + chartH}" stroke="#ccc" stroke-width="1"/>
${bars}
</svg>`;
}

function svgDonut(data: SourceChartPoint[], size = 280): string {
  const total = data.reduce((s, d) => s + d.count, 0);
  if (total === 0 || data.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="white"/><text x="${size / 2}" y="${size / 2}" text-anchor="middle" font-family="Arial" font-size="12" fill="#999">No data</text></svg>`;
  }

  const cx = size / 2;
  const cy = size / 2;
  const R = size * 0.38;
  const r = size * 0.21;
  let angle = -Math.PI / 2;

  const slices = data.map((d, i) => {
    const sweep = (d.count / total) * 2 * Math.PI;
    const end = angle + sweep;
    const large = sweep > Math.PI ? 1 : 0;
    const color = PALETTE[i % PALETTE.length];

    const cos1 = Math.cos(angle), sin1 = Math.sin(angle);
    const cos2 = Math.cos(end),   sin2 = Math.sin(end);

    const x1 = cx + R * cos1, y1 = cy + R * sin1;
    const x2 = cx + R * cos2, y2 = cy + R * sin2;
    const xi1 = cx + r * cos2, yi1 = cy + r * sin2;
    const xi2 = cx + r * cos1, yi2 = cy + r * sin1;

    const path = `M${x1.toFixed(2)},${y1.toFixed(2)} A${R},${R},0,${large},1,${x2.toFixed(2)},${y2.toFixed(2)} L${xi1.toFixed(2)},${yi1.toFixed(2)} A${r},${r},0,${large},0,${xi2.toFixed(2)},${yi2.toFixed(2)} Z`;

    const mid = angle + sweep / 2;
    const labelR = (R + r) / 2;
    const lx = cx + labelR * Math.cos(mid);
    const ly = cy + labelR * Math.sin(mid);
    const pct = Math.round((d.count / total) * 100);
    const label = pct >= 5 ? `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-family="Arial" font-size="9" fill="white" font-weight="bold">${pct}%</text>` : "";

    angle = end;
    return `<path d="${path}" fill="${color}" stroke="white" stroke-width="1.5"/>${label}`;
  }).join("");

  // Legend (right side)
  const legendX = size * 1.05;
  const legendItems = data.slice(0, 12).map((d, i) => {
    const ly = 20 + i * 18;
    const color = PALETTE[i % PALETTE.length];
    const label = d.channel.length > 14 ? d.channel.slice(0, 14) + "…" : d.channel;
    return `<rect x="${legendX}" y="${ly}" width="10" height="10" fill="${color}" rx="2"/><text x="${legendX + 14}" y="${ly + 9}" font-family="Arial" font-size="10" fill="#444">${label} (${d.count})</text>`;
  }).join("");

  const totalW = size + (data.length > 0 ? 160 : 0);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${size}">
<rect width="${totalW}" height="${size}" fill="white"/>
${slices}
${legendItems}
</svg>`;
}

// ── PNG conversion (uses sharp, graceful fallback) ─────────

async function toPng(svg: string): Promise<Buffer | null> {
  try {
    const sharp = (await import("sharp")).default;
    return await sharp(Buffer.from(svg)).png().toBuffer();
  } catch {
    return null;
  }
}

async function embedChart(wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet, svg: string, startRow: number, endRow: number, endCol: number) {
  const png = await toPng(svg);
  if (!png) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const imageId = wb.addImage({ buffer: png as any, extension: "png" });
  ws.addImage(imageId, {
    tl: { col: 0, row: startRow } as unknown as ExcelJS.Anchor,
    br: { col: endCol, row: endRow } as unknown as ExcelJS.Anchor,
    editAs: "oneCell",
  });
}

// ── Sheet 1: 出貨明細 ──────────────────────────────────────

function buildShipping(wb: ExcelJS.Workbook, cards: ExportedCard[], label: string) {
  void wb;
  const ws = wb.addWorksheet("出貨明細");

  // A=# B=單號 C=下單日 D=沙發 E=床組 F=傢俱 G=出貨日 H=組別
  ws.columns = [
    { width: 5  },  // A: #
    { width: 22 },  // B: 單號
    { width: 13 },  // C: 下單日
    { width: 14 },  // D: 沙發
    { width: 14 },  // E: 床組
    { width: 14 },  // F: 傢俱
    { width: 13 },  // G: 出貨日
    { width: 9  },  // H: 組別
  ];

  // Title (A1:H1)
  ws.mergeCells("A1:H1");
  const titleCell = ws.getCell("A1");
  titleCell.value = `${label} 出貨明細`;
  titleCell.fill = solidFill(HDR_BG);
  titleCell.font = { bold: true, size: 13, color: { argb: HDR_TXT } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  titleCell.border = border("1A5E34");
  ws.getRow(1).height = 24;

  // Header
  const hRow = ws.addRow(["#", "單號", "下單日", "沙發", "床組", "傢俱", "出貨日", "組別"]);
  hRow.height = 18;
  hRow.eachCell((cell) => applyHeader(cell));

  // Data
  let sofaSum = 0, beddingSum = 0, furnitureSum = 0;

  cards.forEach((card, idx) => {
    const row = ws.addRow([
      idx + 1,
      card.name,
      card.orderDate ?? null,
      card.sofaAmount     || null,
      card.beddingAmount  || null,
      card.furnitureAmount || null,
      card.due,
      card.productCode,
    ]);

    sofaSum      += card.sofaAmount;
    beddingSum   += card.beddingAmount;
    furnitureSum += card.furnitureAmount;

    // # center
    row.getCell(1).alignment = { horizontal: "center" };
    // Date columns: C(3) 下單日, G(7) 出貨日
    for (const ci of [3, 7]) {
      const cell = row.getCell(ci);
      if (cell.value) { cell.numFmt = "yyyy/mm/dd"; cell.alignment = { horizontal: "center" }; }
    }
    // Money columns: D(4) 沙發, E(5) 床組, F(6) 傢俱
    for (const ci of [4, 5, 6]) {
      const cell = row.getCell(ci);
      if (cell.value !== null && cell.value !== undefined) {
        cell.numFmt = "$#,##0"; cell.alignment = { horizontal: "right" };
      }
    }
    row.getCell(8).alignment = { horizontal: "center" };
    row.eachCell({ includeEmpty: true }, applyData);
  });

  // 小計
  const subRow = ws.addRow([null, "小計", null, sofaSum || null, beddingSum || null, furnitureSum || null, null, null]);
  subRow.height = 18;
  subRow.eachCell({ includeEmpty: true }, (cell, ci) => {
    applySubtotal(cell);
    if (ci === 2) cell.alignment = { horizontal: "right" };
    if (ci >= 4 && ci <= 6 && cell.value !== null && cell.value !== undefined) {
      cell.numFmt = "$#,##0"; cell.alignment = { horizontal: "right" };
    }
  });

  // 總金額
  const grand = sofaSum + beddingSum + furnitureSum;
  const totRow = ws.addRow([null, null, null, null, null, null, null, null]);
  totRow.height = 24;

  ws.mergeCells(`A${totRow.number}:C${totRow.number}`);
  ws.mergeCells(`D${totRow.number}:F${totRow.number}`);

  const lblCell = ws.getCell(`A${totRow.number}`);
  lblCell.value = "總金額";
  lblCell.fill = solidFill(TOT_BG);
  lblCell.font = { bold: true, size: 11, color: { argb: HDR_TXT } };
  lblCell.alignment = { horizontal: "center", vertical: "middle" };
  lblCell.border = border("0D3D13");

  const amtCell = ws.getCell(`D${totRow.number}`);
  amtCell.value = grand;
  amtCell.numFmt = "$#,##0";
  amtCell.fill = solidFill(TOT_BG);
  amtCell.font = { bold: true, size: 13, color: { argb: HDR_TXT } };
  amtCell.alignment = { horizontal: "center", vertical: "middle" };
  amtCell.border = border("0D3D13");

  for (const ci of [7, 8]) {
    const cell = totRow.getCell(ci);
    cell.fill = solidFill(TOT_BG);
    cell.border = border("0D3D13");
  }
}

// ── Sheet 2: 樞紐分析 ─────────────────────────────────────

async function buildPivot(wb: ExcelJS.Workbook, pivotData: PivotChartPoint[], label: string) {
  const ws = wb.addWorksheet("樞紐分析");

  const codes = pivotData.map((d) => d.productCode);
  const totalCols = 1 + codes.length + 1;
  const lastCol = colLetter(totalCols);

  ws.getColumn(1).width = 8;
  for (let i = 0; i < codes.length; i++) ws.getColumn(i + 2).width = 13;
  ws.getColumn(totalCols).width = 14;

  // Title
  ws.mergeCells(`A1:${lastCol}1`);
  const title = ws.getCell("A1");
  title.value = `${label} 出貨明細分析表格`;
  title.fill = solidFill(HDR_BG);
  title.font = { bold: true, size: 12, color: { argb: HDR_TXT } };
  title.alignment = { horizontal: "center", vertical: "middle" };
  title.border = border("1A5E34");
  ws.getRow(1).height = 22;

  // Header
  const hRow = ws.addRow(["", ...codes, "總計"]);
  hRow.height = 18;
  hRow.eachCell((cell) => applyHeader(cell));

  const totals = pivotData.reduce(
    (acc, d) => ({ sofa: acc.sofa + d.sofa, furniture: acc.furniture + d.furniture, bedding: acc.bedding + d.bedding, count: acc.count + d.count }),
    { sofa: 0, furniture: 0, bedding: 0, count: 0 }
  );

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
      if (ci === 1) { applySubtotal(cell); cell.alignment = { horizontal: "center" }; }
      else if (ci === totalCols) {
        cell.font = { bold: true }; cell.fill = solidFill(SUB_BG);
        if (dr.money && cell.value !== null && cell.value !== undefined) { cell.numFmt = "$#,##0"; cell.alignment = { horizontal: "right" }; }
        else cell.alignment = { horizontal: "center" };
      } else if (dr.money && cell.value !== null && cell.value !== undefined) {
        cell.numFmt = "$#,##0"; cell.alignment = { horizontal: "right" };
      } else if (!dr.money) { cell.alignment = { horizontal: "center" }; }
    });
  }

  // Chart image (6 = rows used: title+header+4data, 0-indexed so row index 6 = 7th row)
  const chartStartRow = 6;  // 0-indexed
  const chartEndRow   = chartStartRow + 13;
  const chartEndCol   = Math.min(totalCols, 13);
  ws.getRow(chartStartRow + 1).height = 15; // spacer
  await embedChart(wb, ws, svgBar(pivotData), chartStartRow + 1, chartEndRow, chartEndCol);
}

// ── Sheet 3: 來客分析 ─────────────────────────────────────

async function buildSource(wb: ExcelJS.Workbook, sourceData: SourceChartPoint[], label: string) {
  const ws = wb.addWorksheet("來客分析");

  const channels = sourceData.map((d) => d.channel);
  const totalCols = 1 + channels.length + 1;
  const lastCol = colLetter(Math.max(totalCols, 2));
  const grandTotal = sourceData.reduce((s, d) => s + d.count, 0);

  ws.getColumn(1).width = 8;
  for (let i = 0; i < channels.length; i++) ws.getColumn(i + 2).width = 14;
  ws.getColumn(Math.max(totalCols, 2)).width = 10;

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
    cell.border = border(); cell.alignment = { horizontal: "center" };
    if (ci === 1) applySubtotal(cell);
    if (ci === totalCols) { cell.font = { bold: true }; cell.fill = solidFill(SUB_BG); }
  });

  if (sourceData.length === 0) {
    const noteRow = ws.addRow(["（本月無「分析/」標籤資料）"]);
    ws.mergeCells(`A${noteRow.number}:${lastCol}${noteRow.number}`);
    ws.getCell(`A${noteRow.number}`).font = { italic: true, color: { argb: "FF9E9E9E" }, size: 9 };
    ws.getCell(`A${noteRow.number}`).alignment = { horizontal: "center" };
  }

  // Chart image
  const chartStartRow = 4;   // 0-indexed: after title(0)+header(1)+data(2)+spacer(3)
  const chartEndRow   = chartStartRow + 15;
  const chartEndCol   = Math.min(totalCols + 2, 14);
  await embedChart(wb, ws, svgDonut(sourceData), chartStartRow, chartEndRow, chartEndCol);
}

// ── Main export ───────────────────────────────────────────

export async function generateExcelBuffer(result: ExportResult, sinceDate: Date): Promise<Buffer> {
  const label = rocYearMonth(sinceDate);
  const wb = new ExcelJS.Workbook();
  wb.creator = "馬鈴薯沙發營運系統";
  wb.created = new Date();

  buildShipping(wb, result.cards, label);
  await buildPivot(wb, result.pivotData, label);
  await buildSource(wb, result.sourceData, label);

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
