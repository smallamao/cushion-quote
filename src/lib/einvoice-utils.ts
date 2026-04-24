import type {
  EInvoiceEventRecord,
  EInvoiceItemSnapshot,
  EInvoiceRecord,
  VersionLineRecord,
} from "@/lib/types";

export const EINVOICE_SHEET = "電子發票紀錄";
export const EINVOICE_EVENT_SHEET = "電子發票事件";

export const EINVOICE_RANGE_FULL = `${EINVOICE_SHEET}!A:AL`;
export const EINVOICE_RANGE_DATA = `${EINVOICE_SHEET}!A2:AL10000`;
export const EINVOICE_ROW_RANGE = (sheetRow: number) => `${EINVOICE_SHEET}!A${sheetRow}:AL${sheetRow}`;

export const EINVOICE_EVENT_RANGE_FULL = `${EINVOICE_EVENT_SHEET}!A:J`;
export const EINVOICE_EVENT_RANGE_DATA = `${EINVOICE_EVENT_SHEET}!A2:J10000`;

function toNumber(value: string | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseJsonString<T>(value: string | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function isoNow(): string {
  return new Date().toISOString();
}

export function isoDateNow(): string {
  return new Date().toISOString().slice(0, 10);
}

export function eInvoiceRecordToRow(record: EInvoiceRecord): string[] {
  return [
    record.invoiceId,
    record.retryOfInvoiceId,
    record.sourceType,
    record.sourceId,
    record.sourceSubId,
    record.quoteId,
    record.versionId,
    record.caseId,
    record.clientId,
    record.buyerType,
    record.buyerName,
    record.buyerTaxId,
    record.email,
    record.carrierType,
    record.carrierValue,
    record.donationCode,
    record.invoiceDate,
    String(record.taxType),
    String(record.untaxedAmount),
    String(record.taxAmount),
    String(record.totalAmount),
    String(record.taxRate),
    String(record.itemCount),
    record.itemsJson,
    record.content,
    record.status,
    record.providerName,
    record.providerInvoiceNo,
    record.providerTrackNo,
    record.providerResponseJson,
    record.requestPayloadJson,
    record.errorCode,
    record.errorMessage,
    record.cancelledAt,
    record.cancelReason,
    record.createdBy,
    record.createdAt,
    record.updatedAt,
  ];
}

export function eInvoiceRowToRecord(row: string[]): EInvoiceRecord {
  return {
    invoiceId: row[0] ?? "",
    retryOfInvoiceId: row[1] ?? "",
    sourceType: (row[2] as EInvoiceRecord["sourceType"]) ?? "manual",
    sourceId: row[3] ?? "",
    sourceSubId: row[4] ?? "",
    quoteId: row[5] ?? "",
    versionId: row[6] ?? "",
    caseId: row[7] ?? "",
    clientId: row[8] ?? "",
    buyerType: (row[9] as EInvoiceRecord["buyerType"]) ?? "b2c",
    buyerName: row[10] ?? "",
    buyerTaxId: row[11] ?? "",
    email: row[12] ?? "",
    carrierType: (row[13] as EInvoiceRecord["carrierType"]) ?? "none",
    carrierValue: row[14] ?? "",
    donationCode: row[15] ?? "",
    invoiceDate: row[16] ?? "",
    taxType: (toNumber(row[17]) as EInvoiceRecord["taxType"]) || 0,
    untaxedAmount: toNumber(row[18]),
    taxAmount: toNumber(row[19]),
    totalAmount: toNumber(row[20]),
    taxRate: toNumber(row[21]),
    itemCount: toNumber(row[22]),
    itemsJson: row[23] ?? "[]",
    content: row[24] ?? "",
    status: (row[25] as EInvoiceRecord["status"]) ?? "draft",
    providerName: row[26] ?? "",
    providerInvoiceNo: row[27] ?? "",
    providerTrackNo: row[28] ?? "",
    providerResponseJson: row[29] ?? "",
    requestPayloadJson: row[30] ?? "",
    errorCode: row[31] ?? "",
    errorMessage: row[32] ?? "",
    cancelledAt: row[33] ?? "",
    cancelReason: row[34] ?? "",
    createdBy: row[35] ?? "",
    createdAt: row[36] ?? "",
    updatedAt: row[37] ?? "",
  };
}

export function eInvoiceEventRecordToRow(record: EInvoiceEventRecord): string[] {
  return [
    record.eventId,
    record.invoiceId,
    record.eventType,
    record.fromStatus,
    record.toStatus,
    record.message,
    record.requestJson,
    record.responseJson,
    record.actor,
    record.occurredAt,
  ];
}

export function eInvoiceEventRowToRecord(row: string[]): EInvoiceEventRecord {
  return {
    eventId: row[0] ?? "",
    invoiceId: row[1] ?? "",
    eventType: (row[2] as EInvoiceEventRecord["eventType"]) ?? "draft_created",
    fromStatus: row[3] ?? "",
    toStatus: row[4] ?? "",
    message: row[5] ?? "",
    requestJson: row[6] ?? "",
    responseJson: row[7] ?? "",
    actor: row[8] ?? "",
    occurredAt: row[9] ?? "",
  };
}

export function parseEInvoiceItems(itemsJson: string): EInvoiceItemSnapshot[] {
  const parsed = parseJsonString<unknown[]>(itemsJson, []);
  return parsed.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const current = item as Partial<EInvoiceItemSnapshot>;
    return [{
      name: typeof current.name === "string" ? current.name : "",
      quantity: toNumber(String(current.quantity ?? 0)),
      unitPrice: toNumber(String(current.unitPrice ?? 0)),
      amount: toNumber(String(current.amount ?? 0)),
      remark: typeof current.remark === "string" ? current.remark : "",
      taxType: current.taxType === 1 || current.taxType === 2 ? current.taxType : 0,
    }];
  });
}

export function buildEInvoiceItemsFromVersionLines(lines: VersionLineRecord[]): EInvoiceItemSnapshot[] {
  return lines.map((line) => ({
    name: line.itemName,
    quantity: line.qty,
    unitPrice: Math.round(line.unitPrice),
    amount: Math.round(line.lineAmount),
    remark: line.notes,
    taxType: 0,
  }));
}

export function generateEInvoiceId(rows: string[][], now: Date = new Date()): string {
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `INV-${date}-`;
  const maxSeq = rows
    .map((row) => row[0] ?? "")
    .filter((id) => id.startsWith(prefix))
    .reduce((currentMax, id) => {
      // Strip optional millisecond suffix (e.g. "INV-20260424-001-042") before parsing sequence
      const seqPart = id.slice(prefix.length).split("-")[0];
      const seq = Number(seqPart);
      return Number.isFinite(seq) ? Math.max(currentMax, seq) : currentMax;
    }, 0);
  const msSuffix = String(Date.now() % 1000).padStart(3, "0");
  return `${prefix}${String(maxSeq + 1).padStart(3, "0")}-${msSuffix}`;
}

export function generateEInvoiceEventId(invoiceId: string, now: Date = new Date()): string {
  const timestamp = now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 17);
  return `${invoiceId}-EVT-${timestamp}`;
}
