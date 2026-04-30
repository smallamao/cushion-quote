import { getSheetsClient } from "@/lib/sheets-client";
import type {
  CaseRecord,
  LeadSource,
  QuotePlanRecord,
  QuoteVersionRecord,
  ReminderStatus,
  VersionLineRecord,
} from "@/lib/types";

type SheetsClient = NonNullable<Awaited<ReturnType<typeof getSheetsClient>>>;

const CASE_SHEET = "案件";
const QUOTE_SHEET = "報價";
const VERSION_SHEET = "報價版本";
const VERSION_LINE_SHEET = "報價版本明細";

interface SortSheetOptions {
  sheetName: string;
  dataRange: string;
  totalColumnCount: number;
  primarySortColumnIndex: number;
  primarySortOrder?: "ASCENDING" | "DESCENDING";
  secondarySortColumnIndex?: number;
  secondarySortOrder?: "ASCENDING" | "DESCENDING";
}

function toNumber(value: string | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function toBoolean(value: string | undefined): boolean {
  return value === "TRUE" || value === "true" || value === "1";
}

function addDays(dateText: string, days: number): string {
  if (!dateText) return "";
  const base = new Date(dateText);
  if (Number.isNaN(base.getTime())) return "";
  base.setDate(base.getDate() + days);
  return base.toISOString().slice(0, 10);
}

export function isoDateNow(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isoNow(): string {
  return new Date().toISOString();
}

export function calculateNextFollowUpDate(sentAt: string, followUpDays: number): string {
  if (!sentAt || followUpDays <= 0) return "";
  return addDays(sentAt.slice(0, 10), followUpDays);
}

export function calculateReminderStatus(version: Pick<QuoteVersionRecord, "versionStatus" | "sentAt" | "nextFollowUpDate" | "lastFollowUpAt">): ReminderStatus {
  if (version.versionStatus === "accepted" || version.versionStatus === "rejected" || version.versionStatus === "superseded") {
    return "done";
  }
  if (!version.sentAt) {
    return "not_sent";
  }
  if (version.lastFollowUpAt && version.nextFollowUpDate && version.lastFollowUpAt.slice(0, 10) >= version.nextFollowUpDate) {
    return "done";
  }
  if (!version.nextFollowUpDate) {
    return "pending";
  }

  const today = isoDateNow();
  if (version.nextFollowUpDate < today) return "overdue";
  if (version.nextFollowUpDate === today) return "due_today";
  return "pending";
}

export function caseRowToRecord(row: string[]): CaseRecord {
  const legacyLeadSource = row[20] ?? "";
  const normalizedLeadSource = normalizeLeadSource(legacyLeadSource);
  const rawLeadSourceDetail = row.length >= 24 ? row[21] ?? "" : "";
  const normalizedLeadSourceDetail = normalizeLeadSourceDetail(legacyLeadSource, rawLeadSourceDetail);

  return {
    caseId: row[0] ?? "",
    caseName: row[1] ?? "",
    clientId: row[2] ?? "",
    clientNameSnapshot: row[3] ?? "",
    contactNameSnapshot: row[4] ?? "",
    phoneSnapshot: row[5] ?? "",
    projectAddress: row[6] ?? "",
    channelSnapshot: (row[7] as CaseRecord["channelSnapshot"]) ?? "wholesale",
    caseStatus: (row[8] as CaseRecord["caseStatus"]) ?? "new",
    inquiryDate: row[9] ?? "",
    latestQuoteId: row[10] ?? "",
    latestVersionId: row[11] ?? "",
    latestSentAt: row[12] ?? "",
    nextFollowUpDate: row[13] ?? "",
    lastFollowUpAt: row[14] ?? "",
    wonVersionId: row[15] ?? "",
    lostReason: row[16] ?? "",
    internalNotes: row[17] ?? "",
    createdAt: row[18] ?? "",
    updatedAt: row[19] ?? "",
    leadSource: normalizedLeadSource,
    leadSourceDetail: normalizedLeadSourceDetail,
    leadSourceContact: row.length >= 24 ? row[22] ?? "" : row[21] ?? "",
    leadSourceNotes: row.length >= 24 ? row[23] ?? "" : row[22] ?? "",
    shippingStatus: (row[24] as CaseRecord["shippingStatus"]) || "not_started",
    trackingNo: row[25] ?? "",
    shippedAt: row[26] ?? "",
    referredByCompanyId: row[27] ?? "",
    referredByCompanyName: row[28] ?? "",
  };
}

export function caseRecordToRow(record: CaseRecord): string[] {
  return [
    record.caseId,
    record.caseName,
    record.clientId,
    record.clientNameSnapshot,
    record.contactNameSnapshot,
    record.phoneSnapshot,
    record.projectAddress,
    record.channelSnapshot,
    record.caseStatus,
    record.inquiryDate,
    record.latestQuoteId,
    record.latestVersionId,
    record.latestSentAt,
    record.nextFollowUpDate,
    record.lastFollowUpAt,
    record.wonVersionId,
    record.lostReason,
    record.internalNotes,
    record.createdAt,
    record.updatedAt,
    record.leadSource,
    record.leadSourceDetail,
    record.leadSourceContact,
    record.leadSourceNotes,
    record.shippingStatus || "not_started",
    record.trackingNo || "",
    record.shippedAt || "",
    record.referredByCompanyId || "",
    record.referredByCompanyName || "",
  ];
}

function normalizeLeadSource(value: string | undefined): LeadSource {
  if (value === "bni" || value === "rotary") {
    return "association_network";
  }

  if (
    value === "unknown" ||
    value === "google_search" ||
    value === "google_maps" ||
    value === "facebook_instagram" ||
    value === "line" ||
    value === "referral" ||
    value === "repeat_customer" ||
    value === "walk_in" ||
    value === "association_network" ||
    value === "other"
  ) {
    return value;
  }

  return "unknown";
}

function normalizeLeadSourceDetail(legacySource: string | undefined, detail: string): string {
  if (detail) return detail;
  if (legacySource === "bni") return "BNI";
  if (legacySource === "rotary") return "扶輪社";
  return "";
}

export function quoteRowToRecord(row: string[]): QuotePlanRecord {
  return {
    quoteId: row[0] ?? "",
    caseId: row[1] ?? "",
    quoteSeq: toNumber(row[2]),
    quoteName: row[3] ?? "",
    quoteType: row[4] ?? "",
    scopeNote: row[5] ?? "",
    quoteStatus: (row[6] as QuotePlanRecord["quoteStatus"]) ?? "draft",
    currentVersionId: row[7] ?? "",
    selectedVersionId: row[8] ?? "",
    versionCount: toNumber(row[9]),
    latestSentAt: row[10] ?? "",
    nextFollowUpDate: row[11] ?? "",
    sortOrder: toNumber(row[12]),
    internalNotes: row[13] ?? "",
    createdAt: row[14] ?? "",
    updatedAt: row[15] ?? "",
  };
}

export function quoteRecordToRow(record: QuotePlanRecord): string[] {
  return [
    record.quoteId,
    record.caseId,
    String(record.quoteSeq),
    record.quoteName,
    record.quoteType,
    record.scopeNote,
    record.quoteStatus,
    record.currentVersionId,
    record.selectedVersionId,
    String(record.versionCount),
    record.latestSentAt,
    record.nextFollowUpDate,
    String(record.sortOrder),
    record.internalNotes,
    record.createdAt,
    record.updatedAt,
  ];
}

export function versionRowToRecord(row: string[]): QuoteVersionRecord {
  return {
    versionId: row[0] ?? "",
    quoteId: row[1] ?? "",
    caseId: row[2] ?? "",
    versionNo: toNumber(row[3]),
    basedOnVersionId: row[4] ?? "",
    versionLabel: row[5] ?? "",
    versionStatus: (row[6] as QuoteVersionRecord["versionStatus"]) ?? "draft",
    quoteDate: row[7] ?? "",
    sentAt: row[8] ?? "",
    validUntil: row[9] ?? "",
    followUpDays: toNumber(row[10]),
    nextFollowUpDate: row[11] ?? "",
    lastFollowUpAt: row[12] ?? "",
    reminderStatus: (row[13] as QuoteVersionRecord["reminderStatus"]) ?? "not_sent",
    subtotalBeforeTax: toNumber(row[14]),
    discountAmount: toNumber(row[15]),
    taxRate: toNumber(row[16]),
    taxAmount: toNumber(row[17]),
    totalAmount: toNumber(row[18]),
    estimatedCostTotal: toNumber(row[19]),
    grossMarginAmount: toNumber(row[20]),
    grossMarginRate: toNumber(row[21]),
    channel: (row[22] as QuoteVersionRecord["channel"]) ?? "wholesale",
    termsTemplate: row[23] ?? "",
    publicDescription: row[24] ?? "",
    descriptionImageUrl: row[25] ?? "",
    internalNotes: row[26] ?? "",
    snapshotLocked: toBoolean(row[27]),
    snapshotLockedAt: row[28] ?? "",
    clientNameSnapshot: row[29] ?? "",
    contactNameSnapshot: row[30] ?? "",
    clientPhoneSnapshot: row[31] ?? "",
    projectNameSnapshot: row[32] ?? "",
    projectAddressSnapshot: row[33] ?? "",
    channelSnapshot: (row[34] as QuoteVersionRecord["channelSnapshot"]) ?? "wholesale",
    quoteNameSnapshot: row[42] ?? "",
    createdAt: row[35] ?? "",
    updatedAt: row[36] ?? "",
    commissionMode: (row[37] as QuoteVersionRecord["commissionMode"]) ?? "price_gap",
    commissionRate: toNumber(row[38]),
    commissionAmount: toNumber(row[39]),
    commissionFixedAmount: toNumber(row[40]),
    commissionPartners: row[41] ?? "",
    signedBack: toBoolean(row[43]),
    signedBackDate: row[44] ?? "",
    signedContractUrls: parseJsonStringArray(row[45]),
    signedNotes: row[46] ?? "",
  };
}

function parseJsonStringArray(input: string | undefined): string[] {
  if (!input) return [];
  try {
    const parsed = JSON.parse(input);
    if (Array.isArray(parsed)) {
      return parsed.filter((v): v is string => typeof v === "string");
    }
    return [];
  } catch {
    return [];
  }
}

export function versionRecordToRow(record: QuoteVersionRecord): string[] {
  return [
    record.versionId,
    record.quoteId,
    record.caseId,
    String(record.versionNo),
    record.basedOnVersionId,
    record.versionLabel,
    record.versionStatus,
    record.quoteDate,
    record.sentAt,
    record.validUntil,
    String(record.followUpDays),
    record.nextFollowUpDate,
    record.lastFollowUpAt,
    record.reminderStatus,
    String(record.subtotalBeforeTax),
    String(record.discountAmount),
    String(record.taxRate),
    String(record.taxAmount),
    String(record.totalAmount),
    String(record.estimatedCostTotal),
    String(record.grossMarginAmount),
    String(record.grossMarginRate),
    record.channel,
    record.termsTemplate,
    record.publicDescription,
    record.descriptionImageUrl,
    record.internalNotes,
    record.snapshotLocked ? "TRUE" : "FALSE",
    record.snapshotLockedAt,
    record.clientNameSnapshot,
    record.contactNameSnapshot,
    record.clientPhoneSnapshot,
    record.projectNameSnapshot,
    record.projectAddressSnapshot,
    record.channelSnapshot,
    record.createdAt,
    record.updatedAt,
    record.commissionMode,
    String(record.commissionRate),
    String(record.commissionAmount),
    String(record.commissionFixedAmount),
    record.commissionPartners,
    record.quoteNameSnapshot,
    record.signedBack ? "TRUE" : "FALSE",
    record.signedBackDate,
    JSON.stringify(record.signedContractUrls ?? []),
    record.signedNotes,
  ];
}

export function lineRowToRecord(row: string[]): VersionLineRecord {
  return {
    itemId: row[0] ?? "",
    versionId: row[1] ?? "",
    quoteId: row[2] ?? "",
    caseId: row[3] ?? "",
    lineNo: toNumber(row[4]),
    itemName: row[5] ?? "",
    spec: row[6] ?? "",
    materialId: row[7] ?? "",
    qty: toNumber(row[8]),
    unit: (row[9] as VersionLineRecord["unit"]) ?? "式",
    unitPrice: toNumber(row[10]),
    lineAmount: toNumber(row[11]),
    estimatedUnitCost: toNumber(row[12]),
    estimatedCostAmount: toNumber(row[13]),
    lineMarginAmount: toNumber(row[14]),
    lineMarginRate: toNumber(row[15]),
    isCostItem: toBoolean(row[16]),
    showOnQuote: !row[17] || toBoolean(row[17]),
    notes: row[18] ?? "",
    imageUrl: row[19] ?? "",
    specImageUrl: row[22] ?? "",
    createdAt: row[20] ?? "",
    updatedAt: row[21] ?? "",
    installHeightTier: row[23] ?? "",
    panelSizeTier: row[24] ?? "",
    installSurchargeRate: toNumber(row[25]),
    panelInputMode: row[26] ?? "",
    surfaceWidthCm: toNumber(row[27]),
    surfaceHeightCm: toNumber(row[28]),
    splitDirection: row[29] ?? "",
    splitCount: toNumber(row[30]),
    caiRoundingMode: row[31] ?? "",
    customSplitSizesCsv: row[32] ?? "",
  };
}

export function lineRecordToRow(record: VersionLineRecord): string[] {
  return [
    record.itemId,
    record.versionId,
    record.quoteId,
    record.caseId,
    String(record.lineNo),
    record.itemName,
    record.spec,
    record.materialId,
    String(record.qty),
    record.unit,
    String(record.unitPrice),
    String(record.lineAmount),
    String(record.estimatedUnitCost),
    String(record.estimatedCostAmount),
    String(record.lineMarginAmount),
    String(record.lineMarginRate),
    record.isCostItem ? "TRUE" : "FALSE",
    record.showOnQuote ? "TRUE" : "FALSE",
    record.notes,
    record.imageUrl,
    record.createdAt,
    record.updatedAt,
    record.specImageUrl,
    record.installHeightTier,
    record.panelSizeTier,
    String(record.installSurchargeRate),
    record.panelInputMode,
    String(record.surfaceWidthCm),
    String(record.surfaceHeightCm),
    record.splitDirection,
    String(record.splitCount),
    record.caiRoundingMode,
    record.customSplitSizesCsv,
  ];
}

export async function getCaseRows(client: SheetsClient): Promise<string[][]> {
  const response = await client.sheets.spreadsheets.values.get({
    spreadsheetId: client.spreadsheetId,
    range: `${CASE_SHEET}!A2:AC`,
  });
  return response.data.values ?? [];
}

export async function getQuoteRows(client: SheetsClient): Promise<string[][]> {
  const response = await client.sheets.spreadsheets.values.get({
    spreadsheetId: client.spreadsheetId,
    range: `${QUOTE_SHEET}!A2:P`,
  });
  return response.data.values ?? [];
}

export async function getVersionRows(client: SheetsClient): Promise<string[][]> {
  const response = await client.sheets.spreadsheets.values.get({
    spreadsheetId: client.spreadsheetId,
    range: `${VERSION_SHEET}!A2:AU`,
  });
  return response.data.values ?? [];
}

export async function getVersionLineRows(client: SheetsClient): Promise<string[][]> {
  const response = await client.sheets.spreadsheets.values.get({
    spreadsheetId: client.spreadsheetId,
    range: `${VERSION_LINE_SHEET}!A2:AG`,
  });
  return response.data.values ?? [];
}

export async function getSheetId(client: SheetsClient, sheetName: string): Promise<number | null> {
  const response = await client.sheets.spreadsheets.get({
    spreadsheetId: client.spreadsheetId,
  });
  const sheet = response.data.sheets?.find((candidate) => candidate.properties?.title === sheetName);
  return sheet?.properties?.sheetId ?? null;
}

export async function sortSheetRows(client: SheetsClient, options: SortSheetOptions): Promise<void> {
  const {
    sheetName,
    dataRange,
    totalColumnCount,
    primarySortColumnIndex,
    primarySortOrder = "DESCENDING",
    secondarySortColumnIndex,
    secondarySortOrder = "ASCENDING",
  } = options;

  const rowsResponse = await client.sheets.spreadsheets.values.get({
    spreadsheetId: client.spreadsheetId,
    range: dataRange,
  });
  const rowCount = rowsResponse.data.values?.length ?? 0;
  if (rowCount <= 1) {
    return;
  }

  const sheetId = await getSheetId(client, sheetName);
  if (sheetId === null) {
    return;
  }

  const sortSpecs: Array<{ dimensionIndex: number; sortOrder: "ASCENDING" | "DESCENDING" }> = [
    {
      dimensionIndex: primarySortColumnIndex,
      sortOrder: primarySortOrder,
    },
  ];

  if (secondarySortColumnIndex !== undefined) {
    sortSpecs.push({
      dimensionIndex: secondarySortColumnIndex,
      sortOrder: secondarySortOrder,
    });
  }

  await client.sheets.spreadsheets.batchUpdate({
    spreadsheetId: client.spreadsheetId,
    requestBody: {
      requests: [
        {
          sortRange: {
            range: {
              sheetId,
              startRowIndex: 1,
              endRowIndex: rowCount + 1,
              startColumnIndex: 0,
              endColumnIndex: totalColumnCount,
            },
            sortSpecs,
          },
        },
      ],
    },
  });
}

export async function generateCaseId(client: SheetsClient, now = new Date()): Promise<string> {
  const month = now.toISOString().slice(0, 7).replace("-", "");
  const prefix = `CA-${month}-`;
  const rows = await getCaseRows(client);
  const maxSeq = rows
    .map((row) => row[0] ?? "")
    .filter((id) => id.startsWith(prefix))
    .reduce((max, id) => {
      const seq = Number(id.slice(prefix.length));
      return Number.isFinite(seq) ? Math.max(max, seq) : max;
    }, 0);
  return `${prefix}${String(maxSeq + 1).padStart(3, "0")}`;
}

export async function generateQuoteId(client: SheetsClient, caseId: string): Promise<{ quoteId: string; quoteSeq: number }> {
  const prefix = `${caseId}-Q`;
  const rows = await getQuoteRows(client);
  const maxSeq = rows
    .map((row) => row[0] ?? "")
    .filter((id) => id.startsWith(prefix))
    .reduce((max, id) => {
      const seq = Number(id.slice(prefix.length));
      return Number.isFinite(seq) ? Math.max(max, seq) : max;
    }, 0);
  const quoteSeq = maxSeq + 1;
  return {
    quoteId: `${caseId}-Q${String(quoteSeq).padStart(2, "0")}`,
    quoteSeq,
  };
}

export async function generateVersionId(client: SheetsClient, quoteId: string): Promise<{ versionId: string; versionNo: number }> {
  const prefix = `${quoteId}-V`;
  const rows = await getVersionRows(client);
  const maxSeq = rows
    .map((row) => row[0] ?? "")
    .filter((id) => id.startsWith(prefix))
    .reduce((max, id) => {
      const seq = Number(id.slice(prefix.length));
      return Number.isFinite(seq) ? Math.max(max, seq) : max;
    }, 0);
  const versionNo = maxSeq + 1;
  return {
    versionId: `${quoteId}-V${String(versionNo).padStart(2, "0")}`,
    versionNo,
  };
}

export function makeItemId(versionId: string, itemSeq: number): string {
  return `${versionId}-I${String(itemSeq).padStart(3, "0")}`;
}

export async function replaceVersionLines(client: SheetsClient, versionId: string, newLines: VersionLineRecord[]): Promise<void> {
  const allRows = await getVersionLineRows(client);
  const keptRows = allRows.filter((row) => (row[1] ?? "") !== versionId);
  const mergedRows = [...keptRows, ...newLines.map(lineRecordToRow)];

  await client.sheets.spreadsheets.values.clear({
    spreadsheetId: client.spreadsheetId,
    range: `${VERSION_LINE_SHEET}!A2:AG`,
  });

  if (mergedRows.length > 0) {
    await client.sheets.spreadsheets.values.update({
      spreadsheetId: client.spreadsheetId,
      range: `${VERSION_LINE_SHEET}!A2:AG${mergedRows.length + 1}`,
      valueInputOption: "RAW",
      requestBody: { values: mergedRows },
    });
  }
}

export async function updateQuoteById(client: SheetsClient, quoteId: string, update: (current: QuotePlanRecord) => QuotePlanRecord): Promise<void> {
  const rows = await getQuoteRows(client);
  const rowIndex = rows.findIndex((row) => row[0] === quoteId);
  if (rowIndex === -1) return;

  const next = update(quoteRowToRecord(rows[rowIndex] ?? []));
  const sheetRow = rowIndex + 2;
  await client.sheets.spreadsheets.values.update({
    spreadsheetId: client.spreadsheetId,
    range: `${QUOTE_SHEET}!A${sheetRow}:P${sheetRow}`,
    valueInputOption: "RAW",
    requestBody: { values: [quoteRecordToRow(next)] },
  });
}

export async function updateCaseById(client: SheetsClient, caseId: string, update: (current: CaseRecord) => CaseRecord): Promise<void> {
  const rows = await getCaseRows(client);
  const rowIndex = rows.findIndex((row) => row[0] === caseId);
  if (rowIndex === -1) return;

  const next = update(caseRowToRecord(rows[rowIndex] ?? []));
  const sheetRow = rowIndex + 2;
  await client.sheets.spreadsheets.values.update({
    spreadsheetId: client.spreadsheetId,
    range: `${CASE_SHEET}!A${sheetRow}:AC${sheetRow}`,
    valueInputOption: "RAW",
    requestBody: { values: [caseRecordToRow(next)] },
  });
}

export function normalizeVersionUpdate(record: QuoteVersionRecord, now: string): QuoteVersionRecord {
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
