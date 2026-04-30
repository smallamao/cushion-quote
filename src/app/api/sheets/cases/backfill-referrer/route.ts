import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import type { CaseRecord } from "@/lib/types";

import {
  caseRecordToRow,
  caseRowToRecord,
  getCaseRows,
  isoNow,
} from "../../_v2-utils";

interface BackfillResult {
  caseId: string;
  contactName: string;
  status: "updated" | "skipped" | "failed";
  matchedCompanyId?: string;
  matchedCompanyName?: string;
  reason?: string;
}

interface ContactRow {
  companyId: string;
  name: string;
}

interface CompanyRow {
  id: string;
  name: string;
}

export async function POST() {
  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const [contactsRes, companiesRes] = await Promise.all([
      client.sheets.spreadsheets.values.get({
        spreadsheetId: client.spreadsheetId,
        range: "聯絡人!A2:L",
      }),
      client.sheets.spreadsheets.values.get({
        spreadsheetId: client.spreadsheetId,
        range: "客戶資料庫!A2:B",
      }),
    ]);

    const contacts: ContactRow[] = (contactsRes.data.values ?? []).map((row) => ({
      companyId: (row[1] ?? "").trim(),
      name: (row[2] ?? "").trim(),
    }));
    const companies: CompanyRow[] = (companiesRes.data.values ?? []).map((row) => ({
      id: (row[0] ?? "").trim(),
      name: (row[1] ?? "").trim(),
    }));

    // Build name → company lookup. Last write wins on collision; ambiguous names
    // get flagged so we don't auto-assign the wrong company.
    const nameToCompanyIds = new Map<string, Set<string>>();
    for (const contact of contacts) {
      if (!contact.name || !contact.companyId) continue;
      const set = nameToCompanyIds.get(contact.name) ?? new Set<string>();
      set.add(contact.companyId);
      nameToCompanyIds.set(contact.name, set);
    }
    const companyIdToName = new Map(companies.map((c) => [c.id, c.name]));

    const rows = await getCaseRows(client);
    const records = rows.map(caseRowToRecord);
    // 只要案件有「介紹人姓名」且尚未填「介紹公司」就嘗試 backfill,
     // 不限於 referral 類型來源(商會/協會等也常透過設計師介紹)。
    const targets = records
      .map((record, index) => ({ record, rowIndex: index }))
      .filter(({ record }) =>
        record.leadSourceContact.trim() &&
        !record.referredByCompanyId.trim(),
      );

    const results: BackfillResult[] = [];
    const updates: Array<{ row: number; record: CaseRecord }> = [];

    for (const { record, rowIndex } of targets) {
      const matchSet = nameToCompanyIds.get(record.leadSourceContact.trim());
      if (!matchSet || matchSet.size === 0) {
        results.push({
          caseId: record.caseId,
          contactName: record.leadSourceContact,
          status: "skipped",
          reason: "找不到對應聯絡人",
        });
        continue;
      }
      if (matchSet.size > 1) {
        results.push({
          caseId: record.caseId,
          contactName: record.leadSourceContact,
          status: "skipped",
          reason: `同名聯絡人有 ${matchSet.size} 筆,需手動指定`,
        });
        continue;
      }
      const companyId = [...matchSet][0];
      const companyName = companyIdToName.get(companyId) ?? "";
      updates.push({
        row: rowIndex + 2,
        record: {
          ...record,
          referredByCompanyId: companyId,
          referredByCompanyName: companyName,
          updatedAt: isoNow(),
        },
      });
      results.push({
        caseId: record.caseId,
        contactName: record.leadSourceContact,
        status: "updated",
        matchedCompanyId: companyId,
        matchedCompanyName: companyName,
      });
    }

    if (updates.length > 0) {
      await client.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: client.spreadsheetId,
        requestBody: {
          valueInputOption: "RAW",
          data: updates.map((item) => ({
            range: `案件!A${item.row}:AC${item.row}`,
            values: [caseRecordToRow(item.record)],
          })),
        },
      });
    }

    return NextResponse.json({
      ok: true,
      summary: {
        scanned: records.length,
        eligible: targets.length,
        updated: results.filter((r) => r.status === "updated").length,
        skipped: results.filter((r) => r.status === "skipped").length,
        failed: results.filter((r) => r.status === "failed").length,
      },
      results,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
