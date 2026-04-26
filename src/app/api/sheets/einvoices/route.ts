import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import type { EInvoiceItemSnapshot, EInvoiceRecord } from "@/lib/types";
import { isoDateNow, isoNow } from "@/lib/einvoice-utils";
import { validateTaiwanTaxId } from "@/lib/tax-id";
import { checkRateLimit } from "@/lib/rate-limit";

import { getSession } from "./_auth";
import {
  appendEInvoiceEvent,
  appendEInvoiceRecord,
  generateNextEInvoiceId,
  getEInvoiceRecords,
} from "./_shared";

interface CreateEInvoicePayload {
  retryOfInvoiceId?: string;
  sourceType: EInvoiceRecord["sourceType"];
  sourceId: string;
  sourceSubId?: string;
  quoteId?: string;
  versionId?: string;
  caseId?: string;
  clientId?: string;
  buyerType: EInvoiceRecord["buyerType"];
  buyerName: string;
  buyerTaxId?: string;
  buyerAddress?: string;
  email?: string;
  carrierType?: EInvoiceRecord["carrierType"];
  carrierValue?: string;
  donationCode?: string;
  invoiceDate?: string;
  taxType?: EInvoiceRecord["taxType"];
  untaxedAmount: number;
  taxAmount: number;
  totalAmount: number;
  taxRate?: number;
  items: EInvoiceItemSnapshot[];
  content?: string;
  createdBy?: string;
}

interface DraftCreatedEventPayload {
  sourceType: EInvoiceRecord["sourceType"];
  sourceId: string;
  sourceSubId: string;
  quoteId: string;
  versionId: string;
  caseId: string;
  clientId: string;
  buyerType: EInvoiceRecord["buyerType"];
  buyerName: string;
  buyerTaxId: string;
  buyerAddress: string;
  email: string;
  carrierType: EInvoiceRecord["carrierType"];
  carrierValue: string;
  donationCode: string;
  invoiceDate: string;
  taxType: EInvoiceRecord["taxType"];
  untaxedAmount: number;
  taxAmount: number;
  totalAmount: number;
  taxRate: number;
  itemCount: number;
  items: EInvoiceItemSnapshot[];
  content: string;
}

function buildDraftCreatedEventPayload(payload: CreateEInvoicePayload): DraftCreatedEventPayload {
  return {
    sourceType: payload.sourceType,
    sourceId: payload.sourceId,
    sourceSubId: payload.sourceSubId?.trim() ?? "",
    quoteId: payload.quoteId?.trim() ?? "",
    versionId: payload.versionId?.trim() ?? "",
    caseId: payload.caseId?.trim() ?? "",
    clientId: payload.clientId?.trim() ?? "",
    buyerType: payload.buyerType,
    buyerName: payload.buyerName.trim(),
    buyerTaxId: payload.buyerTaxId?.trim() ?? "",
    buyerAddress: payload.buyerAddress?.trim() ?? "",
    email: payload.email?.trim() ?? "",
    carrierType: payload.carrierType ?? "none",
    carrierValue: payload.carrierValue?.trim() ?? "",
    donationCode: payload.donationCode?.trim() ?? "",
    invoiceDate: payload.invoiceDate?.trim() || isoDateNow(),
    taxType: payload.taxType ?? 0,
    untaxedAmount: Math.round(payload.untaxedAmount),
    taxAmount: Math.round(payload.taxAmount),
    totalAmount: Math.round(payload.totalAmount),
    taxRate: payload.taxRate ?? 5,
    itemCount: payload.items.length,
    items: payload.items,
    content: payload.content?.trim() || payload.buyerName.trim(),
  };
}

function parseString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function parseItems(value: unknown): EInvoiceItemSnapshot[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const current = item as Partial<EInvoiceItemSnapshot>;
    if (typeof current.name !== "string" || !current.name.trim()) return [];
    const quantity = parseNumber(current.quantity);
    const unitPrice = parseNumber(current.unitPrice);
    const amount = parseNumber(current.amount);
    if (quantity <= 0 || amount < 0 || unitPrice < 0) return [];
    return [{
      name: current.name.trim(),
      quantity,
      unitPrice,
      amount,
      remark: typeof current.remark === "string" ? current.remark.trim() : "",
      taxType: current.taxType === 1 || current.taxType === 2 ? current.taxType : 0,
    }];
  });
}

function parseCreatePayload(input: unknown): CreateEInvoicePayload | null {
  if (!input || typeof input !== "object") return null;
  const body = input as Record<string, unknown>;
  return {
    retryOfInvoiceId: parseString(body.retryOfInvoiceId),
    sourceType: parseString(body.sourceType) as CreateEInvoicePayload["sourceType"],
    sourceId: parseString(body.sourceId),
    sourceSubId: parseString(body.sourceSubId),
    quoteId: parseString(body.quoteId),
    versionId: parseString(body.versionId),
    caseId: parseString(body.caseId),
    clientId: parseString(body.clientId),
    buyerType: parseString(body.buyerType) as CreateEInvoicePayload["buyerType"],
    buyerName: parseString(body.buyerName),
    buyerTaxId: parseString(body.buyerTaxId),
    buyerAddress: parseString(body.buyerAddress),
    email: parseString(body.email),
    carrierType: parseString(body.carrierType) as CreateEInvoicePayload["carrierType"],
    carrierValue: parseString(body.carrierValue),
    donationCode: parseString(body.donationCode),
    invoiceDate: parseString(body.invoiceDate),
    taxType: (parseNumber(body.taxType) as CreateEInvoicePayload["taxType"]) || 0,
    untaxedAmount: parseNumber(body.untaxedAmount),
    taxAmount: parseNumber(body.taxAmount),
    totalAmount: parseNumber(body.totalAmount),
    taxRate: parseNumber(body.taxRate) || 5,
    items: parseItems(body.items),
    content: parseString(body.content),
    createdBy: parseString(body.createdBy),
  };
}

function validatePayload(payload: CreateEInvoicePayload): string | null {
  if (!["quote_version", "ar", "pending_monthly", "manual"].includes(payload.sourceType)) return "sourceType is invalid";
  if (!payload.sourceId) return "sourceId is required";
  if (payload.buyerType !== "b2b" && payload.buyerType !== "b2c") return "buyerType is invalid";
  if (!payload.buyerName) return "buyerName is required";
  if (payload.buyerType === "b2b" && !payload.buyerTaxId) return "buyerTaxId is required for B2B";
  if (payload.buyerType === "b2b" && payload.buyerTaxId) {
    const taxIdError = validateTaiwanTaxId(payload.buyerTaxId);
    if (taxIdError) return taxIdError;
  }
  if (!["none", "mobile_barcode", "member_code", ""].includes(payload.carrierType ?? "none")) return "carrierType is invalid";
  if (payload.carrierType === "mobile_barcode" && !payload.carrierValue) return "carrierValue is required for mobile_barcode";
  if (payload.carrierType === "member_code" && !payload.carrierValue) return "carrierValue is required for member_code";
  if (payload.items.length === 0) return "items is required";
  if (payload.totalAmount <= 0) return "totalAmount must be greater than 0";
  return null;
}

function maskTaxId(value: string): string {
  if (value.length <= 4) return value;
  return `${"*".repeat(value.length - 4)}${value.slice(-4)}`;
}

function maskEmail(value: string): string {
  const [name, domain] = value.split("@");
  if (!name || !domain) return value;
  return `${name.slice(0, 2)}***@${domain}`;
}

function sanitizeInvoiceRecord(record: EInvoiceRecord): EInvoiceRecord {
  return {
    ...record,
    buyerTaxId: maskTaxId(record.buyerTaxId),
    email: maskEmail(record.email),
    carrierValue: record.carrierValue ? `${record.carrierValue.slice(0, 2)}***` : "",
    itemsJson: "",
    providerResponseJson: "",
    requestPayloadJson: "",
  };
}

export async function GET(request: Request) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status")?.trim() ?? "";
  const sourceType = searchParams.get("sourceType")?.trim() ?? "";
  const sourceId = searchParams.get("sourceId")?.trim() ?? "";

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: true, invoices: [] as EInvoiceRecord[] });
  }

  try {
    const invoices = (await getEInvoiceRecords(client))
      .filter((invoice) => !status || invoice.status === status)
      .filter((invoice) => !sourceType || invoice.sourceType === sourceType)
      .filter((invoice) => !sourceId || invoice.sourceId === sourceId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(sanitizeInvoiceRecord);
    return NextResponse.json({ ok: true, invoices });
  } catch (err) {
    const logDetail = err instanceof Error ? err.message : "unknown";
    console.error("[einvoices]", logDetail);
    return NextResponse.json({ ok: false, error: "系統錯誤，請稍後再試" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  if (!checkRateLimit(`einvoice:${session.email}`, 10, 60_000)) {
    return NextResponse.json({ ok: false, error: "請求過於頻繁，請稍後再試" }, { status: 429 });
  }

  let payload: CreateEInvoicePayload | null = null;
  try {
    payload = parseCreatePayload(await request.json());
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  if (!payload) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const validationError = validatePayload(payload);
  if (validationError) {
    return NextResponse.json({ ok: false, error: validationError }, { status: 400 });
  }

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const existingRecords = await getEInvoiceRecords(client);
    const duplicateActive = existingRecords.find(
      (record) =>
        record.sourceType === payload.sourceType &&
        record.sourceId === payload.sourceId &&
        ["draft", "issuing", "issued", "needs_review"].includes(record.status),
    );
    if (duplicateActive) {
      return NextResponse.json(
        { ok: false, error: `來源已有進行中或已完成的電子發票 ${duplicateActive.invoiceId}` },
        { status: 409 },
      );
    }

    const invoiceId = await generateNextEInvoiceId(client);
    const now = isoNow();
    const invoice: EInvoiceRecord = {
      invoiceId,
      retryOfInvoiceId: payload.retryOfInvoiceId?.trim() ?? "",
      sourceType: payload.sourceType,
      sourceId: payload.sourceId,
      sourceSubId: payload.sourceSubId?.trim() ?? "",
      quoteId: payload.quoteId?.trim() ?? "",
      versionId: payload.versionId?.trim() ?? "",
      caseId: payload.caseId?.trim() ?? "",
      clientId: payload.clientId?.trim() ?? "",
      buyerType: payload.buyerType,
      buyerName: payload.buyerName.trim(),
      buyerTaxId: payload.buyerTaxId?.trim() ?? "",
      buyerAddress: payload.buyerAddress?.trim() ?? "",
      email: payload.email?.trim() ?? "",
      carrierType: payload.carrierType ?? "none",
      carrierValue: payload.carrierValue?.trim() ?? "",
      donationCode: payload.donationCode?.trim() ?? "",
      invoiceDate: payload.invoiceDate?.trim() || isoDateNow(),
      taxType: payload.taxType ?? 0,
      untaxedAmount: Math.round(payload.untaxedAmount),
      taxAmount: Math.round(payload.taxAmount),
      totalAmount: Math.round(payload.totalAmount),
      taxRate: payload.taxRate ?? 5,
      itemCount: payload.items.length,
      itemsJson: JSON.stringify(payload.items),
      content: payload.content?.trim() || payload.buyerName.trim(),
      status: "draft",
      providerName: "giveme",
      providerInvoiceNo: "",
      providerTrackNo: "",
      providerResponseJson: "",
      requestPayloadJson: "",
      errorCode: "",
      errorMessage: "",
      cancelledAt: "",
      cancelReason: "",
      createdBy: session.displayName,
      createdAt: now,
      updatedAt: now,
    };

    await appendEInvoiceRecord(client, invoice);
    await appendEInvoiceEvent(client, {
      invoiceId,
      eventType: "draft_created",
      fromStatus: "",
      toStatus: "draft",
      message: "建立電子發票草稿",
      requestJson: JSON.stringify(buildDraftCreatedEventPayload(payload)),
      responseJson: "",
      actor: invoice.createdBy,
    });

    return NextResponse.json({ ok: true, invoice }, { status: 201 });
  } catch (err) {
    const logDetail = err instanceof Error ? err.message : "unknown";
    console.error("[einvoices]", logDetail);
    return NextResponse.json({ ok: false, error: "系統錯誤，請稍後再試" }, { status: 500 });
  }
}
