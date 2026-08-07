import "server-only";

import { getSheetsClient } from "@/lib/sheets-client";
import type { SigningLink, SigningLinkStatus } from "@/lib/signing-types";

const SHEET = "簽署連結";
const RANGE_FULL = `${SHEET}!A:N`;
const RANGE_DATA = `${SHEET}!A2:N`;
const RANGE_TOKENS = `${SHEET}!A2:A`;

const SHEET_HEADERS = [
  "token", "versionId", "quoteId", "caseId", "status", "unsignedPdfUrl",
  "createdAt", "createdBy", "expiresAt", "signedAt", "signerName", "signerIp",
  "signerUserAgent", "signedPdfUrl",
];

function rowToLink(row: string[]): SigningLink {
  return {
    token:           row[0] ?? "",
    versionId:       row[1] ?? "",
    quoteId:         row[2] ?? "",
    caseId:          row[3] ?? "",
    status:          (row[4] as SigningLinkStatus) || "pending",
    unsignedPdfUrl:  row[5] ?? "",
    createdAt:       row[6] ?? "",
    createdBy:       row[7] ?? "",
    expiresAt:       row[8] ?? "",
    signedAt:        row[9] ?? "",
    signerName:      row[10] ?? "",
    signerIp:        row[11] ?? "",
    signerUserAgent: row[12] ?? "",
    signedPdfUrl:    row[13] ?? "",
  };
}

function linkToRow(link: SigningLink): string[] {
  return [
    link.token, link.versionId, link.quoteId, link.caseId, link.status,
    link.unsignedPdfUrl, link.createdAt, link.createdBy, link.expiresAt,
    link.signedAt, link.signerName, link.signerIp, link.signerUserAgent,
    link.signedPdfUrl,
  ];
}

type SheetsClient = NonNullable<Awaited<ReturnType<typeof getSheetsClient>>>;

async function ensureSheetExists(client: SheetsClient): Promise<void> {
  const meta = await client.sheets.spreadsheets.get({ spreadsheetId: client.spreadsheetId });
  const exists = (meta.data.sheets ?? []).some((s) => s.properties?.title === SHEET);
  if (!exists) {
    await client.sheets.spreadsheets.batchUpdate({
      spreadsheetId: client.spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: SHEET } } }] },
    });
    await client.sheets.spreadsheets.values.update({
      spreadsheetId: client.spreadsheetId,
      range: `${SHEET}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [SHEET_HEADERS] },
    });
  }
}

async function listLinks(client: SheetsClient): Promise<SigningLink[]> {
  const res = await client.sheets.spreadsheets.values.get({
    spreadsheetId: client.spreadsheetId,
    range: RANGE_DATA,
  });
  return (res.data.values ?? []).map((r) => rowToLink(r as string[])).filter((l) => l.token);
}

async function findRowNumber(client: SheetsClient, token: string): Promise<number> {
  const res = await client.sheets.spreadsheets.values.get({
    spreadsheetId: client.spreadsheetId,
    range: RANGE_TOKENS,
  });
  const idx = (res.data.values ?? []).flat().indexOf(token);
  return idx === -1 ? -1 : idx + 2; // +2: header row + 1-based
}

export async function createSigningLink(link: SigningLink): Promise<SigningLink | null> {
  const client = await getSheetsClient();
  if (!client) return null;
  await ensureSheetExists(client);
  await client.sheets.spreadsheets.values.append({
    spreadsheetId: client.spreadsheetId,
    range: RANGE_FULL,
    valueInputOption: "RAW",
    requestBody: { values: [linkToRow(link)] },
  });
  return link;
}

export async function getSigningLinkByToken(token: string): Promise<SigningLink | null> {
  const client = await getSheetsClient();
  if (!client) return null;
  try {
    const links = await listLinks(client);
    return links.find((l) => l.token === token) ?? null;
  } catch {
    return null;
  }
}

export async function updateSigningLink(
  token: string,
  patch: Partial<Omit<SigningLink, "token">>,
): Promise<SigningLink | null> {
  const client = await getSheetsClient();
  if (!client) return null;
  const rowNumber = await findRowNumber(client, token);
  if (rowNumber === -1) return null;
  const links = await listLinks(client);
  const current = links.find((l) => l.token === token);
  if (!current) return null;
  const updated: SigningLink = { ...current, ...patch };
  await client.sheets.spreadsheets.values.update({
    spreadsheetId: client.spreadsheetId,
    range: `${SHEET}!A${rowNumber}:N${rowNumber}`,
    valueInputOption: "RAW",
    requestBody: { values: [linkToRow(updated)] },
  });
  return updated;
}

/** 產生新連結前，把同一版本尚在 pending 的舊連結作廢，確保一次只有一個有效連結。 */
export async function revokePendingLinksForVersion(versionId: string): Promise<void> {
  const client = await getSheetsClient();
  if (!client) return;
  try {
    const links = await listLinks(client);
    const stale = links.filter((l) => l.versionId === versionId && l.status === "pending");
    for (const l of stale) {
      await updateSigningLink(l.token, { status: "revoked" });
    }
  } catch {
    /* best-effort */
  }
}
