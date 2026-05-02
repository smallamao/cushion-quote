import "server-only";

import { NextResponse } from "next/server";

import { eInvoiceEventRowToRecord } from "@/lib/einvoice-utils";
import { queryInvoice } from "@/lib/giveme-client";
import { getSheetsClient } from "@/lib/sheets-client";
import { lookupCompanyByTaxId } from "@/lib/tax-id";
import type { EInvoiceItemSnapshot } from "@/lib/types";

import { getSession } from "../../_auth";
import { getEInvoiceEventRows, getEInvoiceRecordById } from "../../_shared";

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmt(n: number): string {
  return n.toLocaleString("zh-TW");
}

const CN_DIGITS = ["零", "壹", "貳", "參", "肆", "伍", "陸", "柒", "捌", "玖"];
const CN_UNITS = ["", "拾", "佰", "仟"];
const CN_BIG = ["", "萬", "億"];

function toChineseAmount(amount: number): string {
  const n = Math.round(amount);
  if (n === 0) return "零元整";
  const groups: number[] = [];
  let rem = n;
  while (rem > 0) { groups.push(rem % 10_000); rem = Math.floor(rem / 10_000); }
  let result = "";
  for (let gi = groups.length - 1; gi >= 0; gi--) {
    const g = groups[gi];
    if (g === 0) { if (result) result += "零"; continue; }
    let part = "";
    let hadZero = false;
    for (let ui = 3; ui >= 0; ui--) {
      const d = Math.floor(g / Math.pow(10, ui)) % 10;
      if (d === 0) { hadZero = true; }
      else { if (hadZero && part) part += "零"; part += CN_DIGITS[d] + CN_UNITS[ui]; hadZero = false; }
    }
    result += part + CN_BIG[gi];
  }
  return result + "元整";
}

function parseItems(
  itemsJson: string,
  requestPayloadJson: string,
  content: string,
  untaxedAmount: number,
): EInvoiceItemSnapshot[] {
  // 1. Full itemsJson
  try {
    const arr = JSON.parse(itemsJson) as unknown;
    if (Array.isArray(arr) && arr.length > 0) return arr as EInvoiceItemSnapshot[];
  } catch { /* fall through */ }

  // 2. requestPayloadJson.items (full objects from giveme request)
  try {
    const p = JSON.parse(requestPayloadJson) as Record<string, unknown>;
    const raw = p.items;
    if (Array.isArray(raw) && raw.length > 0) {
      return (raw as Record<string, unknown>[]).map((it) => ({
        name: typeof it.name === "string" ? it.name : "",
        quantity: Number(it.number ?? it.quantity ?? 1),
        unitPrice: Number(it.money ?? it.unitPrice ?? 0),
        amount: Number(it.money ?? it.amount ?? 0),
        remark: typeof it.remark === "string" ? it.remark : "",
        taxType: 0 as const,
      }));
    }
  } catch { /* fall through */ }

  // 3. requestPayloadJson.itemNames (summary stored after issue)
  try {
    const p = JSON.parse(requestPayloadJson) as Record<string, unknown>;
    const names = p.itemNames;
    if (Array.isArray(names) && names.length > 0) {
      const count = names.length;
      const baseAmt = Math.floor(untaxedAmount / count);
      return (names as string[]).map((name, i) => {
        const amt = i === count - 1 ? untaxedAmount - baseAmt * (count - 1) : baseAmt;
        return { name: String(name), quantity: 1, unitPrice: amt, amount: amt, remark: "", taxType: 0 as const };
      });
    }
  } catch { /* fall through */ }

  // 4. content as single item
  const label = content.trim() || "（未知品項）";
  return [{ name: label, quantity: 1, unitPrice: untaxedAmount, amount: untaxedAmount, remark: "", taxType: 0 as const }];
}

function readPersistedField(requestPayloadJson: string, key: string): string {
  try {
    const payload = JSON.parse(requestPayloadJson) as Record<string, unknown>;
    const value = payload[key];
    return typeof value === "string" ? value.trim() : "";
  } catch {
    return "";
  }
}

function normalizeBuyerAddress(address: string, sourceId: string): string {
  const trimmed = address.trim();
  if (!trimmed) return "";
  if (trimmed === sourceId.trim()) return "";
  if (/^(MANUAL|INV)-/i.test(trimmed)) return "";
  return trimmed;
}

function normalizeBuyerName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";
  if (trimmed === "（記錄已遺失）") return "";
  return trimmed;
}

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function readFirstNonEmptyString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

async function resolveBuyerSnapshot(
  client: NonNullable<Awaited<ReturnType<typeof getSheetsClient>>>,
  invoiceId: string,
): Promise<{ buyerName: string; buyerTaxId: string; buyerAddress: string }> {
  const eventRows = await getEInvoiceEventRows(client);
  const events = eventRows
    .map(eInvoiceEventRowToRecord)
    .filter((event) => event.invoiceId === invoiceId);

  const issueSucceeded = events.find((event) => event.eventType === "issue_succeeded");
  const draftCreated = events.find((event) => event.eventType === "draft_created");

  const issuePayload = parseJsonObject(issueSucceeded?.requestJson ?? "");
  const draftPayload = parseJsonObject(draftCreated?.requestJson ?? "");

  return {
    buyerName: normalizeBuyerName(readFirstNonEmptyString(issuePayload.buyerName, draftPayload.buyerName)),
    buyerTaxId: readFirstNonEmptyString(issuePayload.buyerTaxId, draftPayload.buyerTaxId),
    buyerAddress: readFirstNonEmptyString(issuePayload.buyerAddress, draftPayload.buyerAddress),
  };
}

async function resolveBuyerFromClient(
  client: NonNullable<Awaited<ReturnType<typeof getSheetsClient>>>,
  clientId: string,
): Promise<{ buyerName: string; buyerTaxId: string; buyerAddress: string }> {
  if (!clientId.trim()) {
    return { buyerName: "", buyerTaxId: "", buyerAddress: "" };
  }

  try {
    const response = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: "客戶資料庫!A2:R",
    });
    const rows = (response.data.values ?? []) as string[][];
    const row = rows.find((current) => (current[0] ?? "").trim() === clientId.trim());
    if (!row) {
      return { buyerName: "", buyerTaxId: "", buyerAddress: "" };
    }

    return {
      buyerName: normalizeBuyerName(row[1] ?? ""),
      buyerTaxId: (row[6] ?? "").trim(),
      buyerAddress: (row[5] ?? "").trim(),
    };
  } catch {
    return { buyerName: "", buyerTaxId: "", buyerAddress: "" };
  }
}

const MIN_ITEM_ROWS = 18;
const EMPTY_ITEM_ROW_HEIGHT_PT = 16;

function buildHtml(p: {
  invoiceNo: string;
  invoiceDate: string;
  buyerName: string;
  buyerTaxId: string;
  buyerAddress: string;
  sellerName: string;
  sellerTaxId: string;
  sellerAddress: string;
  untaxedAmount: number;
  taxAmount: number;
  totalAmount: number;
  items: EInvoiceItemSnapshot[];
  autoprint?: boolean;
}): string {
  const dataRows = p.items.map((it, index) => `
    <tr${index === p.items.length - 1 ? ' class="last-item-row"' : ""}>
      <td class="c-name">${esc(it.name)}</td>
      <td class="c-qty">${fmt(it.quantity)}</td>
      <td class="c-price">${fmt(it.unitPrice)}</td>
      <td class="c-amt">${fmt(it.amount)}</td>
      <td class="c-rmk">${esc(it.remark ?? "")}</td>
    </tr>`).join("");

  const padCount = Math.max(0, MIN_ITEM_ROWS - p.items.length);
  const padRows = padCount > 0 ? `
    <tr class="pad-row">
      <td class="c-name empty" style="height:${padCount * EMPTY_ITEM_ROW_HEIGHT_PT}pt"></td>
      <td class="c-qty empty" style="height:${padCount * EMPTY_ITEM_ROW_HEIGHT_PT}pt"></td>
      <td class="c-price empty" style="height:${padCount * EMPTY_ITEM_ROW_HEIGHT_PT}pt"></td>
      <td class="c-amt empty" style="height:${padCount * EMPTY_ITEM_ROW_HEIGHT_PT}pt"></td>
      <td class="c-rmk empty" style="height:${padCount * EMPTY_ITEM_ROW_HEIGHT_PT}pt"></td>
    </tr>` : "";

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>電子發票證明聯 ${esc(p.invoiceNo)}</title>
<style>
@page { size: A4 portrait; margin: 14mm 14mm 12mm 14mm; }
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: "新細明體", "PMingLiU", "MingLiU", "Hiragino Mincho ProN", "Songti TC", "STSong", serif;
  font-size: 10pt;
  font-weight: 400;
  line-height: 1.4;
  color: #000;
  background: #fff;
  padding: 14mm 14mm 12mm;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}
@media print { body { padding: 0; } }
.btn {
  position: fixed; top: 10px; right: 10px; z-index: 9;
  padding: 6px 16px; font-size: 13px; cursor: pointer;
  background: #1a73e8; color: #fff; border: none; border-radius: 4px;
}
@media print { .btn { display: none; } }

.sheet {
  width: 182mm;
  margin: 0 auto;
}

.hdr {
  text-align: center;
  margin-bottom: 12pt;
}

.hdr-co {
  display: flex;
  justify-content: center;
  align-items: center;
}

.hdr-logo {
  display: block;
  width: 170pt;
  max-width: 100%;
  height: auto;
}

.hdr-ttl {
  font-size: 11pt;
  margin-top: 4pt;
}

.hdr-date {
  font-size: 10pt;
  margin-top: 3pt;
}

table.meta-tbl {
  width: 100%;
  border: none;
  margin-bottom: 6pt;
  font-size: 10pt;
  font-family: "新細明體", "PMingLiU", "MingLiU", serif;
}

table.meta-tbl td {
  border: none;
  padding: 1pt 0;
  vertical-align: top;
  font-family: inherit;
}

.m-lbl { width: 66pt; white-space: nowrap; }
.m-val { padding-right: 8pt; }
.m-rlbl { width: 72pt; white-space: nowrap; text-align: right; padding-right: 2pt; }
.m-rval { width: 54pt; white-space: nowrap; text-align: left; }

.meta-page {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 6pt;
}

.pgno {
  font-size: 9.5pt;
  line-height: 1;
}

table.invoice-table {
  border-collapse: collapse;
  table-layout: fixed;
  width: 100%;
  font-size: 10pt;
  font-family: "新細明體", "PMingLiU", "MingLiU", serif;
}

.invoice-table td,
.invoice-table th {
  border: 1px solid #000;
  font-family: inherit;
}

.invoice-table th {
  padding: 3pt 4pt;
  text-align: center;
  font-weight: 700;
}

.c-name,
.c-qty,
.c-price,
.c-amt,
.c-rmk {
  padding: 2pt 4pt;
  vertical-align: top;
}

.c-name,
.c-rmk {
  text-align: left;
}

.c-qty,
.c-price,
.c-amt {
  text-align: right;
}

.last-item-row td {
  border-bottom: none;
}

.pad-row td {
  border-top: none;
}

.empty {
  color: transparent;
}

.f-label-cell,
.f-value-cell,
.f-seller-cell,
.f-tax-cell,
.f-tax-option,
.f-grand-cell,
.f-grand-value,
.f-chinese-label,
.f-chinese-value {
  padding: 2pt 5pt;
  vertical-align: middle;
  line-height: 1.3;
}

.f-label-cell,
.f-value-cell {
  height: 25pt;
}

.f-label-cell,
.f-tax-cell,
.f-grand-cell,
.f-chinese-label {
  text-align: left;
}

.f-value-cell,
.f-grand-value,
.f-tax-amount,
.f-chinese-value {
  text-align: right;
  white-space: nowrap;
}

.f-tax-amount {
  padding: 2pt 5pt;
  vertical-align: middle;
  line-height: 1.3;
}

.f-tax-option {
  text-align: center;
  white-space: nowrap;
}

.f-stamp-cell {
  padding: 2pt 5pt;
  text-align: center;
  font-size: 8.5pt;
  line-height: 1.2;
  vertical-align: top;
}

.f-stamp-cell span {
  font-size: 7.5pt;
  display: block;
}

.f-seller-cell {
  padding: 3pt 5pt;
  vertical-align: middle;
  text-align: left;
  font-size: 9pt;
  line-height: 1.6;
}

.f-seller-cell p {
  margin: 0;
  word-break: break-word;
}

.f-seller-cell p + p {
  margin-top: 1pt;
}

.f-tax-row {
  vertical-align: middle;
}

.tax-grid {
  display: grid;
  grid-template-columns: 25% 14% 11% 14% 11% 14% 11%;
  width: 100%;
  align-items: stretch;
}

.tax-grid > div {
  padding: 2pt 4pt;
  border-right: 1px solid #000;
  display: flex;
  align-items: center;
  white-space: nowrap;
  overflow: hidden;
  font-size: 9.5pt;
  min-height: 16pt;
}

.tax-grid > div:last-child {
  border-right: none;
}

.tg-label {
  letter-spacing: 0.4em;
  padding-left: 5pt;
}

.tg-opt {
  justify-content: center;
}

.tg-box {
  justify-content: center;
  font-weight: bold;
}

.f-line {
  display: flex;
  align-items: center;
  min-height: 18pt;
}

.f-line.amount-right {
  justify-content: space-between;
}

.chk {
  display: inline-block;
  width: 9pt;
  height: 9pt;
  border: 1px solid #000;
  text-align: center;
  line-height: 8pt;
  font-size: 7pt;
  vertical-align: middle;
  margin-left: 2pt;
}

.slbl {
  display: inline-block;
  width: 54pt;
  white-space: nowrap;
}

.f-chinese-label {
  line-height: 1.4;
}

.f-chinese-value {
  letter-spacing: 0.5em;
  text-align: right;
  padding-right: 8pt;
}

.f-chinese-line {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  min-height: 46pt;
  column-gap: 4pt;
}
</style>
</head>
<body>
<button class="btn" onclick="window.print()">列印 / 儲存 PDF</button>

<div class="sheet">
<div class="hdr">
  <div class="hdr-co"><img class="hdr-logo" src="/potato-sofa-logo.jpg" alt="${esc(p.sellerName)}"></div>
  <div class="hdr-ttl">電子發票證明聯</div>
  <div class="hdr-date">${esc(p.invoiceDate)}</div>
</div>

<table class="meta-tbl">
  <tbody>
    <tr>
      <td class="m-lbl">發票號碼：</td>
      <td class="m-val">${esc(p.invoiceNo)}</td>
      <td class="m-rlbl">格&emsp;&emsp;式：</td>
      <td class="m-rval">25</td>
    </tr>
    <tr>
      <td class="m-lbl">買&emsp;&emsp;方：</td>
      <td class="m-val">${esc(p.buyerName)}</td>
      <td class="m-rlbl">隨&emsp;機&emsp;碼：</td>
      <td class="m-rval"></td>
    </tr>
    <tr>
      <td class="m-lbl">統一編號：</td>
      <td class="m-val">${esc(p.buyerTaxId)}</td>
      <td></td><td></td>
    </tr>
    <tr>
      <td class="m-lbl">地&emsp;&emsp;址：</td>
      <td class="m-val" colspan="3">${esc(p.buyerAddress)}</td>
    </tr>
  </tbody>
</table>

<div class="meta-page">
  <div class="pgno">第 1 頁/共 1 頁</div>
</div>

<!-- Items + footer in one table per spec 圖2-1 -->
<table class="invoice-table">
  <colgroup>
    <col style="width:30%">
    <col style="width:10%">
    <col style="width:14%">
    <col style="width:14%">
    <col style="width:32%">
  </colgroup>
  <thead>
    <tr>
      <th>品名</th>
      <th>數量</th>
      <th>單價</th>
      <th>金額</th>
      <th>備註</th>
    </tr>
  </thead>
  <tbody>
    ${dataRows}
    ${padRows}
    <tr>
      <td class="f-label-cell" colspan="3">銷售額合計</td>
      <td class="f-value-cell">${fmt(p.untaxedAmount)}</td>
      <td class="f-stamp-cell">營業人蓋統一發票專用章<br><span>（已係列營業人資料者得免蓋章）</span></td>
    </tr>
    <tr>
      <td class="f-tax-row" colspan="3" style="padding:0;">
        <div class="tax-grid">
          <div class="tg-label">營　業　稅</div>
          <div class="tg-opt">應稅</div>
          <div class="tg-box tg-checked">V</div>
          <div class="tg-opt">零稅率</div>
          <div class="tg-box"></div>
          <div class="tg-opt">免稅</div>
          <div class="tg-box"></div>
        </div>
      </td>
      <td class="f-tax-amount">${fmt(p.taxAmount)}</td>
      <td class="f-seller-cell" rowspan="3">
        <p>賣&emsp;&emsp;方：${esc(p.sellerName)}</p>
        <p>統一編號：${esc(p.sellerTaxId)}</p>
        <p>地&emsp;&emsp;址：${esc(p.sellerAddress)}</p>
      </td>
    </tr>
    <tr>
      <td class="f-grand-cell" colspan="3">總&emsp;&emsp;計</td>
      <td class="f-grand-value">${fmt(p.totalAmount)}</td>
    </tr>
    <tr>
      <td class="f-chinese-label" colspan="4">
        <div class="f-chinese-line">
          <span>總計新臺幣<br>（中文大寫）</span>
          <span class="f-chinese-value">${esc(toChineseAmount(p.totalAmount))}</span>
        </div>
      </td>
    </tr>
  </tbody>
</table>

</div>

${p.autoprint ? `<script>window.addEventListener("load",function(){window.print()});</script>` : ""}
</body>
</html>`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ invoiceId: string }> },
) {
  const { invoiceId } = await params;
  const autoprint = new URL(request.url).searchParams.get("autoprint") === "1";
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const sheetsClient = await getSheetsClient();
  if (!sheetsClient) return NextResponse.json({ error: "Google Sheets 未設定" }, { status: 503 });

  const record = await getEInvoiceRecordById(sheetsClient, invoiceId);
  if (!record) return NextResponse.json({ error: "invoice not found" }, { status: 404 });
  if (record.status !== "issued") return NextResponse.json({ error: "僅已開立發票可列印" }, { status: 400 });

  const sellerName = process.env.GIVEME_SELLER_NAME?.trim() || "馬鈴薯沙發企業社";
  const sellerTaxId = process.env.GIVEME_UNCODE?.trim() || "";
  const sellerAddress = process.env.GIVEME_SELLER_ADDRESS?.trim() || "";

  const items = parseItems(record.itemsJson, record.requestPayloadJson, record.content, record.untaxedAmount);
  const eventBuyer = await resolveBuyerSnapshot(sheetsClient, invoiceId);
  const clientBuyer = await resolveBuyerFromClient(sheetsClient, record.clientId);
  const fallbackBuyerName = normalizeBuyerName(readPersistedField(record.requestPayloadJson, "buyerName"));
  const fallbackBuyerTaxId = readPersistedField(record.requestPayloadJson, "buyerTaxId");
  const fallbackBuyerAddress = readPersistedField(record.requestPayloadJson, "buyerAddress");

  let givemeBuyerName = "";
  let givemeBuyerTaxId = "";
  if (record.providerInvoiceNo) {
    try {
      const remote = await queryInvoice(record.providerInvoiceNo);
      givemeBuyerName = normalizeBuyerName(remote.customerName ?? "");
      givemeBuyerTaxId = (remote.phone ?? "").trim();
    } catch {
      // Network/auth failure — silently fall back to local sources.
    }
  }

  const resolvedBuyerName =
    normalizeBuyerName(record.buyerName) ||
    eventBuyer.buyerName ||
    fallbackBuyerName ||
    clientBuyer.buyerName ||
    givemeBuyerName;
  const resolvedBuyerTaxId =
    record.buyerTaxId ||
    eventBuyer.buyerTaxId ||
    fallbackBuyerTaxId ||
    clientBuyer.buyerTaxId ||
    givemeBuyerTaxId;
  let resolvedBuyerAddress = normalizeBuyerAddress(
    record.buyerAddress || eventBuyer.buyerAddress || fallbackBuyerAddress || clientBuyer.buyerAddress,
    record.sourceId,
  );

  let resolvedBuyerNameFinal = resolvedBuyerName;
  if ((!resolvedBuyerAddress || !resolvedBuyerNameFinal) && resolvedBuyerTaxId) {
    const company = await lookupCompanyByTaxId(resolvedBuyerTaxId);
    if (company) {
      if (!resolvedBuyerAddress) resolvedBuyerAddress = company.address;
      if (!resolvedBuyerNameFinal) resolvedBuyerNameFinal = company.name;
    }
  }

  const itemsWithRemark = items.map((it, i) => {
    if (i === 0 && !it.remark.trim() && resolvedBuyerNameFinal) {
      return { ...it, remark: `總備註: ${resolvedBuyerNameFinal}` };
    }
    return it;
  });

  const html = buildHtml({
    invoiceNo: record.providerInvoiceNo || record.invoiceId,
    invoiceDate: record.invoiceDate,
    buyerName: resolvedBuyerNameFinal,
    buyerTaxId: resolvedBuyerTaxId,
    buyerAddress: resolvedBuyerAddress,
    sellerName,
    sellerTaxId,
    sellerAddress,
    untaxedAmount: record.untaxedAmount,
    taxAmount: record.taxAmount,
    totalAmount: record.totalAmount,
    items: itemsWithRemark,
    autoprint,
  });

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}
