import { getSheetsClient } from "@/lib/sheets-client";
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
  EINVOICE_EVENT_RANGE_FULL,
  EINVOICE_RANGE_DATA,
  EINVOICE_RANGE_FULL,
  buildEInvoiceItemsFromVersionLines,
  eInvoiceEventRecordToRow,
  eInvoiceRowToRecord,
  generateEInvoiceEventId,
  generateEInvoiceId,
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

export async function getEInvoiceRows(client: SheetsClient): Promise<string[][]> {
  try {
    const response = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: EINVOICE_RANGE_DATA,
    });
    return (response.data.values ?? []) as string[][];
  } catch {
    return [];
  }
}

export async function appendEInvoiceEvent(
  client: SheetsClient,
  input: Omit<EInvoiceEventRecord, "eventId" | "occurredAt"> & { occurredAt?: string },
): Promise<void> {
  const record: EInvoiceEventRecord = {
    ...input,
    eventId: generateEInvoiceEventId(input.invoiceId),
    occurredAt: input.occurredAt ?? isoNow(),
  };
  await client.sheets.spreadsheets.values.append({
    spreadsheetId: client.spreadsheetId,
    range: EINVOICE_EVENT_RANGE_FULL,
    valueInputOption: "RAW",
    requestBody: { values: [eInvoiceEventRecordToRow(record)] },
  });
}

export async function getEInvoiceRecords(client: SheetsClient): Promise<EInvoiceRecord[]> {
  const rows = await getEInvoiceRows(client);
  return rows.map(eInvoiceRowToRecord).filter((record) => record.invoiceId);
}

export async function getEInvoiceRecordById(client: SheetsClient, invoiceId: string): Promise<EInvoiceRecord | null> {
  const rows = await getEInvoiceRows(client);
  const row = rows.find((current) => (current[0] ?? "") === invoiceId);
  return row ? eInvoiceRowToRecord(row) : null;
}

export async function generateNextEInvoiceId(client: SheetsClient): Promise<string> {
  const rows = await getEInvoiceRows(client);
  return generateEInvoiceId(rows);
}

export async function appendEInvoiceRecord(client: SheetsClient, record: EInvoiceRecord): Promise<void> {
  const { eInvoiceRecordToRow } = await import("@/lib/einvoice-utils");
  await client.sheets.spreadsheets.values.append({
    spreadsheetId: client.spreadsheetId,
    range: EINVOICE_RANGE_FULL,
    valueInputOption: "RAW",
    requestBody: { values: [eInvoiceRecordToRow(record)] },
  });
}

export async function updateEInvoiceRecord(client: SheetsClient, invoiceId: string, updater: (record: EInvoiceRecord) => EInvoiceRecord): Promise<EInvoiceRecord | null> {
  const { EINVOICE_ROW_RANGE, eInvoiceRecordToRow } = await import("@/lib/einvoice-utils");

  async function tryOnce(): Promise<EInvoiceRecord | null> {
    const rows = await getEInvoiceRows(client);
    const rowIndex = rows.findIndex((row) => (row[0] ?? "") === invoiceId);
    if (rowIndex === -1) return null;
    const next = updater(eInvoiceRowToRecord(rows[rowIndex]));
    await client.sheets.spreadsheets.values.update({
      spreadsheetId: client.spreadsheetId,
      range: EINVOICE_ROW_RANGE(rowIndex + 2),
      valueInputOption: "RAW",
      requestBody: { values: [eInvoiceRecordToRow(next)] },
    });
    return next;
  }

  const first = await tryOnce();
  if (first) return first;
  // Row may not have propagated yet (append → GET delay) — wait and retry once
  await new Promise((resolve) => setTimeout(resolve, 3000));
  return tryOnce();
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
  const linesByVersionId = new Map<string, VersionLineRecord[]>();
  for (const line of lineRows.map(lineRowToRecord).filter((row) => row.versionId)) {
    const current = linesByVersionId.get(line.versionId) ?? [];
    current.push(line);
    linesByVersionId.set(line.versionId, current);
  }
  const caseMap = new Map(
    caseRows.map(caseRowToRecord).filter((row) => row.caseId).map((row) => [row.caseId, row] as const),
  );
  return { versionMap, linesByVersionId, caseMap };
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
  const [invoiceRecords, { companyMap, primaryContactMap }, { versionMap, linesByVersionId, caseMap }] = await Promise.all([
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
        existingInvoice: existingIssuedMap.get(`ar:${ar.arId}`),
      }),
    );
  }

  for (const record of pending) {
    const version = versionMap.get(record.versionId);
    if (!version) continue;
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
        existingInvoice: existingIssuedMap.get(`pending_monthly:${record.pendingId}`),
      }),
    );
  }

  return candidates.sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate) || a.candidateId.localeCompare(b.candidateId));
}
