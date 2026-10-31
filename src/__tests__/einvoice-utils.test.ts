import { describe, expect, it } from "vitest";

import type { EInvoiceEventRecord, EInvoiceRecord, VersionLineRecord } from "@/lib/types";
import {
  buildEInvoiceItemsFromVersionLines,
  eInvoiceEventRecordToRow,
  eInvoiceEventRowToRecord,
  eInvoiceRecordToRow,
  eInvoiceRowToRecord,
  findPossibleDuplicateInvoices,
  generateEInvoiceEventId,
  generateEInvoiceId,
  isInvoiceExemptTaxRate,
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
    internalNote: "",
    overallRemark: "",
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

describe("isInvoiceExemptTaxRate", () => {
  it("稅率 0（現金價）視為免開票", () => {
    expect(isInvoiceExemptTaxRate(0)).toBe(true);
  });

  it("有稅率的版本需要開票（百分比或小數皆同）", () => {
    expect(isInvoiceExemptTaxRate(5)).toBe(false);
    expect(isInvoiceExemptTaxRate(0.05)).toBe(false);
  });
});

describe("findPossibleDuplicateInvoices", () => {
  const now = new Date("2026-10-31T12:00:00+08:00");

  it("同買方（去空白）＋同金額＋60 天內的有效發票視為可能重複", () => {
    const records = [
      makeInvoiceRecord({ invoiceId: "A", buyerName: " 王小明 ", totalAmount: 5000, invoiceDate: "2026-10-20", status: "issued" }),
      makeInvoiceRecord({ invoiceId: "B", buyerName: "王小明", totalAmount: 5000, invoiceDate: "2026-10-30", status: "needs_review" }),
      makeInvoiceRecord({ invoiceId: "C", buyerName: "王小明", totalAmount: 5000, invoiceDate: "2026-10-30", status: "draft" }),
      makeInvoiceRecord({ invoiceId: "D", buyerName: "王小明", totalAmount: 5000, invoiceDate: "2026-10-30", status: "issuing" }),
    ];
    const result = findPossibleDuplicateInvoices({ buyerName: "王小明", totalAmount: 5000 }, records, now);
    expect(result.map((r) => r.invoiceId)).toEqual(["A", "B", "C", "D"]);
  });

  it("排除失敗、作廢、金額不同、買方不同、超過 60 天的紀錄", () => {
    const records = [
      makeInvoiceRecord({ invoiceId: "failed", buyerName: "王小明", totalAmount: 5000, invoiceDate: "2026-10-30", status: "failed" }),
      makeInvoiceRecord({ invoiceId: "cancelled", buyerName: "王小明", totalAmount: 5000, invoiceDate: "2026-10-30", status: "cancelled" }),
      makeInvoiceRecord({ invoiceId: "amount", buyerName: "王小明", totalAmount: 5001, invoiceDate: "2026-10-30", status: "issued" }),
      makeInvoiceRecord({ invoiceId: "buyer", buyerName: "王大明", totalAmount: 5000, invoiceDate: "2026-10-30", status: "issued" }),
      makeInvoiceRecord({ invoiceId: "old", buyerName: "王小明", totalAmount: 5000, invoiceDate: "2026-08-01", status: "issued" }),
    ];
    expect(findPossibleDuplicateInvoices({ buyerName: "王小明", totalAmount: 5000 }, records, now)).toEqual([]);
  });

  it("買方名稱空白時不比對", () => {
    const records = [makeInvoiceRecord({ buyerName: "", totalAmount: 5000, invoiceDate: "2026-10-30", status: "issued" })];
    expect(findPossibleDuplicateInvoices({ buyerName: "  ", totalAmount: 5000 }, records, now)).toEqual([]);
  });
});
