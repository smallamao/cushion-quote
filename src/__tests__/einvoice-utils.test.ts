import { describe, expect, it } from "vitest";

import type { EInvoiceEventRecord, EInvoiceRecord, VersionLineRecord } from "@/lib/types";
import {
  buildEInvoiceItemsFromVersionLines,
  eInvoiceEventRecordToRow,
  eInvoiceEventRowToRecord,
  eInvoiceRecordToRow,
  eInvoiceRowToRecord,
  generateEInvoiceEventId,
  generateEInvoiceId,
  parseEInvoiceItems,
} from "@/lib/einvoice-utils";

function makeInvoiceRecord(overrides: Partial<EInvoiceRecord> = {}): EInvoiceRecord {
  return {
    invoiceId: "INV-20260422-001",
    retryOfInvoiceId: "",
    sourceType: "ar",
    sourceId: "AR-202604-001",
    sourceSubId: "",
    quoteId: "Q-001",
    versionId: "Q-001-V01",
    caseId: "CA-001",
    clientId: "CL-001",
    buyerType: "b2b",
    buyerName: "馬鈴薯沙發",
    buyerTaxId: "85164778",
    buyerAddress: "台北市大安區測試路 1 號",
    email: "test@example.com",
    carrierType: "none",
    carrierValue: "",
    donationCode: "",
    invoiceDate: "2026-04-22",
    taxType: 0,
    untaxedAmount: 1000,
    taxAmount: 50,
    totalAmount: 1050,
    taxRate: 5,
    itemCount: 1,
    itemsJson: JSON.stringify([{ name: "沙發換布", quantity: 1, unitPrice: 1000, amount: 1000, remark: "", taxType: 0 }]),
    content: "測試開票",
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
    createdBy: "tester",
    createdAt: "2026-04-22T10:00:00.000Z",
    updatedAt: "2026-04-22T10:00:00.000Z",
    ...overrides,
  };
}

function makeEventRecord(overrides: Partial<EInvoiceEventRecord> = {}): EInvoiceEventRecord {
  return {
    eventId: "INV-20260422-001-EVT-20260422100000000",
    invoiceId: "INV-20260422-001",
    eventType: "draft_created",
    fromStatus: "",
    toStatus: "draft",
    message: "建立草稿",
    requestJson: "",
    responseJson: "",
    actor: "tester",
    occurredAt: "2026-04-22T10:00:00.000Z",
    ...overrides,
  };
}

describe("einvoice-utils", () => {
  it("invoice row roundtrip", () => {
    const original = makeInvoiceRecord();
    expect(eInvoiceRowToRecord(eInvoiceRecordToRow(original))).toEqual(original);
  });

  it("invoice row backward compatibility without buyerAddress column", () => {
    const original = makeInvoiceRecord();
    const legacyRow = eInvoiceRecordToRow(original).slice(0, -1);

    expect(eInvoiceRowToRecord(legacyRow)).toEqual({
      ...original,
      buyerAddress: "",
    });
  });

  it("event row roundtrip", () => {
    const original = makeEventRecord();
    expect(eInvoiceEventRowToRecord(eInvoiceEventRecordToRow(original))).toEqual(original);
  });

  it("generateEInvoiceId 依當日序號遞增", () => {
    const rows = [["INV-20260422-001"], ["INV-20260422-003"]];
    expect(generateEInvoiceId(rows, new Date("2026-04-22T10:00:00Z"))).toMatch(/^INV-20260422-004-\d{3}$/);
  });

  it("generateEInvoiceEventId 產生可追蹤事件 ID", () => {
    expect(generateEInvoiceEventId("INV-20260422-001", new Date("2026-04-22T10:00:00Z"))).toBe(
      "INV-20260422-001-EVT-20260422100000000",
    );
  });

  it("parseEInvoiceItems 安全解析 JSON", () => {
    const items = parseEInvoiceItems(
      JSON.stringify([{ name: "沙發換布", quantity: 2, unitPrice: 500, amount: 1000, remark: "備註", taxType: 0 }]),
    );
    expect(items).toEqual([{ name: "沙發換布", quantity: 2, unitPrice: 500, amount: 1000, remark: "備註", taxType: 0 }]);
  });

  it("buildEInvoiceItemsFromVersionLines 轉成開票品項快照", () => {
    const lines: VersionLineRecord[] = [{
      itemId: "I-001",
      versionId: "Q-001-V01",
      quoteId: "Q-001",
      caseId: "CA-001",
      lineNo: 1,
      itemName: "沙發換布",
      spec: "",
      materialId: "",
      qty: 2,
      unit: "式",
      unitPrice: 500,
      lineAmount: 1000,
      estimatedUnitCost: 0,
      estimatedCostAmount: 0,
      lineMarginAmount: 0,
      lineMarginRate: 0,
      isCostItem: false,
      showOnQuote: true,
      notes: "備註",
      imageUrl: "",
      specImageUrl: "",
      createdAt: "",
      updatedAt: "",
      installHeightTier: "",
      panelSizeTier: "",
      installSurchargeRate: 0,
      panelInputMode: "",
      surfaceWidthCm: 0,
      surfaceHeightCm: 0,
      splitDirection: "",
      splitCount: 0,
      caiRoundingMode: "",
      customSplitSizesCsv: "",
    }];

    expect(buildEInvoiceItemsFromVersionLines(lines)).toEqual([
      { name: "沙發換布", quantity: 2, unitPrice: 500, amount: 1000, remark: "備註", taxType: 0 },
    ]);
  });
});
