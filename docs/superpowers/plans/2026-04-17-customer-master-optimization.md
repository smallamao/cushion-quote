# 客戶主檔優化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the customer master file from a flat Client model to a Company + Contact two-tier architecture, add business card OCR via Gemini Flash, optimize the list page with filters, and replace the inline form with a slide-out detail panel.

**Architecture:** Company data stays in the existing "客戶資料庫" sheet (columns trimmed to company-level fields). A new "聯絡人" sheet stores contacts linked by `companyId`. A backward-compatible `Client` type alias maps Company + primary Contact for existing QuoteEditor consumption. Business card images upload to Google Drive via the existing service account; Gemini Flash extracts structured contact data from the image.

**Tech Stack:** Next.js 15 + React 19, Google Sheets API (googleapis), Google Drive API (googleapis), Gemini Flash API (@google/generative-ai), Radix UI (Tabs, Dialog), Tailwind CSS.

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/lib/types/company.ts` | `Company` and `Contact` interfaces, `CompanyWithPrimaryContact` type |
| `src/lib/drive-client.ts` | Google Drive upload helper (reuses existing service account auth) |
| `src/lib/gemini-client.ts` | Gemini Flash vision API helper for business card OCR |
| `src/app/api/sheets/contacts/route.ts` | Contact CRUD API (GET, POST, PATCH, DELETE) |
| `src/app/api/business-card/recognize/route.ts` | Business card upload + OCR + Drive storage API |
| `src/hooks/useCompanies.ts` | Company list with search/filter/sort + cache |
| `src/hooks/useContacts.ts` | Contact list per company + CRUD |
| `src/hooks/useBusinessCardRecognition.ts` | Business card upload/OCR state management |
| `src/components/clients/CompanyListPanel.tsx` | Redesigned list page with filters |
| `src/components/clients/CompanyDetailPanel.tsx` | Slide-out detail panel shell with tabs |
| `src/components/clients/CompanyInfoTab.tsx` | Tab 1: company data inline editing |
| `src/components/clients/ContactsTab.tsx` | Tab 2: contact cards + CRUD |
| `src/components/clients/ContactCard.tsx` | Single contact card with inline edit |
| `src/components/clients/QuoteHistoryTab.tsx` | Tab 3: quote history (refactored from dialog) |
| `src/components/clients/BusinessCardUpload.tsx` | Business card upload + OCR preview UI |

### Modified Files

| File | Changes |
|------|---------|
| `src/lib/types.ts` | Keep `Client` as alias, add re-exports from `company.ts` |
| `src/lib/sheets-client.ts` | Export `getDriveClient()` alongside existing `getSheetsClient()` |
| `src/app/api/sheets/clients/route.ts` | Rewrite to use Company schema, include primaryContact summary in GET |
| `src/app/api/sheets/init/route.ts` | Add "聯絡人" sheet definition |
| `src/hooks/useClients.ts` | Thin wrapper around `useCompanies` for backward compat |
| `src/components/clients/ClientsManagementPanel.tsx` | Replace with `CompanyListPanel` |
| `src/app/settings/SettingsClient.tsx` | Swap `ClientsManagementPanel` for `CompanyListPanel` |
| `src/components/quote-editor/QuoteEditor.tsx` | Update `selectClient` to use Company + Contact |
| `src/lib/constants.ts` | Add `CONTACT_ROLE_SUGGESTIONS` |
| `package.json` | Add `@google/generative-ai` dependency |

---

## Task 1: Add Gemini dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install @google/generative-ai**

```bash
cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價
npm install @google/generative-ai
```

- [ ] **Step 2: Verify installation**

```bash
cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價
node -e "require('@google/generative-ai')" && echo "OK"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價
git add package.json package-lock.json
git commit -m "chore: add @google/generative-ai for business card OCR"
```

---

## Task 2: Define Company and Contact types

**Files:**
- Create: `src/lib/types/company.ts`
- Modify: `src/lib/types.ts`
- Modify: `src/lib/constants.ts`

- [ ] **Step 1: Create company types file**

Create `src/lib/types/company.ts`:

```typescript
import type { Channel, ClientType, CommissionMode } from "../types";

export interface Company {
  id: string;
  companyName: string;
  shortName: string;
  clientType: ClientType;
  channel: Channel;
  address: string;
  taxId: string;
  commissionMode: CommissionMode | "default";
  commissionRate: number;
  commissionFixedAmount: number;
  paymentTerms: string;
  defaultNotes: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  notes: string;
}

export interface Contact {
  id: string;
  companyId: string;
  name: string;
  role: string;
  phone: string;
  phone2: string;
  lineId: string;
  email: string;
  businessCardUrl: string;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyWithContacts extends Company {
  contacts: Contact[];
}

export interface CompanyWithPrimaryContact extends Company {
  primaryContact: Contact | null;
}

export function companyToClient(
  company: Company,
  primaryContact: Contact | null,
): import("../types").Client {
  return {
    id: company.id,
    companyName: company.companyName,
    shortName: company.shortName,
    clientType: company.clientType,
    channel: company.channel,
    contactName: primaryContact?.name ?? "",
    phone: primaryContact?.phone ?? "",
    phone2: primaryContact?.phone2 ?? "",
    lineId: primaryContact?.lineId ?? "",
    email: primaryContact?.email ?? "",
    address: company.address,
    taxId: company.taxId,
    commissionMode: company.commissionMode,
    commissionRate: company.commissionRate,
    commissionFixedAmount: company.commissionFixedAmount,
    paymentTerms: company.paymentTerms,
    defaultNotes: company.defaultNotes,
    isActive: company.isActive,
    createdAt: company.createdAt,
    updatedAt: company.updatedAt,
    notes: company.notes,
  };
}
```

- [ ] **Step 2: Add re-exports and keep Client as-is in types.ts**

In `src/lib/types.ts`, add at the end (after the existing `Client` interface):

```typescript
// Re-export Company/Contact types
export type { Company, Contact, CompanyWithContacts, CompanyWithPrimaryContact } from "./types/company";
export { companyToClient } from "./types/company";
```

The existing `Client` interface stays unchanged — it continues to work as the backward-compatible shape.

- [ ] **Step 3: Add contact role suggestions to constants**

In `src/lib/constants.ts`, add after `CLIENT_TYPE_LABELS`:

```typescript
export const CONTACT_ROLE_SUGGESTIONS = [
  "老闆",
  "採購",
  "設計師",
  "工程",
  "業務",
  "會計",
  "其他",
] as const;
```

- [ ] **Step 4: Verify types compile**

```bash
cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價
git add src/lib/types/company.ts src/lib/types.ts src/lib/constants.ts
git commit -m "feat(types): add Company and Contact interfaces for two-tier customer model"
```

---

## Task 3: Add "聯絡人" sheet to init route

**Files:**
- Modify: `src/app/api/sheets/init/route.ts`

- [ ] **Step 1: Add contact sheet definition**

In `src/app/api/sheets/init/route.ts`, add a new entry to the `SHEET_DEFINITIONS` array (after the "客戶資料庫" entry):

```typescript
  {
    title: "聯絡人",
    headers: ["編號", "公司ID", "姓名", "角色", "電話", "備用電話", "LINE", "Email", "名片圖片", "主要聯絡人", "建立日期", "更新日期"],
  },
```

- [ ] **Step 2: Verify build**

```bash
cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價
git add src/app/api/sheets/init/route.ts
git commit -m "feat(sheets): add 聯絡人 sheet definition to init route"
```

---

## Task 4: Create Contacts API route

**Files:**
- Create: `src/app/api/sheets/contacts/route.ts`

- [ ] **Step 1: Create the contacts route**

Create `src/app/api/sheets/contacts/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import type { Contact } from "@/lib/types";

const SHEET = "聯絡人";
const RANGE = `${SHEET}!A2:L`;
const COLUMNS = "A:L";

function rowToContact(row: string[]): Contact {
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

function contactToRow(c: Contact): string[] {
  return [
    c.id,
    c.companyId,
    c.name,
    c.role,
    c.phone,
    c.phone2,
    c.lineId,
    c.email,
    c.businessCardUrl,
    c.isPrimary ? "TRUE" : "FALSE",
    c.createdAt,
    c.updatedAt,
  ];
}

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ contacts: [] });
  }

  try {
    const response = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: RANGE,
    });
    let contacts = (response.data.values ?? []).map(rowToContact);
    if (companyId) {
      contacts = contacts.filter((c) => c.companyId === companyId);
    }
    return NextResponse.json({ contacts });
  } catch {
    return NextResponse.json({ contacts: [] });
  }
}

export async function POST(request: Request) {
  const payload = (await request.json()) as Contact;
  const now = new Date().toISOString().slice(0, 10);
  payload.createdAt = now;
  payload.updatedAt = now;

  const sheetsClient = await getSheetsClient();
  if (!sheetsClient) {
    return NextResponse.json(
      { ok: false, error: "Google Sheets 未設定" },
      { status: 503 },
    );
  }

  try {
    // If this contact is marked primary, unset other primaries for same company
    if (payload.isPrimary) {
      await unsetOtherPrimaries(sheetsClient, payload.companyId, payload.id);
    }

    await sheetsClient.sheets.spreadsheets.values.append({
      spreadsheetId: sheetsClient.spreadsheetId,
      range: `${SHEET}!${COLUMNS}`,
      valueInputOption: "RAW",
      requestBody: { values: [contactToRow(payload)] },
    });
    return NextResponse.json({ ok: true, contact: payload }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const payload = (await request.json()) as Contact;
  payload.updatedAt = new Date().toISOString().slice(0, 10);

  const sheetsClient = await getSheetsClient();
  if (!sheetsClient) {
    return NextResponse.json(
      { ok: false, error: "Google Sheets 未設定" },
      { status: 503 },
    );
  }

  try {
    const response = await sheetsClient.sheets.spreadsheets.values.get({
      spreadsheetId: sheetsClient.spreadsheetId,
      range: `${SHEET}!A2:A`,
    });
    const ids = (response.data.values ?? []).flat();
    const rowIndex = ids.indexOf(payload.id);
    if (rowIndex === -1) {
      return NextResponse.json(
        { ok: false, error: "contact not found" },
        { status: 404 },
      );
    }

    if (payload.isPrimary) {
      await unsetOtherPrimaries(sheetsClient, payload.companyId, payload.id);
    }

    const sheetRow = rowIndex + 2;
    await sheetsClient.sheets.spreadsheets.values.update({
      spreadsheetId: sheetsClient.spreadsheetId,
      range: `${SHEET}!A${sheetRow}:L${sheetRow}`,
      valueInputOption: "RAW",
      requestBody: { values: [contactToRow(payload)] },
    });
    return NextResponse.json({ ok: true, contact: payload });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { id } = (await request.json()) as { id: string };

  const sheetsClient = await getSheetsClient();
  if (!sheetsClient) {
    return NextResponse.json(
      { ok: false, error: "Google Sheets 未設定" },
      { status: 503 },
    );
  }

  try {
    const response = await sheetsClient.sheets.spreadsheets.values.get({
      spreadsheetId: sheetsClient.spreadsheetId,
      range: `${SHEET}!A2:A`,
    });
    const ids = (response.data.values ?? []).flat();
    const rowIndex = ids.indexOf(id);
    if (rowIndex === -1) {
      return NextResponse.json(
        { ok: false, error: "contact not found" },
        { status: 404 },
      );
    }

    const sheetRow = rowIndex + 2;
    // Clear the row (Google Sheets API doesn't have row delete via values API)
    await sheetsClient.sheets.spreadsheets.values.clear({
      spreadsheetId: sheetsClient.spreadsheetId,
      range: `${SHEET}!A${sheetRow}:L${sheetRow}`,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

async function unsetOtherPrimaries(
  sheetsClient: { sheets: import("googleapis").sheets_v4.Sheets; spreadsheetId: string },
  companyId: string,
  excludeContactId: string,
) {
  const response = await sheetsClient.sheets.spreadsheets.values.get({
    spreadsheetId: sheetsClient.spreadsheetId,
    range: RANGE,
  });
  const rows = response.data.values ?? [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row[1] === companyId && row[0] !== excludeContactId && row[9] === "TRUE") {
      const sheetRow = i + 2;
      await sheetsClient.sheets.spreadsheets.values.update({
        spreadsheetId: sheetsClient.spreadsheetId,
        range: `${SHEET}!J${sheetRow}`,
        valueInputOption: "RAW",
        requestBody: { values: [["FALSE"]] },
      });
    }
  }
}
```

- [ ] **Step 2: Verify build**

```bash
cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價
git add src/app/api/sheets/contacts/route.ts
git commit -m "feat(api): add contacts CRUD route with primary contact management"
```

---

## Task 5: Rewrite clients API for Company schema

**Files:**
- Modify: `src/app/api/sheets/clients/route.ts`

- [ ] **Step 1: Rewrite route to serve Company + primaryContact**

Replace the entire contents of `src/app/api/sheets/clients/route.ts`:

```typescript
import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import type { Channel, ClientType, CommissionMode } from "@/lib/types";
import type { Company, Contact, CompanyWithPrimaryContact } from "@/lib/types/company";
import { companyToClient } from "@/lib/types/company";

// --- Company mapping (new 16-column schema: A:P) ---

function rowToCompany(row: string[]): Company {
  return {
    id: row[0] ?? "",
    companyName: row[1] ?? "",
    shortName: row[2] ?? "",
    clientType: (row[3] as ClientType) ?? "other",
    channel: (row[4] as Channel) ?? "wholesale",
    address: row[5] ?? "",
    taxId: row[6] ?? "",
    commissionMode: (row[7] as CommissionMode | "default") ?? "default",
    commissionRate: Number(row[8] ?? 0),
    paymentTerms: row[9] ?? "",
    defaultNotes: row[10] ?? "",
    isActive: row[11] !== "FALSE",
    createdAt: row[12] ?? "",
    updatedAt: row[13] ?? "",
    notes: row[14] ?? "",
    commissionFixedAmount: Number(row[15] ?? 0),
  };
}

function companyToRow(c: Company): string[] {
  return [
    c.id,
    c.companyName,
    c.shortName,
    c.clientType,
    c.channel,
    c.address,
    c.taxId,
    c.commissionMode,
    String(c.commissionRate),
    c.paymentTerms,
    c.defaultNotes,
    c.isActive ? "TRUE" : "FALSE",
    c.createdAt,
    c.updatedAt,
    c.notes,
    String(c.commissionFixedAmount),
  ];
}

// --- Legacy 21-column mapping (for reading old data before migration) ---

function legacyRowToCompany(row: string[]): Company {
  return {
    id: row[0] ?? "",
    companyName: row[1] ?? "",
    shortName: row[2] ?? "",
    clientType: (row[3] as ClientType) ?? "other",
    channel: (row[4] as Channel) ?? "wholesale",
    address: row[10] ?? "",
    taxId: row[11] ?? "",
    commissionMode: (row[12] as CommissionMode | "default") ?? "default",
    commissionRate: Number(row[13] ?? 0),
    paymentTerms: row[14] ?? "",
    defaultNotes: row[15] ?? "",
    isActive: row[16] !== "FALSE",
    createdAt: row[17] ?? "",
    updatedAt: row[18] ?? "",
    notes: row[19] ?? "",
    commissionFixedAmount: Number(row[20] ?? 0),
  };
}

function legacyRowToContact(row: string[], companyId: string): Contact | null {
  const name = row[5] ?? "";
  if (!name) return null;
  return {
    id: `CON-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    companyId,
    name,
    role: "",
    phone: row[6] ?? "",
    phone2: row[7] ?? "",
    lineId: row[8] ?? "",
    email: row[9] ?? "",
    businessCardUrl: "",
    isPrimary: true,
    createdAt: row[17] ?? "",
    updatedAt: row[18] ?? "",
  };
}

// Detect schema by column count in first data row
function isLegacySchema(rows: string[][]): boolean {
  if (rows.length === 0) return false;
  return rows[0].length > 16;
}

async function loadContactsForCompanies(
  sheetsClient: { sheets: import("googleapis").sheets_v4.Sheets; spreadsheetId: string },
): Promise<Contact[]> {
  try {
    const response = await sheetsClient.sheets.spreadsheets.values.get({
      spreadsheetId: sheetsClient.spreadsheetId,
      range: "聯絡人!A2:L",
    });
    return (response.data.values ?? []).map((row) => ({
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
    }));
  } catch {
    return [];
  }
}

export async function GET() {
  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({
      companies: [] as CompanyWithPrimaryContact[],
      clients: [] as import("@/lib/types").Client[],
      source: "defaults" as const,
    });
  }

  try {
    const response = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: "客戶資料庫!A2:U",
    });
    const rows = response.data.values ?? [];

    let companies: Company[];
    let legacyContacts: Contact[] = [];

    if (isLegacySchema(rows)) {
      // Old 21-column schema: extract company + contact from same row
      companies = rows.map(legacyRowToCompany);
      legacyContacts = rows
        .map((row) => legacyRowToContact(row, row[0] ?? ""))
        .filter((c): c is Contact => c !== null);
    } else {
      companies = rows.map(rowToCompany);
    }

    const activeCompanies = companies.filter((c) => c.isActive);

    // Load contacts from contact sheet
    const sheetContacts = await loadContactsForCompanies(client);
    const allContacts = [...sheetContacts, ...legacyContacts];

    // Build primary contact map
    const primaryContactMap = new Map<string, Contact>();
    for (const contact of allContacts) {
      if (contact.isPrimary) {
        primaryContactMap.set(contact.companyId, contact);
      }
    }
    // Fallback: if no primary, use first contact
    for (const contact of allContacts) {
      if (!primaryContactMap.has(contact.companyId)) {
        primaryContactMap.set(contact.companyId, contact);
      }
    }

    const companiesWithPrimary: CompanyWithPrimaryContact[] = activeCompanies.map((company) => ({
      ...company,
      primaryContact: primaryContactMap.get(company.id) ?? null,
    }));

    // Backward-compatible clients array
    const clients = companiesWithPrimary.map((c) =>
      companyToClient(c, c.primaryContact),
    );

    return NextResponse.json({
      companies: companiesWithPrimary,
      clients,
      source: "sheets" as const,
    });
  } catch {
    return NextResponse.json({
      companies: [] as CompanyWithPrimaryContact[],
      clients: [] as import("@/lib/types").Client[],
      source: "defaults" as const,
    });
  }
}

export async function POST(request: Request) {
  const payload = (await request.json()) as Company;
  const now = new Date().toISOString().slice(0, 10);
  payload.createdAt = now;
  payload.updatedAt = now;
  payload.isActive = true;

  const sheetsClient = await getSheetsClient();
  if (!sheetsClient) {
    return NextResponse.json(
      { ok: false, error: "Google Sheets 未設定" },
      { status: 503 },
    );
  }

  try {
    await sheetsClient.sheets.spreadsheets.values.append({
      spreadsheetId: sheetsClient.spreadsheetId,
      range: "客戶資料庫!A:P",
      valueInputOption: "RAW",
      requestBody: { values: [companyToRow(payload)] },
    });
    return NextResponse.json({ ok: true, company: payload }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const payload = (await request.json()) as Company;
  payload.updatedAt = new Date().toISOString().slice(0, 10);

  const sheetsClient = await getSheetsClient();
  if (!sheetsClient) {
    return NextResponse.json(
      { ok: false, error: "Google Sheets 未設定" },
      { status: 503 },
    );
  }

  try {
    const response = await sheetsClient.sheets.spreadsheets.values.get({
      spreadsheetId: sheetsClient.spreadsheetId,
      range: "客戶資料庫!A2:A",
    });
    const ids = (response.data.values ?? []).flat();
    const rowIndex = ids.indexOf(payload.id);
    if (rowIndex === -1) {
      return NextResponse.json(
        { ok: false, error: "company not found" },
        { status: 404 },
      );
    }

    const sheetRow = rowIndex + 2;
    await sheetsClient.sheets.spreadsheets.values.update({
      spreadsheetId: sheetsClient.spreadsheetId,
      range: `客戶資料庫!A${sheetRow}:P${sheetRow}`,
      valueInputOption: "RAW",
      requestBody: { values: [companyToRow(payload)] },
    });
    return NextResponse.json({ ok: true, company: payload });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify build**

```bash
cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價
git add src/app/api/sheets/clients/route.ts
git commit -m "feat(api): rewrite clients route for Company schema with legacy compat"
```

---

## Task 6: Create Drive and Gemini client helpers

**Files:**
- Modify: `src/lib/sheets-client.ts`
- Create: `src/lib/drive-client.ts`
- Create: `src/lib/gemini-client.ts`

- [ ] **Step 1: Add getDriveClient to sheets-client.ts**

Add to the end of `src/lib/sheets-client.ts`:

```typescript
export async function getDriveClient() {
  const credentials = getCredentials();
  if (!credentials) return null;

  const auth = new GoogleAuth({
    credentials,
    scopes: [
      "https://www.googleapis.com/auth/drive.file",
    ],
  });

  return google.drive({ version: "v3", auth });
}
```

Also add `drive` import — change the existing import line:

```typescript
import { google, sheets_v4 } from "googleapis";
```

This already imports `google` which provides `google.drive()`, so no import change needed. Just add the function.

- [ ] **Step 2: Create drive-client.ts**

Create `src/lib/drive-client.ts`:

```typescript
import "server-only";

import { getDriveClient } from "./sheets-client";
import { Readable } from "stream";

const FOLDER_NAME = "繃布報價-名片";

async function getOrCreateFolder(): Promise<string | null> {
  const drive = await getDriveClient();
  if (!drive) return null;

  // Search for existing folder
  const searchResult = await drive.files.list({
    q: `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id)",
  });

  if (searchResult.data.files && searchResult.data.files.length > 0) {
    return searchResult.data.files[0].id!;
  }

  // Create folder
  const folder = await drive.files.create({
    requestBody: {
      name: FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
    },
    fields: "id",
  });

  return folder.data.id!;
}

export async function uploadBusinessCardImage(
  imageBuffer: Buffer,
  fileName: string,
  mimeType: string,
): Promise<string | null> {
  const drive = await getDriveClient();
  if (!drive) return null;

  const folderId = await getOrCreateFolder();
  if (!folderId) return null;

  const file = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: Readable.from(imageBuffer),
    },
    fields: "id,webViewLink",
  });

  // Make the file readable by anyone with the link
  await drive.permissions.create({
    fileId: file.data.id!,
    requestBody: {
      role: "reader",
      type: "anyone",
    },
  });

  // Return a direct thumbnail URL
  return `https://drive.google.com/thumbnail?id=${file.data.id}&sz=w800`;
}
```

- [ ] **Step 3: Create gemini-client.ts**

Create `src/lib/gemini-client.ts`:

```typescript
import "server-only";

import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY;

export interface BusinessCardData {
  companyName: string;
  name: string;
  role: string;
  phone: string;
  phone2: string;
  email: string;
  lineId: string;
  address: string;
}

const EMPTY_RESULT: BusinessCardData = {
  companyName: "",
  name: "",
  role: "",
  phone: "",
  phone2: "",
  email: "",
  lineId: "",
  address: "",
};

export async function recognizeBusinessCard(
  imageBuffer: Buffer,
  mimeType: string,
): Promise<BusinessCardData> {
  if (!apiKey) {
    return EMPTY_RESULT;
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const prompt = `這是一張名片照片。請辨識名片上的資訊，回傳 JSON 格式。
只回傳 JSON，不要有其他文字或 markdown 標記。

回傳格式：
{
  "companyName": "公司名稱",
  "name": "姓名",
  "role": "職稱",
  "phone": "主要電話（手機優先）",
  "phone2": "次要電話（市話）",
  "email": "Email",
  "lineId": "LINE ID（如有）",
  "address": "地址（如有）"
}

如果某個欄位無法辨識，請填空字串 ""。`;

  try {
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType,
          data: imageBuffer.toString("base64"),
        },
      },
    ]);

    const text = result.response.text().trim();
    // Strip markdown code fences if present
    const jsonStr = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

    return {
      companyName: String(parsed.companyName ?? ""),
      name: String(parsed.name ?? ""),
      role: String(parsed.role ?? ""),
      phone: String(parsed.phone ?? ""),
      phone2: String(parsed.phone2 ?? ""),
      email: String(parsed.email ?? ""),
      lineId: String(parsed.lineId ?? ""),
      address: String(parsed.address ?? ""),
    };
  } catch {
    return EMPTY_RESULT;
  }
}
```

- [ ] **Step 4: Add GEMINI_API_KEY to .env.example**

Append to `.env.example`:

```
GEMINI_API_KEY=your-gemini-api-key
```

- [ ] **Step 5: Verify build**

```bash
cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 6: Commit**

```bash
cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價
git add src/lib/sheets-client.ts src/lib/drive-client.ts src/lib/gemini-client.ts .env.example
git commit -m "feat: add Google Drive upload and Gemini Flash OCR clients"
```

---

## Task 7: Create business card recognition API route

**Files:**
- Create: `src/app/api/business-card/recognize/route.ts`

- [ ] **Step 1: Create the route**

Create `src/app/api/business-card/recognize/route.ts`:

```typescript
import { NextResponse } from "next/server";

import { uploadBusinessCardImage } from "@/lib/drive-client";
import { recognizeBusinessCard } from "@/lib/gemini-client";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("image") as File | null;

    if (!file) {
      return NextResponse.json(
        { ok: false, error: "未提供圖片" },
        { status: 400 },
      );
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/heic"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { ok: false, error: "不支援的圖片格式，請使用 JPG、PNG 或 WebP" },
        { status: 400 },
      );
    }

    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { ok: false, error: "圖片大小不可超過 10MB" },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const timestamp = Date.now();
    const ext = file.type.split("/")[1] ?? "jpg";
    const fileName = `card_${timestamp}.${ext}`;

    // Run OCR and Drive upload in parallel
    const [ocrResult, imageUrl] = await Promise.all([
      recognizeBusinessCard(buffer, file.type),
      uploadBusinessCardImage(buffer, fileName, file.type),
    ]);

    return NextResponse.json({
      ok: true,
      data: ocrResult,
      imageUrl: imageUrl ?? "",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Verify build**

```bash
cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價
git add src/app/api/business-card/recognize/route.ts
git commit -m "feat(api): add business card OCR route with Gemini + Drive"
```

---

## Task 8: Create useCompanies and useContacts hooks

**Files:**
- Create: `src/hooks/useCompanies.ts`
- Create: `src/hooks/useContacts.ts`
- Create: `src/hooks/useBusinessCardRecognition.ts`
- Modify: `src/hooks/useClients.ts`

- [ ] **Step 1: Create useCompanies hook**

Create `src/hooks/useCompanies.ts`:

```typescript
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { Client } from "@/lib/types";
import type { Company, CompanyWithPrimaryContact } from "@/lib/types/company";

const CACHE_KEY = "cq-companies-cache";
const TTL = 5 * 60 * 1000;

export type SortField = "name" | "createdAt" | "updatedAt";

interface CompaniesFilter {
  keyword: string;
  clientType: string;
  channel: string;
  showInactive: boolean;
  sortBy: SortField;
}

export function useCompanies() {
  const [companies, setCompanies] = useState<CompanyWithPrimaryContact[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<CompaniesFilter>({
    keyword: "",
    clientType: "",
    channel: "",
    showInactive: false,
    sortBy: "name",
  });

  const load = useCallback(async (force = false) => {
    setLoading(true);
    try {
      if (!force) {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached) as {
            companies: CompanyWithPrimaryContact[];
            clients: Client[];
            ts: number;
          };
          if (Date.now() - parsed.ts < TTL) {
            setCompanies(parsed.companies);
            setClients(parsed.clients);
            setLoading(false);
            return;
          }
        }
      }

      const response = await fetch("/api/sheets/clients", { cache: "no-store" });
      if (!response.ok) throw new Error("load companies");
      const payload = (await response.json()) as {
        companies: CompanyWithPrimaryContact[];
        clients: Client[];
      };
      setCompanies(payload.companies);
      setClients(payload.clients);
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({
          companies: payload.companies,
          clients: payload.clients,
          ts: Date.now(),
        }),
      );
    } catch {
      setCompanies([]);
      setClients([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    let result = companies;

    if (!filters.showInactive) {
      result = result.filter((c) => c.isActive);
    }

    if (filters.clientType) {
      result = result.filter((c) => c.clientType === filters.clientType);
    }

    if (filters.channel) {
      result = result.filter((c) => c.channel === filters.channel);
    }

    const q = filters.keyword.trim().toLowerCase();
    if (q) {
      result = result.filter((c) =>
        [
          c.companyName,
          c.shortName,
          c.primaryContact?.name ?? "",
          c.primaryContact?.phone ?? "",
          c.taxId,
        ].some((f) => f.toLowerCase().includes(q)),
      );
    }

    result = [...result].sort((a, b) => {
      switch (filters.sortBy) {
        case "createdAt":
          return b.createdAt.localeCompare(a.createdAt);
        case "updatedAt":
          return b.updatedAt.localeCompare(a.updatedAt);
        default:
          return a.companyName.localeCompare(b.companyName, "zh-TW");
      }
    });

    return result;
  }, [companies, filters]);

  const addCompany = useCallback(
    async (company: Company) => {
      const response = await fetch("/api/sheets/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(company),
      });
      if (!response.ok) throw new Error("新增公司失敗");
      localStorage.removeItem(CACHE_KEY);
      await load(true);
    },
    [load],
  );

  const updateCompany = useCallback(
    async (company: Company) => {
      const response = await fetch("/api/sheets/clients", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(company),
      });
      if (!response.ok) throw new Error("更新公司失敗");
      localStorage.removeItem(CACHE_KEY);
      await load(true);
    },
    [load],
  );

  return {
    companies: filtered,
    allCompanies: companies,
    clients,
    loading,
    filters,
    setFilters,
    reload: () => load(true),
    addCompany,
    updateCompany,
  };
}
```

- [ ] **Step 2: Create useContacts hook**

Create `src/hooks/useContacts.ts`:

```typescript
"use client";

import { useCallback, useEffect, useState } from "react";

import type { Contact } from "@/lib/types/company";

export function useContacts(companyId: string | null) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) {
      setContacts([]);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(
        `/api/sheets/contacts?companyId=${encodeURIComponent(companyId)}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error("load contacts");
      const payload = (await response.json()) as { contacts: Contact[] };
      setContacts(payload.contacts);
    } catch {
      setContacts([]);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const addContact = useCallback(
    async (contact: Contact) => {
      const response = await fetch("/api/sheets/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contact),
      });
      if (!response.ok) throw new Error("新增聯絡人失敗");
      await load();
    },
    [load],
  );

  const updateContact = useCallback(
    async (contact: Contact) => {
      const response = await fetch("/api/sheets/contacts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contact),
      });
      if (!response.ok) throw new Error("更新聯絡人失敗");
      await load();
    },
    [load],
  );

  const deleteContact = useCallback(
    async (contactId: string) => {
      const response = await fetch("/api/sheets/contacts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: contactId }),
      });
      if (!response.ok) throw new Error("刪除聯絡人失敗");
      await load();
    },
    [load],
  );

  return { contacts, loading, reload: load, addContact, updateContact, deleteContact };
}
```

- [ ] **Step 3: Create useBusinessCardRecognition hook**

Create `src/hooks/useBusinessCardRecognition.ts`:

```typescript
"use client";

import { useCallback, useState } from "react";

import type { BusinessCardData } from "@/lib/gemini-client";

interface RecognitionState {
  status: "idle" | "uploading" | "done" | "error";
  data: BusinessCardData | null;
  imageUrl: string;
  error: string;
}

const INITIAL_STATE: RecognitionState = {
  status: "idle",
  data: null,
  imageUrl: "",
  error: "",
};

export function useBusinessCardRecognition() {
  const [state, setState] = useState<RecognitionState>(INITIAL_STATE);

  const recognize = useCallback(async (file: File) => {
    setState({ status: "uploading", data: null, imageUrl: "", error: "" });

    try {
      const formData = new FormData();
      formData.append("image", file);

      const response = await fetch("/api/business-card/recognize", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorPayload = (await response.json()) as { error?: string };
        throw new Error(errorPayload.error ?? "辨識失敗");
      }

      const result = (await response.json()) as {
        ok: boolean;
        data: BusinessCardData;
        imageUrl: string;
      };

      setState({
        status: "done",
        data: result.data,
        imageUrl: result.imageUrl,
        error: "",
      });

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "辨識失敗";
      setState({ status: "error", data: null, imageUrl: "", error: message });
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  return { ...state, recognize, reset };
}
```

- [ ] **Step 4: Update useClients for backward compat**

Replace the entire contents of `src/hooks/useClients.ts`:

```typescript
"use client";

import { useCompanies } from "./useCompanies";

/**
 * Backward-compatible hook that returns the flat Client[] array.
 * Used by QuoteEditor and other existing consumers.
 */
export function useClients() {
  const { clients, loading, reload, addCompany, updateCompany } = useCompanies();

  return {
    clients,
    loading,
    reload,
    // Legacy methods — callers still pass Client objects.
    // The API route handles both Company and legacy Client shapes.
    addClient: async (client: import("@/lib/types").Client) => {
      const company = {
        id: client.id,
        companyName: client.companyName,
        shortName: client.shortName,
        clientType: client.clientType,
        channel: client.channel,
        address: client.address,
        taxId: client.taxId,
        commissionMode: client.commissionMode,
        commissionRate: client.commissionRate,
        commissionFixedAmount: client.commissionFixedAmount,
        paymentTerms: client.paymentTerms,
        defaultNotes: client.defaultNotes,
        isActive: client.isActive,
        createdAt: client.createdAt,
        updatedAt: client.updatedAt,
        notes: client.notes,
      };
      await addCompany(company);
    },
    updateClient: async (client: import("@/lib/types").Client) => {
      const company = {
        id: client.id,
        companyName: client.companyName,
        shortName: client.shortName,
        clientType: client.clientType,
        channel: client.channel,
        address: client.address,
        taxId: client.taxId,
        commissionMode: client.commissionMode,
        commissionRate: client.commissionRate,
        commissionFixedAmount: client.commissionFixedAmount,
        paymentTerms: client.paymentTerms,
        defaultNotes: client.defaultNotes,
        isActive: client.isActive,
        createdAt: client.createdAt,
        updatedAt: client.updatedAt,
        notes: client.notes,
      };
      await updateCompany(company);
    },
  };
}
```

- [ ] **Step 5: Verify build**

```bash
cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 6: Commit**

```bash
cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價
git add src/hooks/useCompanies.ts src/hooks/useContacts.ts src/hooks/useBusinessCardRecognition.ts src/hooks/useClients.ts
git commit -m "feat(hooks): add useCompanies, useContacts, useBusinessCardRecognition hooks"
```

---

## Task 9: Build BusinessCardUpload component

**Files:**
- Create: `src/components/clients/BusinessCardUpload.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/clients/BusinessCardUpload.tsx`:

```typescript
"use client";

import { Camera, Loader2, Upload } from "lucide-react";
import { useRef } from "react";

import { Button } from "@/components/ui/button";
import { useBusinessCardRecognition } from "@/hooks/useBusinessCardRecognition";
import type { BusinessCardData } from "@/lib/gemini-client";

interface BusinessCardUploadProps {
  onRecognized: (data: BusinessCardData, imageUrl: string) => void;
  existingImageUrl?: string;
}

export function BusinessCardUpload({
  onRecognized,
  existingImageUrl,
}: BusinessCardUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { status, error, recognize } = useBusinessCardRecognition();

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const result = await recognize(file);
    if (result) {
      onRecognized(result.data, result.imageUrl);
    }

    // Reset the input so the same file can be re-selected
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-3">
      {existingImageUrl && (
        <div className="overflow-hidden rounded-[var(--radius)]">
          <img
            src={existingImageUrl}
            alt="名片"
            className="h-auto w-full max-w-[280px] rounded-[var(--radius)] border border-[var(--border)]"
          />
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />

      <Button
        variant="outline"
        size="sm"
        disabled={status === "uploading"}
        onClick={() => fileInputRef.current?.click()}
      >
        {status === "uploading" ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            辨識中...
          </>
        ) : existingImageUrl ? (
          <>
            <Camera className="h-3.5 w-3.5" />
            重新上傳名片
          </>
        ) : (
          <>
            <Upload className="h-3.5 w-3.5" />
            上傳名片
          </>
        )}
      </Button>

      {status === "error" && (
        <p className="text-xs text-[var(--error)]">{error}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價
git add src/components/clients/BusinessCardUpload.tsx
git commit -m "feat(ui): add BusinessCardUpload component with OCR integration"
```

---

## Task 10: Build ContactCard component

**Files:**
- Create: `src/components/clients/ContactCard.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/clients/ContactCard.tsx`:

```typescript
"use client";

import { Check, MoreHorizontal, Pencil, Star, Trash2, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BusinessCardUpload } from "./BusinessCardUpload";
import type { Contact } from "@/lib/types/company";
import type { BusinessCardData } from "@/lib/gemini-client";

interface ContactCardProps {
  contact: Contact;
  onUpdate: (contact: Contact) => Promise<void>;
  onDelete: (contactId: string) => Promise<void>;
  onSetPrimary: (contactId: string) => Promise<void>;
}

export function ContactCard({
  contact,
  onUpdate,
  onDelete,
  onSetPrimary,
}: ContactCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(contact);
  const [showMenu, setShowMenu] = useState(false);
  const [saving, setSaving] = useState(false);

  function update(patch: Partial<Contact>) {
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  function handleRecognized(data: BusinessCardData, imageUrl: string) {
    setDraft((prev) => ({
      ...prev,
      name: data.name || prev.name,
      role: data.role || prev.role,
      phone: data.phone || prev.phone,
      phone2: data.phone2 || prev.phone2,
      lineId: data.lineId || prev.lineId,
      email: data.email || prev.email,
      businessCardUrl: imageUrl || prev.businessCardUrl,
    }));
    if (!editing) setEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onUpdate(draft);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setDraft(contact);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="space-y-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>姓名</Label>
            <Input
              value={draft.name}
              onChange={(e) => update({ name: e.target.value })}
            />
          </div>
          <div>
            <Label>角色 / 職稱</Label>
            <Input
              value={draft.role}
              onChange={(e) => update({ role: e.target.value })}
              placeholder="老闆、採購、設計師..."
            />
          </div>
          <div>
            <Label>電話</Label>
            <Input
              value={draft.phone}
              onChange={(e) => update({ phone: e.target.value })}
            />
          </div>
          <div>
            <Label>電話 2</Label>
            <Input
              value={draft.phone2}
              onChange={(e) => update({ phone2: e.target.value })}
            />
          </div>
          <div>
            <Label>LINE</Label>
            <Input
              value={draft.lineId}
              onChange={(e) => update({ lineId: e.target.value })}
            />
          </div>
          <div>
            <Label>Email</Label>
            <Input
              value={draft.email}
              onChange={(e) => update({ email: e.target.value })}
            />
          </div>
        </div>

        <BusinessCardUpload
          existingImageUrl={draft.businessCardUrl}
          onRecognized={handleRecognized}
        />

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={handleCancel}>
            <X className="h-3.5 w-3.5" />
            取消
          </Button>
          <Button size="sm" disabled={saving} onClick={handleSave}>
            <Check className="h-3.5 w-3.5" />
            {saving ? "儲存中..." : "儲存"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start justify-between rounded-[var(--radius-lg)] border border-[var(--border)] p-4">
      <div className="flex gap-3">
        {contact.businessCardUrl && (
          <a
            href={contact.businessCardUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0"
          >
            <img
              src={contact.businessCardUrl}
              alt="名片"
              className="h-14 w-20 rounded-[var(--radius)] border border-[var(--border)] object-cover"
            />
          </a>
        )}
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-[var(--text-primary)]">
              {contact.name}
            </span>
            {contact.isPrimary && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                <Star className="h-2.5 w-2.5" />
                主要
              </span>
            )}
          </div>
          {contact.role && (
            <p className="text-xs text-[var(--text-secondary)]">{contact.role}</p>
          )}
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            {contact.phone}
            {contact.email && ` · ${contact.email}`}
          </p>
        </div>
      </div>

      <div className="relative flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setEditing(true)}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setShowMenu(!showMenu)}
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </Button>
        {showMenu && (
          <div className="absolute right-0 top-8 z-10 min-w-[140px] rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-primary)] py-1 shadow-lg">
            {!contact.isPrimary && (
              <button
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-[var(--bg-secondary)]"
                onClick={() => {
                  setShowMenu(false);
                  void onSetPrimary(contact.id);
                }}
              >
                <Star className="h-3 w-3" />
                設為主要聯絡人
              </button>
            )}
            <button
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--error)] hover:bg-[var(--bg-secondary)]"
              onClick={() => {
                setShowMenu(false);
                void onDelete(contact.id);
              }}
            >
              <Trash2 className="h-3 w-3" />
              刪除
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價
git add src/components/clients/ContactCard.tsx
git commit -m "feat(ui): add ContactCard with inline edit and business card OCR"
```

---

## Task 11: Build tab components for detail panel

**Files:**
- Create: `src/components/clients/CompanyInfoTab.tsx`
- Create: `src/components/clients/ContactsTab.tsx`
- Create: `src/components/clients/QuoteHistoryTab.tsx`

- [ ] **Step 1: Create CompanyInfoTab**

Create `src/components/clients/CompanyInfoTab.tsx`:

```typescript
"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CHANNEL_LABELS, CLIENT_TYPE_LABELS } from "@/lib/constants";
import { clampCommissionRate } from "@/lib/utils";
import type { Channel, ClientType, CommissionMode } from "@/lib/types";
import type { Company } from "@/lib/types/company";
import { Loader2, Save } from "lucide-react";

interface CompanyInfoTabProps {
  company: Company;
  onSave: (company: Company) => Promise<void>;
}

export function CompanyInfoTab({ company, onSave }: CompanyInfoTabProps) {
  const [draft, setDraft] = useState(company);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset draft when company changes (e.g. switching companies)
  if (draft.id !== company.id) {
    setDraft(company);
  }

  function update(patch: Partial<Company>) {
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  const hasChanges = JSON.stringify(draft) !== JSON.stringify(company);

  async function handleSave() {
    if (!draft.companyName.trim()) {
      setError("公司名稱為必填");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* 基本資訊 */}
      <section className="space-y-3">
        <h4 className="text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">
          基本資訊
        </h4>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>公司名稱 *</Label>
            <Input
              value={draft.companyName}
              onChange={(e) => update({ companyName: e.target.value })}
            />
          </div>
          <div>
            <Label>簡稱</Label>
            <Input
              value={draft.shortName}
              onChange={(e) => update({ shortName: e.target.value })}
            />
          </div>
          <div>
            <Label>客戶類型</Label>
            <Select
              value={draft.clientType}
              onValueChange={(v) => update({ clientType: v as ClientType })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(CLIENT_TYPE_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>預設通路</Label>
            <Select
              value={draft.channel}
              onValueChange={(v) => update({ channel: v as Channel })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(["wholesale", "designer", "retail"] as const).map((ch) => (
                  <SelectItem key={ch} value={ch}>
                    {CHANNEL_LABELS[ch].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      {/* 商務設定 */}
      <section className="space-y-3">
        <h4 className="text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">
          商務設定
        </h4>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>統一編號</Label>
            <Input
              value={draft.taxId}
              onChange={(e) => update({ taxId: e.target.value })}
            />
          </div>
          <div>
            <Label>佣金模式</Label>
            <Select
              value={draft.commissionMode}
              onValueChange={(v) =>
                update({ commissionMode: v as CommissionMode | "default" })
              }
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="default">跟隨系統設定</SelectItem>
                <SelectItem value="price_gap">賺價差</SelectItem>
                <SelectItem value="rebate">返佣</SelectItem>
                <SelectItem value="fixed">固定金額</SelectItem>
                <SelectItem value="none">無佣金</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {draft.commissionMode === "rebate" && (
            <div>
              <Label>返佣比例 (%)</Label>
              <Input
                type="number"
                value={draft.commissionRate}
                min={0}
                max={50}
                step={0.1}
                onChange={(e) =>
                  update({ commissionRate: clampCommissionRate(Number(e.target.value)) })
                }
              />
            </div>
          )}
          {draft.commissionMode === "fixed" && (
            <div>
              <Label>固定佣金金額</Label>
              <Input
                type="number"
                value={draft.commissionFixedAmount}
                min={0}
                onChange={(e) =>
                  update({ commissionFixedAmount: Math.max(0, Math.round(Number(e.target.value) || 0)) })
                }
              />
            </div>
          )}
          <div>
            <Label>付款條件</Label>
            <Input
              value={draft.paymentTerms}
              onChange={(e) => update({ paymentTerms: e.target.value })}
            />
          </div>
          <div>
            <Label>預設備註</Label>
            <Input
              value={draft.defaultNotes}
              onChange={(e) => update({ defaultNotes: e.target.value })}
            />
          </div>
        </div>
      </section>

      {/* 地址 & 備註 */}
      <section className="space-y-3">
        <div>
          <Label>地址</Label>
          <Input
            value={draft.address}
            onChange={(e) => update({ address: e.target.value })}
          />
        </div>
        <div>
          <Label>備註</Label>
          <Textarea
            value={draft.notes}
            onChange={(e) => update({ notes: e.target.value })}
            rows={3}
          />
        </div>
      </section>

      {error && <p className="text-xs text-[var(--error)]">{error}</p>}

      {hasChanges && (
        <div className="flex justify-end">
          <Button size="sm" disabled={saving} onClick={handleSave}>
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {saving ? "儲存中..." : "儲存修改"}
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create ContactsTab**

Create `src/components/clients/ContactsTab.tsx`:

```typescript
"use client";

import { Loader2, Plus, Upload } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useContacts } from "@/hooks/useContacts";
import { BusinessCardUpload } from "./BusinessCardUpload";
import { ContactCard } from "./ContactCard";
import type { Contact } from "@/lib/types/company";
import type { BusinessCardData } from "@/lib/gemini-client";

interface ContactsTabProps {
  companyId: string;
}

export function ContactsTab({ companyId }: ContactsTabProps) {
  const { contacts, loading, addContact, updateContact, deleteContact } =
    useContacts(companyId);
  const [showNewForm, setShowNewForm] = useState(false);
  const [showCardUpload, setShowCardUpload] = useState(false);
  const [newDraft, setNewDraft] = useState<Partial<Contact>>({});
  const [saving, setSaving] = useState(false);

  function updateDraft(patch: Partial<Contact>) {
    setNewDraft((prev) => ({ ...prev, ...patch }));
  }

  function handleCardRecognized(data: BusinessCardData, imageUrl: string) {
    setNewDraft({
      name: data.name,
      role: data.role,
      phone: data.phone,
      phone2: data.phone2,
      lineId: data.lineId,
      email: data.email,
      businessCardUrl: imageUrl,
    });
    setShowCardUpload(false);
    setShowNewForm(true);
  }

  async function handleSaveNew() {
    if (!newDraft.name?.trim()) return;
    setSaving(true);
    try {
      const contact: Contact = {
        id: `CON-${Date.now()}`,
        companyId,
        name: newDraft.name ?? "",
        role: newDraft.role ?? "",
        phone: newDraft.phone ?? "",
        phone2: newDraft.phone2 ?? "",
        lineId: newDraft.lineId ?? "",
        email: newDraft.email ?? "",
        businessCardUrl: newDraft.businessCardUrl ?? "",
        isPrimary: contacts.length === 0,
        createdAt: "",
        updatedAt: "",
      };
      await addContact(contact);
      setShowNewForm(false);
      setNewDraft({});
    } finally {
      setSaving(false);
    }
  }

  async function handleSetPrimary(contactId: string) {
    const contact = contacts.find((c) => c.id === contactId);
    if (!contact) return;
    await updateContact({ ...contact, isPrimary: true });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-sm text-[var(--text-secondary)]">
        <Loader2 className="h-4 w-4 animate-spin" />
        載入中...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setShowCardUpload(false);
            setShowNewForm(true);
            setNewDraft({});
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          新增聯絡人
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setShowNewForm(false);
            setShowCardUpload(true);
          }}
        >
          <Upload className="h-3.5 w-3.5" />
          名片建檔
        </Button>
      </div>

      {showCardUpload && (
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
          <p className="mb-3 text-sm text-[var(--text-secondary)]">
            上傳名片照片，系統會自動辨識聯絡資訊
          </p>
          <BusinessCardUpload onRecognized={handleCardRecognized} />
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => setShowCardUpload(false)}
          >
            取消
          </Button>
        </div>
      )}

      {showNewForm && (
        <div className="space-y-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>姓名 *</Label>
              <Input
                value={newDraft.name ?? ""}
                onChange={(e) => updateDraft({ name: e.target.value })}
              />
            </div>
            <div>
              <Label>角色 / 職稱</Label>
              <Input
                value={newDraft.role ?? ""}
                onChange={(e) => updateDraft({ role: e.target.value })}
                placeholder="老闆、採購、設計師..."
              />
            </div>
            <div>
              <Label>電話</Label>
              <Input
                value={newDraft.phone ?? ""}
                onChange={(e) => updateDraft({ phone: e.target.value })}
              />
            </div>
            <div>
              <Label>電話 2</Label>
              <Input
                value={newDraft.phone2 ?? ""}
                onChange={(e) => updateDraft({ phone2: e.target.value })}
              />
            </div>
            <div>
              <Label>LINE</Label>
              <Input
                value={newDraft.lineId ?? ""}
                onChange={(e) => updateDraft({ lineId: e.target.value })}
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                value={newDraft.email ?? ""}
                onChange={(e) => updateDraft({ email: e.target.value })}
              />
            </div>
          </div>

          {newDraft.businessCardUrl && (
            <img
              src={newDraft.businessCardUrl}
              alt="名片"
              className="h-auto max-w-[200px] rounded-[var(--radius)] border border-[var(--border)]"
            />
          )}

          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowNewForm(false);
                setNewDraft({});
              }}
            >
              取消
            </Button>
            <Button
              size="sm"
              disabled={saving || !newDraft.name?.trim()}
              onClick={handleSaveNew}
            >
              {saving ? "儲存中..." : "儲存"}
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {contacts.length === 0 && !showNewForm && (
          <p className="py-4 text-center text-sm text-[var(--text-secondary)]">
            尚無聯絡人
          </p>
        )}
        {contacts.map((contact) => (
          <ContactCard
            key={contact.id}
            contact={contact}
            onUpdate={updateContact}
            onDelete={deleteContact}
            onSetPrimary={handleSetPrimary}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create QuoteHistoryTab**

Create `src/components/clients/QuoteHistoryTab.tsx`:

```typescript
"use client";

import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface VersionRecord {
  versionId: string;
  quoteDate: string;
  projectName: string;
  versionStatus: string;
  totalWithTax: number;
}

interface QuoteHistoryTabProps {
  companyId: string;
  companyName: string;
}

export function QuoteHistoryTab({ companyId, companyName }: QuoteHistoryTabProps) {
  const router = useRouter();
  const [versions, setVersions] = useState<VersionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/sheets/versions?clientId=${encodeURIComponent(companyId)}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error("load");
      const payload = (await response.json()) as { versions: VersionRecord[] };
      const filtered = payload.versions
        .filter((v) => v.versionStatus !== "superseded")
        .sort((a, b) => b.quoteDate.localeCompare(a.quoteDate));
      setVersions(filtered);
    } catch {
      setVersions([]);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  function handleGoToVersion(version: VersionRecord) {
    sessionStorage.setItem(
      "quoteLoadRequest",
      JSON.stringify({
        type: "load-version",
        versionId: version.versionId,
        source: "client-history",
      }),
    );
    router.push("/");
  }

  const totalAmount = versions.reduce((sum, v) => sum + (v.totalWithTax || 0), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-sm text-[var(--text-secondary)]">
        <Loader2 className="h-4 w-4 animate-spin" />
        載入中...
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-[var(--text-secondary)]">
        尚無報價記錄
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
        <span>共 {versions.length} 筆報價</span>
        <span>累計 ${totalAmount.toLocaleString()}</span>
      </div>

      <div className="overflow-x-auto">
        <table className="data-table w-full">
          <thead>
            <tr>
              <th className="px-3 py-2 text-left">版本</th>
              <th className="px-3 py-2 text-left">日期</th>
              <th className="px-3 py-2 text-left">案名</th>
              <th className="px-3 py-2 text-left">狀態</th>
              <th className="px-3 py-2 text-right">金額</th>
            </tr>
          </thead>
          <tbody>
            {versions.map((v) => (
              <tr key={v.versionId}>
                <td className="px-3 py-2">
                  <button
                    className="text-xs text-[var(--accent)] underline-offset-2 hover:underline"
                    onClick={() => handleGoToVersion(v)}
                  >
                    {v.versionId}
                  </button>
                </td>
                <td className="px-3 py-2 text-xs">{v.quoteDate}</td>
                <td className="px-3 py-2 text-xs">{v.projectName || "—"}</td>
                <td className="px-3 py-2">
                  <span className="inline-block rounded-full bg-[var(--bg-secondary)] px-2 py-0.5 text-[10px]">
                    {v.versionStatus}
                  </span>
                </td>
                <td className="px-3 py-2 text-right text-xs font-mono">
                  ${(v.totalWithTax || 0).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify build**

```bash
cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 5: Commit**

```bash
cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價
git add src/components/clients/CompanyInfoTab.tsx src/components/clients/ContactsTab.tsx src/components/clients/QuoteHistoryTab.tsx
git commit -m "feat(ui): add CompanyInfoTab, ContactsTab, and QuoteHistoryTab"
```

---

## Task 12: Build CompanyDetailPanel (slide-out panel)

**Files:**
- Create: `src/components/clients/CompanyDetailPanel.tsx`

- [ ] **Step 1: Create the panel**

Create `src/components/clients/CompanyDetailPanel.tsx`:

```typescript
"use client";

import { Ban, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CLIENT_TYPE_LABELS, CHANNEL_LABELS } from "@/lib/constants";
import type { Company, CompanyWithPrimaryContact } from "@/lib/types/company";
import { CompanyInfoTab } from "./CompanyInfoTab";
import { ContactsTab } from "./ContactsTab";
import { QuoteHistoryTab } from "./QuoteHistoryTab";

interface CompanyDetailPanelProps {
  company: CompanyWithPrimaryContact;
  onClose: () => void;
  onSave: (company: Company) => Promise<void>;
  isNew?: boolean;
}

export function CompanyDetailPanel({
  company,
  onClose,
  onSave,
  isNew = false,
}: CompanyDetailPanelProps) {
  const [deactivating, setDeactivating] = useState(false);

  async function handleDeactivate() {
    if (!confirm("確定要停用此公司嗎？停用後不會刪除資料，但不再顯示於列表中。")) return;
    setDeactivating(true);
    try {
      await onSave({ ...company, isActive: false });
      onClose();
    } finally {
      setDeactivating(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 transition-opacity"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[480px] flex-col bg-[var(--bg-primary)] shadow-2xl transition-transform">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[var(--border)] px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              {isNew ? "新增公司" : company.companyName}
            </h2>
            {!isNew && (
              <div className="mt-1 flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                <span className="rounded-full bg-[var(--bg-secondary)] px-2 py-0.5">
                  {CLIENT_TYPE_LABELS[company.clientType]}
                </span>
                <span className="rounded-full bg-[var(--bg-secondary)] px-2 py-0.5">
                  {CHANNEL_LABELS[company.channel].label}
                </span>
                {company.createdAt && (
                  <span>建立於 {company.createdAt}</span>
                )}
              </div>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex-1 overflow-y-auto">
          <Tabs defaultValue="info" className="h-full">
            <TabsList className="w-full justify-start border-b border-[var(--border)] bg-transparent px-6">
              <TabsTrigger value="info">公司資料</TabsTrigger>
              {!isNew && <TabsTrigger value="contacts">聯絡人</TabsTrigger>}
              {!isNew && <TabsTrigger value="history">報價歷史</TabsTrigger>}
            </TabsList>

            <div className="px-6 py-4">
              <TabsContent value="info" className="mt-0">
                <CompanyInfoTab company={company} onSave={onSave} />
              </TabsContent>

              {!isNew && (
                <TabsContent value="contacts" className="mt-0">
                  <ContactsTab companyId={company.id} />
                </TabsContent>
              )}

              {!isNew && (
                <TabsContent value="history" className="mt-0">
                  <QuoteHistoryTab
                    companyId={company.id}
                    companyName={company.companyName}
                  />
                </TabsContent>
              )}
            </div>
          </Tabs>
        </div>

        {/* Footer */}
        {!isNew && (
          <div className="border-t border-[var(--border)] px-6 py-3">
            <Button
              variant="ghost"
              size="sm"
              className="text-[var(--error)]"
              disabled={deactivating}
              onClick={handleDeactivate}
            >
              <Ban className="h-3.5 w-3.5" />
              {deactivating ? "處理中..." : "停用公司"}
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價
git add src/components/clients/CompanyDetailPanel.tsx
git commit -m "feat(ui): add CompanyDetailPanel slide-out with tabs"
```

---

## Task 13: Build CompanyListPanel (main list page)

**Files:**
- Create: `src/components/clients/CompanyListPanel.tsx`

- [ ] **Step 1: Create the list panel**

Create `src/components/clients/CompanyListPanel.tsx`:

```typescript
"use client";

import { Loader2, Plus, Upload } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useCompanies, type SortField } from "@/hooks/useCompanies";
import { CLIENT_TYPE_LABELS, CHANNEL_LABELS } from "@/lib/constants";
import type { Company, CompanyWithPrimaryContact } from "@/lib/types/company";
import { CompanyDetailPanel } from "./CompanyDetailPanel";
import { BusinessCardUpload } from "./BusinessCardUpload";
import type { BusinessCardData } from "@/lib/gemini-client";

const EMPTY_COMPANY: CompanyWithPrimaryContact = {
  id: "",
  companyName: "",
  shortName: "",
  clientType: "other",
  channel: "wholesale",
  address: "",
  taxId: "",
  commissionMode: "default",
  commissionRate: 0,
  commissionFixedAmount: 0,
  paymentTerms: "",
  defaultNotes: "",
  isActive: true,
  createdAt: "",
  updatedAt: "",
  notes: "",
  primaryContact: null,
};

export function CompanyListPanel() {
  const {
    companies,
    loading,
    filters,
    setFilters,
    addCompany,
    updateCompany,
    reload,
  } = useCompanies();

  const [selectedCompany, setSelectedCompany] =
    useState<CompanyWithPrimaryContact | null>(null);
  const [isNewCompany, setIsNewCompany] = useState(false);
  const [showCardUpload, setShowCardUpload] = useState(false);

  function handleOpenNew() {
    setSelectedCompany({
      ...EMPTY_COMPANY,
      id: `CLI-${Date.now()}`,
    });
    setIsNewCompany(true);
  }

  function handleOpenExisting(company: CompanyWithPrimaryContact) {
    setSelectedCompany(company);
    setIsNewCompany(false);
  }

  function handleClose() {
    setSelectedCompany(null);
    setIsNewCompany(false);
  }

  async function handleSave(company: Company) {
    if (isNewCompany) {
      await addCompany(company);
    } else {
      await updateCompany(company);
    }
    await reload();
    // Keep panel open after save for existing, close for new
    if (isNewCompany) {
      handleClose();
    }
  }

  function handleCardRecognized(data: BusinessCardData, imageUrl: string) {
    // Open new company panel, pre-fill with recognized data
    const newCompany: CompanyWithPrimaryContact = {
      ...EMPTY_COMPANY,
      id: `CLI-${Date.now()}`,
      companyName: data.companyName,
      address: data.address,
      primaryContact: null,
    };
    setSelectedCompany(newCompany);
    setIsNewCompany(true);
    setShowCardUpload(false);

    // Store recognized contact data in sessionStorage for ContactsTab to pick up
    sessionStorage.setItem(
      "pendingContact",
      JSON.stringify({
        name: data.name,
        role: data.role,
        phone: data.phone,
        phone2: data.phone2,
        lineId: data.lineId,
        email: data.email,
        businessCardUrl: imageUrl,
      }),
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--text-secondary)]">
          長期合作的 B2B 客戶主檔。
          {!loading && <span className="ml-2">{companies.length} 家公司</span>}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCardUpload(!showCardUpload)}
          >
            <Upload className="h-3.5 w-3.5" />
            名片建檔
          </Button>
          <Button size="sm" onClick={handleOpenNew}>
            <Plus className="h-3.5 w-3.5" />
            新增公司
          </Button>
        </div>
      </div>

      {/* Card upload area */}
      {showCardUpload && (
        <div className="card-surface rounded-[var(--radius-lg)] p-4">
          <p className="mb-3 text-sm text-[var(--text-secondary)]">
            上傳名片照片，系統會自動辨識並建立公司與聯絡人
          </p>
          <BusinessCardUpload onRecognized={handleCardRecognized} />
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => setShowCardUpload(false)}
          >
            取消
          </Button>
        </div>
      )}

      {/* Filters */}
      <div className="card-surface overflow-hidden rounded-[var(--radius-lg)]">
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] px-4 py-3">
          <Input
            placeholder="搜尋公司、聯絡人、電話、統編⋯"
            value={filters.keyword}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, keyword: e.target.value }))
            }
            className="max-w-[200px]"
          />
          <Select
            value={filters.clientType || "__all__"}
            onValueChange={(v) =>
              setFilters((prev) => ({
                ...prev,
                clientType: v === "__all__" ? "" : v,
              }))
            }
          >
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="全部類型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">全部類型</SelectItem>
              {Object.entries(CLIENT_TYPE_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filters.channel || "__all__"}
            onValueChange={(v) =>
              setFilters((prev) => ({
                ...prev,
                channel: v === "__all__" ? "" : v,
              }))
            }
          >
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="全部通路" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">全部通路</SelectItem>
              {(["wholesale", "designer", "retail"] as const).map((ch) => (
                <SelectItem key={ch} value={ch}>
                  {CHANNEL_LABELS[ch].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filters.sortBy}
            onValueChange={(v) =>
              setFilters((prev) => ({ ...prev, sortBy: v as SortField }))
            }
          >
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">依名稱</SelectItem>
              <SelectItem value="createdAt">依建立日期</SelectItem>
              <SelectItem value="updatedAt">依更新日期</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1.5">
            <Checkbox
              id="show-inactive"
              checked={filters.showInactive}
              onCheckedChange={(checked) =>
                setFilters((prev) => ({
                  ...prev,
                  showInactive: checked === true,
                }))
              }
            />
            <Label htmlFor="show-inactive" className="text-xs">
              顯示停用
            </Label>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-[var(--text-secondary)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            載入中...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="px-4 py-2.5">公司名稱</th>
                  <th className="px-4 py-2.5">類型</th>
                  <th className="px-4 py-2.5">通路</th>
                  <th className="px-4 py-2.5">主要聯絡人</th>
                  <th className="px-4 py-2.5">電話</th>
                  <th className="px-4 py-2.5">狀態</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((company) => (
                  <tr
                    key={company.id}
                    className="cursor-pointer hover:bg-[var(--bg-secondary)]"
                    onClick={() => handleOpenExisting(company)}
                  >
                    <td className="px-4 py-2.5">
                      <div className="text-sm font-medium text-[var(--text-primary)]">
                        {company.companyName}
                      </div>
                      {company.shortName && (
                        <div className="text-xs text-[var(--text-secondary)]">
                          {company.shortName}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-sm">
                      {CLIENT_TYPE_LABELS[company.clientType]}
                    </td>
                    <td className="px-4 py-2.5 text-sm">
                      {CHANNEL_LABELS[company.channel].label}
                    </td>
                    <td className="px-4 py-2.5 text-sm">
                      {company.primaryContact?.name ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-sm">
                      {company.primaryContact?.phone ?? "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      {company.isActive ? (
                        <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                          啟用
                        </span>
                      ) : (
                        <span className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                          停用
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {companies.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center text-sm text-[var(--text-secondary)]"
                    >
                      {filters.keyword || filters.clientType || filters.channel
                        ? "無符合搜尋條件的公司"
                        : "尚無公司資料"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Panel */}
      {selectedCompany && (
        <CompanyDetailPanel
          company={selectedCompany}
          onClose={handleClose}
          onSave={handleSave}
          isNew={isNewCompany}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價
git add src/components/clients/CompanyListPanel.tsx
git commit -m "feat(ui): add CompanyListPanel with filters and slide-out panel"
```

---

## Task 14: Integrate into Settings page

**Files:**
- Modify: `src/app/settings/SettingsClient.tsx`

- [ ] **Step 1: Replace ClientsManagementPanel with CompanyListPanel**

In `src/app/settings/SettingsClient.tsx`:

1. Replace the import:
```typescript
// Old:
import { ClientsManagementPanel } from "@/components/clients/ClientsManagementPanel";
// New:
import { CompanyListPanel } from "@/components/clients/CompanyListPanel";
```

2. Replace the usage in the "clients" TabsContent (around line 415-424):
```typescript
<TabsContent value="clients">
  <div className="card-surface rounded-[var(--radius-lg)]">
    <div className="border-b border-[var(--border)] px-6 py-3">
      <span className="text-sm font-medium">客戶主檔</span>
    </div>
    <div className="px-6 py-4">
      <CompanyListPanel />
    </div>
  </div>
</TabsContent>
```

- [ ] **Step 2: Verify build**

```bash
cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價
git add src/app/settings/SettingsClient.tsx
git commit -m "feat(settings): integrate CompanyListPanel into clients tab"
```

---

## Task 15: Verify QuoteEditor backward compatibility

**Files:**
- Review: `src/components/quote-editor/QuoteEditor.tsx`

- [ ] **Step 1: Verify useClients still works in QuoteEditor**

The QuoteEditor imports `useClients()` and uses `clients` (which is `Client[]`). Since we rewrote `useClients` to delegate to `useCompanies` and return the backward-compatible `clients` array, this should work without changes.

```bash
cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價
npx tsc --noEmit 2>&1 | head -30
```

Verify no errors in QuoteEditor. If there are type errors, fix them.

- [ ] **Step 2: Start dev server and verify**

```bash
cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價
npm run dev
```

Open http://localhost:3000/settings?tab=clients and verify:
1. Company list loads
2. Filters work (type, channel, search)
3. Click a company opens detail panel
4. Company info tab displays and saves
5. Contacts tab shows contacts
6. Quote history tab loads

Open http://localhost:3000 and verify:
1. QuoteEditor client selection dropdown still works
2. Selecting a client still fills in company name, contact, phone, etc.
3. Commission override still applies correctly

- [ ] **Step 3: Commit any fixes if needed**

```bash
cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價
git add -A
git commit -m "fix: resolve backward compatibility issues with QuoteEditor"
```

---

## Task 16: Add .env.example documentation and final cleanup

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Ensure .env.example has all required keys**

The `.env.example` should now contain:

```
GOOGLE_SHEETS_SPREADSHEET_ID=你的試算表ID
GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}
GEMINI_API_KEY=your-gemini-api-key
```

(This was already added in Task 6 Step 4.)

- [ ] **Step 2: Run full build check**

```bash
cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價
npm run build 2>&1 | tail -20
```

Expected: Build succeeds.

- [ ] **Step 3: Final commit**

```bash
cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價
git add -A
git commit -m "feat: complete customer master optimization - Company/Contact two-tier architecture"
```
