import { getSheetsClient } from "@/lib/sheets-client";
import { withSheetsRetry, type SheetsRetryOptions } from "@/lib/sheets-retry";
import type {
  ARRecord,
  CaseRecord,
  EInvoiceCandidate,
  EInvoiceEventRecord,
  EInvoiceRecord,
  PendingMonthlyRecord,
  QuoteVersionRecord,
  VersionLineRecord,
} from "@/lib/types";
import type { Company, Contact } from "@/lib/types/company";
import {
  EINVOICE_EVENT_RANGE_DATA,
  EINVOICE_EVENT_RANGE_FULL,
  EINVOICE_RANGE_DATA,
  EINVOICE_RANGE_FULL,
  EINVOICE_ROW_RANGE,
  EINVOICE_SHEET,
  buildEInvoiceItemsFromVersionLines,
  eInvoiceEventRecordToRow,
  eInvoiceRecordToRow,
  eInvoiceRowToRecord,
  generateEInvoiceEventId,
  generateEInvoiceId,
  isInvoiceExemptTaxRate,
  isoDateNow,
  isoNow,
} from "@/lib/einvoice-utils";
import { AR_RANGE_DATA, PENDING_MONTHLY_RANGE_DATA, arRowToRecord, pendingMonthlyRowToRecord } from "@/lib/ar-utils";
import { caseRowToRecord, getCaseRows, getVersionLineRows, getVersionRows, lineRowToRecord, versionRowToRecord } from "@/app/api/sheets/_v2-utils";

type SheetsClient = NonNullable<Awaited<ReturnType<typeof getSheetsClient>>>;

function toCompany(row: string[]): Company {
  return {
    id: row[0] ?? "",
    companyName: row[1] ?? "",
    shortName: row[2] ?? "",
    clientType: (row[3] as Company["clientType"]) ?? "other",
    channel: (row[4] as Company["channel"]) ?? "wholesale",
    address: row[5] ?? "",
    taxId: row[6] ?? "",
    commissionMode: (row[7] as Company["commissionMode"]) ?? "default",
    commissionRate: Number(row[8] ?? 0),
    paymentTerms: row[9] ?? "",
    defaultNotes: row[10] ?? "",
    isActive: row[11] !== "FALSE",
    createdAt: row[12] ?? "",
    updatedAt: row[13] ?? "",
    notes: row[14] ?? "",
    commissionFixedAmount: Number(row[15] ?? 0),
    leadSource: (row[16] as Company["leadSource"]) ?? "unknown",
    billingType: row[17] === "monthly" ? "monthly" : "per_quote",
  };
}

function toContact(row: string[]): Contact {
  return {
    id: row[0] ?? "",
    companyId: row[1] ?? "",
    name: row[2] ?? "",
    role: row[3] ?? "",
    phone: row[4] ?? "",
    phone2: row[5] ?? "",
    lineId: row[6] ?? "",
    email: row[7] ?? "",
    businessCardUrl: row[8] ?? "",
    isPrimary: row[9] === "TRUE",
    createdAt: row[10] ?? "",
    updatedAt: row[11] ?? "",
  };
}

/**
 * 讀取失敗一律拋出，不可吞成 []：呼叫端會拿它做防重複檢查、產生編號、找刪除列，
 * 空陣列會讓這些全部誤判（曾造成編號從 -001 重來、覆寫第 2 列的風險）。
 */
export async function getEInvoiceRows(client: SheetsClient, retry: SheetsRetryOptions = {}): Promise<string[][]> {
  const response = await withSheetsRetry(() => client.sheets.spreadsheets.values.get({
    spreadsheetId: client.spreadsheetId,
    range: EINVOICE_RANGE_DATA,
  }), retry);
  return (response.data.values ?? []) as string[][];
}

export async function appendEInvoiceEvent(
  client: SheetsClient,
  input: Omit<EInvoiceEventRecord, "eventId" | "occurredAt"> & { occurredAt?: string },
  retry: SheetsRetryOptions = {},
): Promise<void> {
  const record: EInvoiceEventRecord = {
    ...input,
    eventId: generateEInvoiceEventId(input.invoiceId),
    occurredAt: input.occurredAt ?? isoNow(),
  };
  await withSheetsRetry(() => client.sheets.spreadsheets.values.append({
    spreadsheetId: client.spreadsheetId,
    range: EINVOICE_EVENT_RANGE_FULL,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [eInvoiceEventRecordToRow(record)] },
  }), retry);
}

export async function getEInvoiceRecords(client: SheetsClient): Promise<EInvoiceRecord[]> {
  const rows = await getEInvoiceRows(client);
  return rows.map(eInvoiceRowToRecord).filter((record) => record.invoiceId);
}

export async function getEInvoiceRecordById(
  client: SheetsClient,
  invoiceId: string,
  retry: SheetsRetryOptions = {},
): Promise<EInvoiceRecord | null> {
  const rows = await getEInvoiceRows(client, retry);
  const row = rows.find((current) => (current[0] ?? "") === invoiceId);
  return row ? eInvoiceRowToRecord(row) : null;
}

export async function generateNextEInvoiceId(client: SheetsClient): Promise<string> {
  const rows = await getEInvoiceRows(client);
  return generateEInvoiceId(rows);
}

// 新紀錄一律用 append + INSERT_ROWS 插入新列：不先讀再算列號，
// 讀取失敗或兩個請求同時建立時都不會覆寫既有列。
export async function appendEInvoiceRecord(client: SheetsClient, record: EInvoiceRecord): Promise<void> {
  await batchAppendEInvoiceRecords(client, [record]);
}

export async function batchAppendEInvoiceRecords(client: SheetsClient, records: EInvoiceRecord[]): Promise<void> {
  if (records.length === 0) return;
  const response = await withSheetsRetry(() => client.sheets.spreadsheets.values.append({
    spreadsheetId: client.spreadsheetId,
    range: EINVOICE_RANGE_FULL,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: records.map(eInvoiceRecordToRow) },
  }));
  // 表中有空白列時 append 可能插在中段；記下實際落點方便追查
  console.info("[einvoice] append", records.map((r) => r.invoiceId).join(","), response?.data?.updates?.updatedRange ?? "");
}

/** 依列號寫入或刪除前發現該列已不是預期的發票（被插入／刪除的列擠動） */
export class EInvoiceRowMovedError extends Error {
  constructor(invoiceId: string) {
    super(`發票 ${invoiceId} 的資料列位置已變動，請重新整理後再試`);
    this.name = "EInvoiceRowMovedError";
  }
}

const SINGLE_CELL_A = (sheetRow: number) => `${EINVOICE_SHEET}!A${sheetRow}:A${sheetRow}`;

async function getEInvoiceSheetId(client: SheetsClient): Promise<number> {
  const meta = await withSheetsRetry(() => client.sheets.spreadsheets.get({
    spreadsheetId: client.spreadsheetId,
    fields: "sheets.properties",
  }));
  const sheetId = meta.data.sheets?.find((sheet) => sheet.properties?.title === EINVOICE_SHEET)?.properties?.sheetId;
  if (sheetId === undefined || sheetId === null) throw new Error(`找不到工作表 ${EINVOICE_SHEET}`);
  return sheetId;
}

/**
 * 依列號整列刪除（deleteDimension，由下往上）。刪除前一次讀回所有目標列的 A 欄，
 * 任何一列不是預期的發票編號就整批中止，一列都不刪。
 */
export async function deleteEInvoiceRows(
  client: SheetsClient,
  targets: Array<{ sheetRow: number; invoiceId: string }>,
): Promise<void> {
  if (targets.length === 0) return;
  const sheetId = await getEInvoiceSheetId(client);
  const check = await withSheetsRetry(() => client.sheets.spreadsheets.values.batchGet({
    spreadsheetId: client.spreadsheetId,
    ranges: targets.map((target) => SINGLE_CELL_A(target.sheetRow)),
  }));
  const valueRanges = check.data.valueRanges ?? [];
  targets.forEach((target, i) => {
    const actual = String(valueRanges[i]?.values?.[0]?.[0] ?? "");
    if (actual !== target.invoiceId) throw new EInvoiceRowMovedError(target.invoiceId);
  });
  const requests = [...targets]
    .sort((a, b) => b.sheetRow - a.sheetRow)
    .map((target) => ({
      deleteDimension: {
        range: { sheetId, dimension: "ROWS", startIndex: target.sheetRow - 1, endIndex: target.sheetRow },
      },
    }));
  await withSheetsRetry(() => client.sheets.spreadsheets.batchUpdate({
    spreadsheetId: client.spreadsheetId,
    requestBody: { requests },
  }));
}

export async function getEInvoiceEventRows(client: SheetsClient): Promise<string[][]> {
  try {
    const response = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: EINVOICE_EVENT_RANGE_DATA,
    });
    return (response.data.values ?? []) as string[][];
  } catch {
    return [];
  }
}

const ROW_PROPAGATION_WAIT_MS = 3000;
const MAX_LOCATE_ATTEMPTS = 3;

/**
 * 讀→定位→寫整段一起重試：重試時重新讀取並重新找列，不沿用十幾秒前的列號。
 * 寫入前再單獨讀回目標列確認 A 欄仍是這張發票（append 可能插在中段把列擠動），
 * 不符就重新定位；updater 以這次讀回的最新內容為準。
 * updater 拋錯（例如狀態不允許轉換）時不寫入，錯誤直接往外拋。
 */
export async function updateEInvoiceRecord(
  client: SheetsClient,
  invoiceId: string,
  updater: (record: EInvoiceRecord) => EInvoiceRecord,
  retry: SheetsRetryOptions = {},
): Promise<EInvoiceRecord | null> {
  async function tryOnce(): Promise<EInvoiceRecord | null> {
    for (let attempt = 0; attempt < MAX_LOCATE_ATTEMPTS; attempt++) {
      const response = await client.sheets.spreadsheets.values.get({
        spreadsheetId: client.spreadsheetId,
        range: EINVOICE_RANGE_DATA,
      });
      const rows = (response.data.values ?? []) as string[][];
      const rowIndex = rows.findIndex((row) => (row[0] ?? "") === invoiceId);
      if (rowIndex === -1) return null;
      const sheetRow = rowIndex + 2;
      const fresh = await client.sheets.spreadsheets.values.get({
        spreadsheetId: client.spreadsheetId,
        range: EINVOICE_ROW_RANGE(sheetRow),
      });
      const freshRow = ((fresh.data.values ?? []) as string[][])[0] ?? [];
      if ((freshRow[0] ?? "") !== invoiceId) continue;
      const next = updater(eInvoiceRowToRecord(freshRow));
      await client.sheets.spreadsheets.values.update({
        spreadsheetId: client.spreadsheetId,
        range: EINVOICE_ROW_RANGE(sheetRow),
        valueInputOption: "RAW",
        requestBody: { values: [eInvoiceRecordToRow(next)] },
      });
      return next;
    }
    throw new EInvoiceRowMovedError(invoiceId);
  }

  const first = await withSheetsRetry(tryOnce, retry);
  if (first) return first;
  // Row may not have propagated yet (append → GET delay) — wait and retry once, if the deadline allows
  if (retry.deadline !== undefined && Date.now() + ROW_PROPAGATION_WAIT_MS > retry.deadline) return null;
  await new Promise((resolve) => setTimeout(resolve, ROW_PROPAGATION_WAIT_MS));
  return withSheetsRetry(tryOnce, retry);
}

async function getCompanyLookup(client: SheetsClient): Promise<{ companyMap: Map<string, Company>; primaryContactMap: Map<string, Contact> }> {
  const [companyRes, contactRes] = await Promise.all([
    client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: "客戶資料庫!A2:R",
    }),
    client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: "聯絡人!A2:L",
    }),
  ]);
  const companyMap = new Map(
    ((companyRes.data.values ?? []) as string[][])
      .map(toCompany)
      .filter((company) => company.id)
      .map((company) => [company.id, company] as const),
  );
  const primaryContactMap = new Map(
    ((contactRes.data.values ?? []) as string[][])
      .map(toContact)
      .filter((contact) => contact.companyId && contact.isPrimary)
      .map((contact) => [contact.companyId, contact] as const),
  );
  return { companyMap, primaryContactMap };
}

async function getVersionCluster(client: SheetsClient): Promise<{
  versionMap: Map<string, QuoteVersionRecord>;
  /** 稅率欄原始值：versionRowToRecord 會把空白轉成 0，判斷免開票要看原始儲存格 */
  rawTaxRateByVersionId: Map<string, string>;
  linesByVersionId: Map<string, VersionLineRecord[]>;
  caseMap: Map<string, CaseRecord>;
}> {
  const [versionRows, lineRows, caseRows] = await Promise.all([
    getVersionRows(client),
    getVersionLineRows(client),
    getCaseRows(client),
  ]);

  const versionMap = new Map(
    versionRows.map(versionRowToRecord).filter((version) => version.versionId).map((version) => [version.versionId, version] as const),
  );
  const rawTaxRateByVersionId = new Map(
    versionRows.filter((row) => row[0]).map((row) => [row[0] ?? "", row[16] ?? ""] as const),
  );
  const linesByVersionId = new Map<string, VersionLineRecord[]>();
  for (const line of lineRows.map(lineRowToRecord).filter((row) => row.versionId)) {
    const current = linesByVersionId.get(line.versionId) ?? [];
    current.push(line);
    linesByVersionId.set(line.versionId, current);
  }
  const caseMap = new Map(
    caseRows.map(caseRowToRecord).filter((row) => row.caseId).map((row) => [row.caseId, row] as const),
  );
  return { versionMap, rawTaxRateByVersionId, linesByVersionId, caseMap };
}

function buildCandidate(params: {
  sourceType: EInvoiceCandidate["sourceType"];
  sourceId: string;
  sourceSubId?: string;
  version: QuoteVersionRecord;
  caseRecord: CaseRecord | undefined;
  company: Company | undefined;
  primaryContact: Contact | undefined;
  lineItems: VersionLineRecord[];
  amount: number;
  invoiceDate: string;
  existingInvoice: EInvoiceRecord | undefined;
}): EInvoiceCandidate {
  // 會走到 `|| 5` 的有兩種：稅率欄空白（清單保留，視為一般應稅），以及明確填 0 的現金價版本
  // ——後者只會從「直接指定 versionId」進來（清單已排除），使用者明確要開票，應稅發票必有稅額。
  // 兩者都沿用原本的 5% 從總額拆出稅額。
  const rawRate = params.version.taxRate > 0 && params.version.taxRate <= 1
    ? params.version.taxRate * 100
    : params.version.taxRate || 5;
  const rate = rawRate / 100;
  const totalAmount = Math.round(params.amount);
  const untaxedAmount = rate > 0 ? Math.round(totalAmount / (1 + rate)) : totalAmount;
  const taxAmount = totalAmount - untaxedAmount;
  return {
    candidateId: `${params.sourceType}:${params.sourceId}`,
    sourceType: params.sourceType,
    sourceId: params.sourceId,
    sourceSubId: params.sourceSubId ?? "",
    quoteId: params.version.quoteId,
    versionId: params.version.versionId,
    caseId: params.version.caseId,
    clientId: params.caseRecord?.clientId ?? "",
    clientName: params.company?.companyName ?? params.version.clientNameSnapshot,
    contactName: params.primaryContact?.name ?? params.version.contactNameSnapshot,
    clientPhone: params.primaryContact?.phone ?? params.version.clientPhoneSnapshot,
    clientEmail: params.primaryContact?.email ?? "",
    clientTaxId: params.company?.taxId ?? "",
    clientAddress: params.company?.address ?? "",
    projectName: params.version.projectNameSnapshot,
    amount: totalAmount,
    untaxedAmount,
    taxAmount,
    totalAmount,
    taxRate: rawRate,
    invoiceDate: params.invoiceDate,
    lineItems: buildEInvoiceItemsFromVersionLines(params.lineItems),
    existingInvoiceId: params.existingInvoice?.invoiceId ?? "",
    existingInvoiceStatus: params.existingInvoice?.status ?? "",
  };
}

export async function buildEInvoiceCandidates(client: SheetsClient, options: { versionId?: string } = {}): Promise<EInvoiceCandidate[]> {
  const [invoiceRecords, { companyMap, primaryContactMap }, { versionMap, rawTaxRateByVersionId, linesByVersionId, caseMap }] = await Promise.all([
    getEInvoiceRecords(client),
    getCompanyLookup(client),
    getVersionCluster(client),
  ]);

  const existingIssuedMap = new Map(
    invoiceRecords
      .filter((record) => record.status === "issued" || record.status === "cancelled")
      .map((record) => [`${record.sourceType}:${record.sourceId}`, record] as const),
  );

  let optOutVersionIds: Set<string> = new Set();
  try {
    const optOutRes = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: "電子發票不開清單!A:A",
    });
    optOutVersionIds = new Set(
      ((optOutRes.data.values ?? []) as string[][]).map((r) => r[0]).filter(Boolean),
    );
  } catch {
    // Sheet may not exist yet - that's fine
  }

  if (options.versionId) {
    const version = versionMap.get(options.versionId);
    if (!version) return [];
    // Do NOT apply opt-out when navigating directly to a version — the user explicitly came here
    const caseRecord = caseMap.get(version.caseId);
    const company = caseRecord ? companyMap.get(caseRecord.clientId) : undefined;
    const contact = caseRecord ? primaryContactMap.get(caseRecord.clientId) : undefined;
    return [
      buildCandidate({
        sourceType: "quote_version",
        sourceId: version.versionId,
        version,
        caseRecord,
        company,
        primaryContact: contact,
        lineItems: linesByVersionId.get(version.versionId) ?? [],
        amount: version.totalAmount,
        invoiceDate: isoDateNow(),
        existingInvoice: existingIssuedMap.get(`quote_version:${version.versionId}`),
      }),
    ];
  }

  const [arRes, pendingRows] = await Promise.all([
    client.sheets.spreadsheets.values.get({ spreadsheetId: client.spreadsheetId, range: AR_RANGE_DATA }),
    client.sheets.spreadsheets.values
      .get({ spreadsheetId: client.spreadsheetId, range: PENDING_MONTHLY_RANGE_DATA })
      .then((response) => (response.data.values ?? []) as string[][])
      .catch(() => [] as string[][]),
  ]);

  const ars = ((arRes.data.values ?? []) as string[][])
    .map(arRowToRecord)
    .filter((record: ARRecord) => record.arId && record.arStatus !== "cancelled");
  const pending = pendingRows
    .map(pendingMonthlyRowToRecord)
    .filter((record: PendingMonthlyRecord) => record.pendingId && record.status === "pending");

  const candidates: EInvoiceCandidate[] = [];

  for (const ar of ars) {
    const version = versionMap.get(ar.versionId);
    if (!version) continue;
    if (isInvoiceExemptTaxRate(rawTaxRateByVersionId.get(version.versionId))) continue;
    if (optOutVersionIds.has(ar.versionId)) continue;
    const caseRecord = caseMap.get(ar.caseId);
    const company = companyMap.get(ar.clientId);
    const contact = primaryContactMap.get(ar.clientId);
    candidates.push(
      buildCandidate({
        sourceType: "ar",
        sourceId: ar.arId,
        version,
        caseRecord,
        company,
        primaryContact: contact,
        lineItems: linesByVersionId.get(version.versionId) ?? [],
        amount: ar.totalAmount,
        invoiceDate: isoDateNow(),
        // Fallback: invoice may have been issued via quote_version source instead of ar source
        existingInvoice:
          existingIssuedMap.get(`ar:${ar.arId}`) ??
          existingIssuedMap.get(`quote_version:${ar.versionId}`),
      }),
    );
  }

  for (const record of pending) {
    const version = versionMap.get(record.versionId);
    if (!version) continue;
    if (isInvoiceExemptTaxRate(rawTaxRateByVersionId.get(version.versionId))) continue;
    const caseRecord = caseMap.get(record.caseId);
    const company = companyMap.get(record.clientId);
    const contact = primaryContactMap.get(record.clientId);
    candidates.push(
      buildCandidate({
        sourceType: "pending_monthly",
        sourceId: record.pendingId,
        version,
        caseRecord,
        company,
        primaryContact: contact,
        lineItems: linesByVersionId.get(version.versionId) ?? [],
        amount: record.amount,
        invoiceDate: isoDateNow(),
        existingInvoice:
          existingIssuedMap.get(`pending_monthly:${record.pendingId}`) ??
          existingIssuedMap.get(`quote_version:${record.versionId}`),
      }),
    );
  }

  return candidates.sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate) || a.candidateId.localeCompare(b.candidateId));
}
