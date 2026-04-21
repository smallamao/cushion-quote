import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME, verifySession } from "@/lib/auth";
import { getSheetsClient } from "@/lib/sheets-client";
import { caseRowToRecord, caseRecordToRow, getCaseRows } from "@/app/api/sheets/_v2-utils";
import type { Channel, ClientSource, ClientType, CommissionMode } from "@/lib/types";
import type { BillingType, Company } from "@/lib/types/company";

interface MatchChange {
  caseId: string;
  caseName: string;
  oldClientId: string;
  newClientId: string;
  matchedBy: "companyName" | "shortName" | "phone";
  companyName: string;
  clientNameSnapshot: string;
}

interface Unmatched {
  caseId: string;
  caseName: string;
  oldClientId: string;
  clientNameSnapshot: string;
  phoneSnapshot: string;
  reason: "no-snapshot" | "no-company-match" | "ambiguous";
  candidates?: Array<{ id: string; companyName: string; shortName: string }>;
}

interface Skipped {
  caseId: string;
  caseName: string;
  clientId: string;
  reason: "already-valid";
}

function requireAdmin(request: Request) {
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .find((c) => c.trim().startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.split("=")[1];
  const session = verifySession(token);
  if (!session) return { error: "not_authenticated" as const, status: 401 };
  if (session.role !== "admin") return { error: "forbidden" as const, status: 403 };
  return { session };
}

function rowToCompany(row: string[]): Company {
  const isLegacy = row.length > 17;
  if (isLegacy) {
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
      leadSource: "unknown" as ClientSource,
      billingType: "per_quote" as BillingType,
    };
  }
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
    leadSource: (row[16] as ClientSource) ?? "unknown",
    billingType: ((row[17] as BillingType) === "monthly" ? "monthly" : "per_quote") as BillingType,
  };
}

interface ContactLite {
  companyId: string;
  phone: string;
  phone2: string;
}

function normalizePhone(phone: string): string {
  return phone.replace(/[\s-]/g, "");
}

function normalizeName(name: string): string {
  return name.trim();
}

async function loadMigrationData(client: NonNullable<Awaited<ReturnType<typeof getSheetsClient>>>) {
  const [caseRows, companiesRes, contactsRes] = await Promise.all([
    getCaseRows(client),
    client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: "客戶資料庫!A2:U",
    }),
    client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: "聯絡人!A2:L",
    }),
  ]);

  const cases = caseRows.map(caseRowToRecord);
  const companies = (companiesRes.data.values ?? [])
    .map(rowToCompany)
    .filter((c) => c.id);
  const contacts: ContactLite[] = (contactsRes.data.values ?? []).map((row) => ({
    companyId: row[1] ?? "",
    phone: row[4] ?? "",
    phone2: row[5] ?? "",
  }));

  return { caseRows, cases, companies, contacts };
}

function planMigration(
  cases: ReturnType<typeof caseRowToRecord>[],
  companies: Company[],
  contacts: ContactLite[],
) {
  const companyIds = new Set(companies.map((c) => c.id));

  // Indexes for matching
  const byCompanyName = new Map<string, Company[]>();
  const byShortName = new Map<string, Company[]>();
  for (const c of companies) {
    if (!c.isActive) continue;
    const cn = normalizeName(c.companyName);
    if (cn) {
      const list = byCompanyName.get(cn) ?? [];
      list.push(c);
      byCompanyName.set(cn, list);
    }
    const sn = normalizeName(c.shortName);
    if (sn) {
      const list = byShortName.get(sn) ?? [];
      list.push(c);
      byShortName.set(sn, list);
    }
  }

  // Phone → set of companyIds (from contacts)
  const phoneToCompanies = new Map<string, Set<string>>();
  for (const ct of contacts) {
    for (const p of [ct.phone, ct.phone2]) {
      const np = normalizePhone(p);
      if (!np || !ct.companyId) continue;
      const set = phoneToCompanies.get(np) ?? new Set<string>();
      set.add(ct.companyId);
      phoneToCompanies.set(np, set);
    }
  }

  const changes: MatchChange[] = [];
  const unmatched: Unmatched[] = [];
  const skipped: Skipped[] = [];

  for (const c of cases) {
    // Already points to a valid company
    if (c.clientId && companyIds.has(c.clientId)) {
      skipped.push({
        caseId: c.caseId,
        caseName: c.caseName,
        clientId: c.clientId,
        reason: "already-valid",
      });
      continue;
    }

    const nameSnap = normalizeName(c.clientNameSnapshot);
    if (!nameSnap && !c.phoneSnapshot) {
      unmatched.push({
        caseId: c.caseId,
        caseName: c.caseName,
        oldClientId: c.clientId,
        clientNameSnapshot: c.clientNameSnapshot,
        phoneSnapshot: c.phoneSnapshot,
        reason: "no-snapshot",
      });
      continue;
    }

    // Try companyName exact match
    const cnCandidates = nameSnap ? byCompanyName.get(nameSnap) ?? [] : [];
    const snCandidates = nameSnap ? byShortName.get(nameSnap) ?? [] : [];

    // Collect unique candidates, prefer companyName over shortName
    const seen = new Set<string>();
    const candidates: Array<{ company: Company; matchedBy: MatchChange["matchedBy"] }> = [];
    for (const cand of cnCandidates) {
      if (seen.has(cand.id)) continue;
      seen.add(cand.id);
      candidates.push({ company: cand, matchedBy: "companyName" });
    }
    for (const cand of snCandidates) {
      if (seen.has(cand.id)) continue;
      seen.add(cand.id);
      candidates.push({ company: cand, matchedBy: "shortName" });
    }

    if (candidates.length === 0) {
      unmatched.push({
        caseId: c.caseId,
        caseName: c.caseName,
        oldClientId: c.clientId,
        clientNameSnapshot: c.clientNameSnapshot,
        phoneSnapshot: c.phoneSnapshot,
        reason: "no-company-match",
      });
      continue;
    }

    if (candidates.length === 1) {
      const pick = candidates[0];
      changes.push({
        caseId: c.caseId,
        caseName: c.caseName,
        oldClientId: c.clientId,
        newClientId: pick.company.id,
        matchedBy: pick.matchedBy,
        companyName: pick.company.companyName,
        clientNameSnapshot: c.clientNameSnapshot,
      });
      continue;
    }

    // Multiple candidates — try phone disambiguation
    const phoneNp = normalizePhone(c.phoneSnapshot);
    if (phoneNp) {
      const phoneMatches = phoneToCompanies.get(phoneNp);
      if (phoneMatches) {
        const disambiguated = candidates.filter((cand) => phoneMatches.has(cand.company.id));
        if (disambiguated.length === 1) {
          const pick = disambiguated[0];
          changes.push({
            caseId: c.caseId,
            caseName: c.caseName,
            oldClientId: c.clientId,
            newClientId: pick.company.id,
            matchedBy: "phone",
            companyName: pick.company.companyName,
            clientNameSnapshot: c.clientNameSnapshot,
          });
          continue;
        }
      }
    }

    unmatched.push({
      caseId: c.caseId,
      caseName: c.caseName,
      oldClientId: c.clientId,
      clientNameSnapshot: c.clientNameSnapshot,
      phoneSnapshot: c.phoneSnapshot,
      reason: "ambiguous",
      candidates: candidates.map((x) => ({
        id: x.company.id,
        companyName: x.company.companyName,
        shortName: x.company.shortName,
      })),
    });
  }

  return { changes, unmatched, skipped };
}

// GET: dry-run preview
export async function GET(request: Request) {
  const guard = requireAdmin(request);
  if ("error" in guard) {
    return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  }

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const { cases, companies, contacts } = await loadMigrationData(client);
    const plan = planMigration(cases, companies, contacts);
    return NextResponse.json({
      ok: true,
      summary: {
        totalCases: cases.length,
        totalCompanies: companies.length,
        toMigrate: plan.changes.length,
        unmatched: plan.unmatched.length,
        skipped: plan.skipped.length,
      },
      ...plan,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

// POST: apply a list of changes (client passes the approved subset from GET)
export async function POST(request: Request) {
  const guard = requireAdmin(request);
  if ("error" in guard) {
    return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  }

  let body: { changes?: Array<{ caseId: string; newClientId: string }> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const changes = body.changes ?? [];
  if (changes.length === 0) {
    return NextResponse.json({ ok: true, applied: 0, note: "no changes" });
  }

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const caseRows = await getCaseRows(client);
    const changeMap = new Map(changes.map((c) => [c.caseId, c.newClientId]));

    const updates: Array<{ range: string; values: string[][] }> = [];
    let applied = 0;

    for (let i = 0; i < caseRows.length; i++) {
      const row = caseRows[i];
      const caseId = row[0] ?? "";
      const newId = changeMap.get(caseId);
      if (!newId) continue;

      const record = caseRowToRecord(row);
      record.clientId = newId;
      record.updatedAt = new Date().toISOString().slice(0, 10);
      const newRow = caseRecordToRow(record);

      const sheetRow = i + 2; // header is row 1
      updates.push({
        range: `案件!A${sheetRow}:X${sheetRow}`,
        values: [newRow],
      });
      applied++;
    }

    if (updates.length > 0) {
      await client.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: client.spreadsheetId,
        requestBody: {
          valueInputOption: "RAW",
          data: updates,
        },
      });
    }

    return NextResponse.json({ ok: true, applied });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
