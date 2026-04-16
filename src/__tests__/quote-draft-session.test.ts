import { describe, expect, it } from "vitest";

import {
  LEGACY_AUTO_DRAFT_KEY,
  LEGACY_QUOTE_TO_LOAD_KEY,
  QUOTE_DRAFT_SESSION_KEY,
  QUOTE_DRAFT_TTL_MS,
  QUOTE_LOAD_REQUEST_KEY,
  buildQuoteDraftSignature,
  consumeQuoteDraftSession,
  consumeQuoteLoadRequest,
  createQuoteDraftSession,
  createQuoteLoadRequest,
  isQuoteDraftSessionExpired,
  readQuoteLoadRequest,
  writeQuoteDraftSession,
  writeQuoteLoadRequest,
} from "@/lib/quote-draft-session";
import type { QuoteDraftComparable } from "@/lib/types";

class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

function buildComparable(): QuoteDraftComparable {
  return {
    selectedClientId: "client-1",
    companyName: "Potato Sofa",
    contactName: "Mao",
    phone: "0912",
    taxId: "12345678",
    projectName: "客廳主牆",
    quoteName: "方案 A",
    email: "test@example.com",
    address: "Taipei",
    channel: "retail",
    leadSource: "unknown",
    leadSourceDetail: "",
    leadSourceContact: "",
    leadSourceNotes: "",
    items: [
      {
        id: "item-1",
        name: "繃布",
        spec: "280x120",
        qty: 1,
        unit: "式",
        unitPrice: 100,
        amount: 100,
        isCostItem: false,
        notes: "",
      },
    ],
    description: "desc",
    descriptionImageUrl: "",
    includeTax: true,
    termsTemplate: "term",
    commissionOverride: null,
    commissionPartners: [],
  };
}

describe("quote draft session helpers", () => {
  it("ignores item identity when building draft signatures", () => {
    const left = buildComparable();
    const right = {
      ...left,
      items: left.items.map((item) => ({ ...item, id: "item-2" })),
    };

    expect(buildQuoteDraftSignature(left)).toBe(buildQuoteDraftSignature(right));
  });

  it("migrates legacy quote-to-load payloads when consumed", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      LEGACY_QUOTE_TO_LOAD_KEY,
      JSON.stringify({ caseId: "case-1", quoteId: "quote-1", versionId: "version-1" }),
    );

    const request = consumeQuoteLoadRequest(storage);

    expect(request).toMatchObject({
      caseId: "case-1",
      quoteId: "quote-1",
      versionId: "version-1",
      source: "quote-editor-copy",
    });
    expect(storage.getItem(LEGACY_QUOTE_TO_LOAD_KEY)).toBeNull();
  });

  it("reads modern load requests unchanged", () => {
    const storage = new MemoryStorage();
    const request = createQuoteLoadRequest({
      source: "quotes-list",
      caseId: "case-2",
      quoteId: "quote-2",
      versionId: "version-2",
    });
    writeQuoteLoadRequest(storage, request);

    expect(consumeQuoteLoadRequest(storage)).toEqual(request);
    expect(storage.getItem(QUOTE_LOAD_REQUEST_KEY)).toBeNull();
  });

  it("reads load requests without clearing them", () => {
    const storage = new MemoryStorage();
    const request = createQuoteLoadRequest({
      source: "cases-list",
      caseId: "case-22",
      quoteId: "quote-22",
      versionId: "version-22",
    });
    writeQuoteLoadRequest(storage, request);

    expect(readQuoteLoadRequest(storage)).toEqual(request);
    expect(storage.getItem(QUOTE_LOAD_REQUEST_KEY)).not.toBeNull();
  });

  it("migrates legacy auto drafts into the new session shape", () => {
    const storage = new MemoryStorage();
    const comparable = buildComparable();
    storage.setItem(
      LEGACY_AUTO_DRAFT_KEY,
      JSON.stringify({
        savedAt: new Date().toISOString(),
        caseId: "case-3",
        quoteId: "quote-3",
        versionId: "version-3",
        versionNo: 2,
        versionLabel: "V02",
        isEditMode: true,
        ...comparable,
      }),
    );

    const session = consumeQuoteDraftSession(storage);

    expect(session).toMatchObject({
      caseId: "case-3",
      quoteId: "quote-3",
      versionId: "version-3",
      versionNo: 2,
      versionLabel: "V02",
      source: "restored-legacy-draft",
    });
    expect(session?.signature).toBe(buildQuoteDraftSignature(comparable));
    expect(storage.getItem(QUOTE_DRAFT_SESSION_KEY)).not.toBeNull();
    expect(storage.getItem(LEGACY_AUTO_DRAFT_KEY)).toBeNull();
  });

  it("treats outdated draft sessions as expired", () => {
    const comparable = buildComparable();
    const session = createQuoteDraftSession({
      source: "new-quote",
      caseId: "",
      quoteId: "CQ-1",
      versionId: "",
      versionNo: 1,
      versionLabel: "",
      isEditMode: false,
      comparable,
      savedAt: new Date(Date.now() - QUOTE_DRAFT_TTL_MS - 1000).toISOString(),
    });

    expect(isQuoteDraftSessionExpired(session)).toBe(true);
  });

  it("round-trips modern draft sessions", () => {
    const storage = new MemoryStorage();
    const session = createQuoteDraftSession({
      source: "new-quote",
      caseId: "",
      quoteId: "CQ-2",
      versionId: "",
      versionNo: 1,
      versionLabel: "",
      isEditMode: false,
      comparable: buildComparable(),
    });

    writeQuoteDraftSession(storage, session);

    expect(consumeQuoteDraftSession(storage)).toEqual(session);
  });

  it("preserves lead source detail in draft sessions", () => {
    const storage = new MemoryStorage();
    const session = createQuoteDraftSession({
      source: "new-quote",
      caseId: "case-9",
      quoteId: "CQ-9",
      versionId: "",
      versionNo: 1,
      versionLabel: "",
      isEditMode: false,
      comparable: {
        ...buildComparable(),
        leadSource: "association_network",
        leadSourceDetail: "BNI",
      },
    });

    writeQuoteDraftSession(storage, session);

    expect(consumeQuoteDraftSession(storage)?.leadSourceDetail).toBe("BNI");
  });
});
