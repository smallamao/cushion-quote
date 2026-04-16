import "server-only";

import { getSheetsClient } from "@/lib/sheets-client";
import type {
  AfterSalesReply,
  AfterSalesService,
  AfterSalesStatus,
} from "@/lib/types";

const MAIN_SHEET = "售後服務";
const MAIN_RANGE_FULL = `${MAIN_SHEET}!A:W`;
const MAIN_RANGE_DATA = `${MAIN_SHEET}!A2:W`;
const MAIN_RANGE_IDS = `${MAIN_SHEET}!A2:A`;

const REPLY_SHEET = "售後服務回應";
const REPLY_RANGE_FULL = `${REPLY_SHEET}!A:G`;
const REPLY_RANGE_DATA = `${REPLY_SHEET}!A2:G`;

function parseJsonArray(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === "string");
    return [];
  } catch {
    return [];
  }
}

function rowToService(row: string[]): AfterSalesService {
  return {
    serviceId: row[0] ?? "",
    receivedDate: row[1] ?? "",
    relatedOrderNo: row[2] ?? "",
    shipmentDate: row[3] ?? "",
    clientName: row[4] ?? "",
    clientPhone: row[5] ?? "",
    clientContact2: row[6] ?? "",
    clientPhone2: row[7] ?? "",
    deliveryAddress: row[8] ?? "",
    modelCode: row[9] ?? "",
    modelNameSnapshot: row[10] ?? "",
    issueDescription: row[11] ?? "",
    issuePhotos: parseJsonArray(row[12]),
    status: (row[13] as AfterSalesStatus) || "pending",
    assignedTo: row[14] ?? "",
    scheduledDate: row[15] ?? "",
    dispatchNotes: row[16] ?? "",
    completedDate: row[17] ?? "",
    completionNotes: row[18] ?? "",
    completionPhotos: parseJsonArray(row[19]),
    createdAt: row[20] ?? "",
    updatedAt: row[21] ?? "",
    createdBy: row[22] ?? "",
  };
}

function serviceToRow(s: AfterSalesService): string[] {
  return [
    s.serviceId,
    s.receivedDate,
    s.relatedOrderNo,
    s.shipmentDate,
    s.clientName,
    s.clientPhone,
    s.clientContact2,
    s.clientPhone2,
    s.deliveryAddress,
    s.modelCode,
    s.modelNameSnapshot,
    s.issueDescription,
    JSON.stringify(s.issuePhotos),
    s.status,
    s.assignedTo,
    s.scheduledDate,
    s.dispatchNotes,
    s.completedDate,
    s.completionNotes,
    JSON.stringify(s.completionPhotos),
    s.createdAt,
    s.updatedAt,
    s.createdBy,
  ];
}

function rowToReply(row: string[]): AfterSalesReply {
  return {
    replyId: row[0] ?? "",
    serviceId: row[1] ?? "",
    occurredAt: row[2] ?? "",
    author: row[3] ?? "",
    content: row[4] ?? "",
    attachments: parseJsonArray(row[5]),
    createdAt: row[6] ?? "",
  };
}

function replyToRow(r: AfterSalesReply): string[] {
  return [
    r.replyId,
    r.serviceId,
    r.occurredAt,
    r.author,
    r.content,
    JSON.stringify(r.attachments),
    r.createdAt,
  ];
}

/** 產生新的 serviceId: AS-YYYYMMDD-NN */
function generateServiceId(existing: AfterSalesService[], date: string): string {
  const dateKey = date.replace(/-/g, "");
  const prefix = `AS-${dateKey}-`;
  const nums = existing
    .filter((s) => s.serviceId.startsWith(prefix))
    .map((s) => Number(s.serviceId.slice(prefix.length)) || 0);
  const max = nums.length > 0 ? Math.max(...nums) : 0;
  return `${prefix}${String(max + 1).padStart(2, "0")}`;
}

export async function listServices(): Promise<AfterSalesService[]> {
  const client = await getSheetsClient();
  if (!client) return [];
  try {
    const res = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: MAIN_RANGE_DATA,
    });
    return (res.data.values ?? []).map(rowToService).filter((s) => s.serviceId);
  } catch {
    return [];
  }
}

export async function findServiceById(
  serviceId: string,
): Promise<AfterSalesService | null> {
  const all = await listServices();
  return all.find((s) => s.serviceId === serviceId) ?? null;
}

export async function createService(input: {
  service: Omit<AfterSalesService, "serviceId" | "createdAt" | "updatedAt">;
}): Promise<AfterSalesService | null> {
  const client = await getSheetsClient();
  if (!client) return null;
  const all = await listServices();
  const date = input.service.receivedDate || new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();
  const service: AfterSalesService = {
    ...input.service,
    serviceId: generateServiceId(all, date),
    createdAt: now,
    updatedAt: now,
  };
  await client.sheets.spreadsheets.values.append({
    spreadsheetId: client.spreadsheetId,
    range: MAIN_RANGE_FULL,
    valueInputOption: "RAW",
    requestBody: { values: [serviceToRow(service)] },
  });
  return service;
}

export async function updateService(
  serviceId: string,
  patch: Partial<Omit<AfterSalesService, "serviceId" | "createdAt" | "createdBy">>,
): Promise<AfterSalesService | null> {
  const client = await getSheetsClient();
  if (!client) return null;
  const idRes = await client.sheets.spreadsheets.values.get({
    spreadsheetId: client.spreadsheetId,
    range: MAIN_RANGE_IDS,
  });
  const ids = (idRes.data.values ?? []).flat();
  const rowIndex = ids.indexOf(serviceId);
  if (rowIndex === -1) return null;
  const sheetRow = rowIndex + 2;

  const current = await findServiceById(serviceId);
  if (!current) return null;
  const updated: AfterSalesService = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await client.sheets.spreadsheets.values.update({
    spreadsheetId: client.spreadsheetId,
    range: `${MAIN_SHEET}!A${sheetRow}:W${sheetRow}`,
    valueInputOption: "RAW",
    requestBody: { values: [serviceToRow(updated)] },
  });
  return updated;
}

// ==================== replies ====================

export async function listAllReplies(): Promise<AfterSalesReply[]> {
  const client = await getSheetsClient();
  if (!client) return [];
  try {
    const res = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: REPLY_RANGE_DATA,
    });
    return (res.data.values ?? []).map(rowToReply).filter((r) => r.replyId);
  } catch {
    return [];
  }
}

export async function listReplies(serviceId: string): Promise<AfterSalesReply[]> {
  const all = await listAllReplies();
  return all
    .filter((r) => r.serviceId === serviceId)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

function generateReplyId(existing: AfterSalesReply[], serviceId: string): string {
  const prefix = `${serviceId}-r`;
  const nums = existing
    .filter((r) => r.replyId.startsWith(prefix))
    .map((r) => Number(r.replyId.slice(prefix.length)) || 0);
  const max = nums.length > 0 ? Math.max(...nums) : 0;
  return `${prefix}${String(max + 1).padStart(2, "0")}`;
}

export async function createReply(input: {
  serviceId: string;
  author: string;
  content: string;
  attachments: string[];
  occurredAt?: string;
}): Promise<AfterSalesReply | null> {
  const client = await getSheetsClient();
  if (!client) return null;
  const existing = await listReplies(input.serviceId);
  const now = new Date().toISOString();
  const reply: AfterSalesReply = {
    replyId: generateReplyId(existing, input.serviceId),
    serviceId: input.serviceId,
    occurredAt: input.occurredAt || now,
    author: input.author,
    content: input.content,
    attachments: input.attachments,
    createdAt: now,
  };
  await client.sheets.spreadsheets.values.append({
    spreadsheetId: client.spreadsheetId,
    range: REPLY_RANGE_FULL,
    valueInputOption: "RAW",
    requestBody: { values: [replyToRow(reply)] },
  });
  return reply;
}
