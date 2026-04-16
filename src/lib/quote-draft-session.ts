import type {
  FlexQuoteItem,
  LeadSource,
  QuoteDraftComparable,
  QuoteDraftSession,
  QuoteDraftSessionSource,
  QuoteLoadRequest,
  QuoteLoadRequestSource,
} from "@/lib/types";

export const QUOTE_DRAFT_SESSION_KEY = "quote-draft-session";
export const QUOTE_LOAD_REQUEST_KEY = "quote-load-request";
export const LEGACY_AUTO_DRAFT_KEY = "quote-auto-draft";
export const LEGACY_QUOTE_TO_LOAD_KEY = "quote-to-load";
export const QUOTE_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type LegacyQuoteToLoad = {
  caseId?: string;
  quoteId?: string;
  versionId?: string;
};

type LegacyQuoteAutoDraft = Omit<QuoteDraftSession, "sessionId" | "source"> & {
  signature?: string;
};

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function normalizeLeadSource(value: unknown): LeadSource {
  if (value === "bni" || value === "rotary") {
    return "association_network";
  }

  return (value as LeadSource) ?? "unknown";
}

function normalizeLeadSourceDetail(source: unknown, detail: unknown): string {
  if (typeof detail === "string" && detail.length > 0) return detail;
  if (source === "bni") return "BNI";
  if (source === "rotary") return "扶輪社";
  return "";
}

function stripItemIdentity(item: FlexQuoteItem): Omit<FlexQuoteItem, "id"> {
  const { id: itemId, ...rest } = item;
  void itemId;
  return rest;
}

export function buildQuoteDraftSignature(comparable: QuoteDraftComparable): string {
  return JSON.stringify({
    ...comparable,
    items: comparable.items.map(stripItemIdentity),
  });
}

export function generateQuoteDraftSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createQuoteLoadRequest(input: {
  source: QuoteLoadRequestSource;
  caseId: string;
  quoteId: string;
  versionId: string;
}): QuoteLoadRequest {
  return {
    requestId: generateQuoteDraftSessionId(),
    createdAt: new Date().toISOString(),
    source: input.source,
    caseId: input.caseId,
    quoteId: input.quoteId,
    versionId: input.versionId,
  };
}

export function writeQuoteLoadRequest(storage: StorageLike, request: QuoteLoadRequest): void {
  storage.setItem(QUOTE_LOAD_REQUEST_KEY, JSON.stringify(request));
}

export function clearQuoteLoadRequest(storage: StorageLike): void {
  storage.removeItem(QUOTE_LOAD_REQUEST_KEY);
  storage.removeItem(LEGACY_QUOTE_TO_LOAD_KEY);
}

function isQuoteLoadRequest(value: unknown): value is QuoteLoadRequest {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<QuoteLoadRequest>;
  return (
    isNonEmptyString(candidate.caseId) &&
    isNonEmptyString(candidate.quoteId) &&
    isNonEmptyString(candidate.versionId) &&
    isNonEmptyString(candidate.requestId) &&
    isNonEmptyString(candidate.createdAt) &&
    isNonEmptyString(candidate.source)
  );
}

function migrateLegacyQuoteLoadRequest(value: unknown): QuoteLoadRequest | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as LegacyQuoteToLoad;
  if (!isNonEmptyString(candidate.caseId) || !isNonEmptyString(candidate.quoteId) || !isNonEmptyString(candidate.versionId)) {
    return null;
  }

  return createQuoteLoadRequest({
    source: "quote-editor-copy",
    caseId: candidate.caseId,
    quoteId: candidate.quoteId,
    versionId: candidate.versionId,
  });
}

export function readQuoteLoadRequest(storage: StorageLike): QuoteLoadRequest | null {
  const current = parseJson<unknown>(storage.getItem(QUOTE_LOAD_REQUEST_KEY));
  if (isQuoteLoadRequest(current)) {
    return current;
  }

  const legacy = migrateLegacyQuoteLoadRequest(parseJson<unknown>(storage.getItem(LEGACY_QUOTE_TO_LOAD_KEY)));
  if (!legacy) return null;

  return legacy;
}

export function consumeQuoteLoadRequest(storage: StorageLike): QuoteLoadRequest | null {
  const request = readQuoteLoadRequest(storage);
  if (!request) return null;

  clearQuoteLoadRequest(storage);
  return request;
}

export function isQuoteDraftSessionExpired(session: Pick<QuoteDraftSession, "savedAt">, now = Date.now()): boolean {
  const savedAtMs = new Date(session.savedAt).getTime();
  if (!Number.isFinite(savedAtMs)) return true;
  return now - savedAtMs > QUOTE_DRAFT_TTL_MS;
}

function isQuoteDraftSession(value: unknown): value is QuoteDraftSession {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<QuoteDraftSession>;
  return (
    isNonEmptyString(candidate.sessionId) &&
    isNonEmptyString(candidate.savedAt) &&
    isNonEmptyString(candidate.signature) &&
    isString(candidate.caseId) &&
    isString(candidate.quoteId) &&
    isString(candidate.versionId) &&
    isString(candidate.versionLabel) &&
    typeof candidate.versionNo === "number" &&
    typeof candidate.isEditMode === "boolean" &&
    Array.isArray(candidate.items) &&
    typeof candidate.includeTax === "boolean"
  );
}

function migrateLegacyAutoDraft(value: unknown): QuoteDraftSession | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<LegacyQuoteAutoDraft>;
  const normalizedLeadSource = normalizeLeadSource(candidate.leadSource);
  const normalizedLeadSourceDetail = normalizeLeadSourceDetail(candidate.leadSource, candidate.leadSourceDetail);
  if (
    !isNonEmptyString(candidate.savedAt) ||
    !Array.isArray(candidate.items) ||
    typeof candidate.versionNo !== "number" ||
    typeof candidate.isEditMode !== "boolean" ||
    typeof candidate.includeTax !== "boolean"
  ) {
    return null;
  }

  const comparable: QuoteDraftComparable = {
    selectedClientId: candidate.selectedClientId ?? "",
    companyName: candidate.companyName ?? "",
    contactName: candidate.contactName ?? "",
    phone: candidate.phone ?? "",
    taxId: candidate.taxId ?? "",
    projectName: candidate.projectName ?? "",
    quoteName: candidate.quoteName ?? "",
    email: candidate.email ?? "",
    address: candidate.address ?? "",
    channel: candidate.channel ?? "retail",
    leadSource: normalizedLeadSource,
    leadSourceDetail: normalizedLeadSourceDetail,
    leadSourceContact: candidate.leadSourceContact ?? "",
    leadSourceNotes: candidate.leadSourceNotes ?? "",
    items: candidate.items,
    description: candidate.description ?? "",
    descriptionImageUrl: candidate.descriptionImageUrl ?? "",
    includeTax: candidate.includeTax,
    termsTemplate: candidate.termsTemplate ?? "",
    commissionOverride: candidate.commissionOverride ?? null,
    commissionPartners: candidate.commissionPartners ?? [],
  };

  return {
    sessionId: generateQuoteDraftSessionId(),
    savedAt: candidate.savedAt,
    signature: candidate.signature ?? buildQuoteDraftSignature(comparable),
    caseId: candidate.caseId ?? "",
    quoteId: candidate.quoteId ?? "",
    versionId: candidate.versionId ?? "",
    versionNo: candidate.versionNo,
    versionLabel: candidate.versionLabel ?? "",
    isEditMode: candidate.isEditMode,
    source: "restored-legacy-draft",
    ...comparable,
  };
}

export function writeQuoteDraftSession(storage: StorageLike, session: QuoteDraftSession): void {
  storage.setItem(QUOTE_DRAFT_SESSION_KEY, JSON.stringify(session));
}

export function clearQuoteDraftSession(storage: StorageLike): void {
  storage.removeItem(QUOTE_DRAFT_SESSION_KEY);
  storage.removeItem(LEGACY_AUTO_DRAFT_KEY);
}

export function consumeQuoteDraftSession(storage: StorageLike): QuoteDraftSession | null {
  const current = parseJson<unknown>(storage.getItem(QUOTE_DRAFT_SESSION_KEY));
  if (isQuoteDraftSession(current)) {
    const normalizedSession: QuoteDraftSession = {
      ...current,
      leadSource: normalizeLeadSource(current.leadSource),
      leadSourceDetail: normalizeLeadSourceDetail(current.leadSource, current.leadSourceDetail),
    };
    if (isQuoteDraftSessionExpired(current)) {
      clearQuoteDraftSession(storage);
      return null;
    }

    if (
      normalizedSession.leadSource !== current.leadSource ||
      normalizedSession.leadSourceDetail !== current.leadSourceDetail
    ) {
      writeQuoteDraftSession(storage, normalizedSession);
    }

    return normalizedSession;
  }

  const legacy = migrateLegacyAutoDraft(parseJson<unknown>(storage.getItem(LEGACY_AUTO_DRAFT_KEY)));
  if (!legacy) return null;
  if (isQuoteDraftSessionExpired(legacy)) {
    clearQuoteDraftSession(storage);
    return null;
  }

  writeQuoteDraftSession(storage, legacy);
  storage.removeItem(LEGACY_AUTO_DRAFT_KEY);
  return legacy;
}

export function createQuoteDraftSession(input: {
  sessionId?: string;
  source: QuoteDraftSessionSource;
  caseId: string;
  quoteId: string;
  versionId: string;
  versionNo: number;
  versionLabel: string;
  isEditMode: boolean;
  comparable: QuoteDraftComparable;
  signature?: string;
  savedAt?: string;
}): QuoteDraftSession {
  const signature = input.signature ?? buildQuoteDraftSignature(input.comparable);

  return {
    sessionId: input.sessionId ?? generateQuoteDraftSessionId(),
    savedAt: input.savedAt ?? new Date().toISOString(),
    signature,
    caseId: input.caseId,
    quoteId: input.quoteId,
    versionId: input.versionId,
    versionNo: input.versionNo,
    versionLabel: input.versionLabel,
    isEditMode: input.isEditMode,
    source: input.source,
    ...input.comparable,
  };
}
