import type { getSheetsClient } from "@/lib/sheets-client";
import type {
  ARRecord,
  ARScheduleRecord,
  CaseRecord,
  PendingMonthlyRecord,
  QuotePlanRecord,
  QuoteVersionRecord,
} from "@/lib/types";
import type { BillingType } from "@/lib/types/company";
import {
  AR_RANGE_DATA,
  AR_RANGE_FULL,
  AR_ROW_RANGE,
  AR_SCHEDULE_RANGE_DATA,
  AR_SCHEDULE_RANGE_FULL,
  AR_SCHEDULE_ROW_RANGE,
  PENDING_MONTHLY_RANGE_DATA,
  PENDING_MONTHLY_RANGE_FULL,
  PENDING_MONTHLY_ROW_RANGE,
  arRecordToRow,
  arRowToRecord,
  arScheduleRecordToRow,
  arScheduleRowToRecord,
  calcARStatusFromSchedules,
  calcScheduleDerivedStatus,
  generateArId,
  generateArScheduleId,
  generatePendingMonthlyId,
  pendingMonthlyRecordToRow,
  pendingMonthlyRowToRecord,
} from "@/lib/ar-utils";

import {
  caseRecordToRow,
  caseRowToRecord,
  getCaseRows,
  getQuoteRows,
  isoDateNow,
  isoNow,
  quoteRecordToRow,
  quoteRowToRecord,
} from "./_v2-utils";

// ─────────────────────────────────────────────────────────────────────────────
// 版本狀態連動（單一事實來源）：
// 版本狀態改變時，必須同步 ①報價(quoteStatus/採用版本) ②案件(caseStatus/成交版本)
// ③應收帳款（成交自動開立、退回自動取消）。
// 所有會改 versionStatus 的 API 都應呼叫 syncVersionToParents —— 過去只有
// 集合端點 PATCH /api/sheets/versions 有呼叫，直接端點漏掉，造成
// 「版本已接受、案件仍報價中」的脫鉤（bug）。
// ─────────────────────────────────────────────────────────────────────────────

type SheetsClientHandle = NonNullable<Awaited<ReturnType<typeof getSheetsClient>>>;

const DEFAULT_AR_DUE_DAYS = 7;

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function getCompanyBillingType(
  client: SheetsClientHandle,
  clientId: string,
): Promise<BillingType> {
  if (!clientId) return "per_quote";
  try {
    const res = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: "客戶資料庫!A2:R",
    });
    const rows = (res.data.values ?? []) as string[][];
    const hit = rows.find((r) => (r[0] ?? "") === clientId);
    if (!hit) return "per_quote";
    const raw = hit[17] ?? "per_quote";
    return raw === "monthly" ? "monthly" : "per_quote";
  } catch {
    return "per_quote";
  }
}

/**
 * 報價金額被改動時，把「已接受版本」的有效應收帳款金額同步過來。
 *
 * 安全規則：只有在「尚未收到任何款項」時才自動改。一旦收過款，改動金額牽涉
 * 退款／補收，屬於需要人工判斷的合約變更 —— 自動改會讓已入帳的收款失去依據，
 * 因此保持不動，由使用者用「編輯分期」處理。
 */
async function syncARAmountToVersion(
  client: SheetsClientHandle,
  existing: ARRecord,
  version: QuoteVersionRecord,
  arRows: string[][],
): Promise<void> {
  const newTotal = Math.round(version.totalAmount);
  const oldTotal = Math.round(existing.totalAmount);
  if (!Number.isFinite(newTotal) || newTotal <= 0) return;
  if (newTotal === oldTotal) return; // 金額沒變
  if (existing.receivedAmount > 0) return; // 已收款 → 不自動改，交給人工

  const now = isoNow();
  const today = isoDateNow();

  // 取出這張 AR 的分期，依新總額等比重算（保留期別標籤、比例、到期日）
  const schedRes = await client.sheets.spreadsheets.values.get({
    spreadsheetId: client.spreadsheetId,
    range: AR_SCHEDULE_RANGE_DATA,
  });
  const schedRows = (schedRes.data.values ?? []) as string[][];
  const mine = schedRows
    .map((r, i) => ({ rec: arScheduleRowToRecord(r), i }))
    .filter((x) => x.rec.arId === existing.arId)
    .sort((a, b) => a.rec.seq - b.rec.seq);
  if (mine.length === 0) return;

  let allocated = 0;
  const rescaled = mine.map((x, idx) => {
    const isLast = idx === mine.length - 1;
    const amount = isLast
      ? newTotal - allocated
      : Math.round((newTotal * x.rec.amount) / (oldTotal || newTotal));
    allocated += amount;
    const next: ARScheduleRecord = {
      ...x.rec,
      amount,
      ratio: newTotal > 0 ? Math.round((amount / newTotal) * 100) : 0,
      updatedAt: now,
    };
    next.scheduleStatus = calcScheduleDerivedStatus(next, today);
    return { next, i: x.i };
  });

  const { arStatus, hasOverdue } = calcARStatusFromSchedules(
    rescaled.map((r) => r.next),
    today,
  );
  const arRowIndex = arRows.findIndex((r) => (r[0] ?? "") === existing.arId);
  const updatedAr: ARRecord = {
    ...existing,
    totalAmount: newTotal,
    outstandingAmount: newTotal,
    arStatus,
    hasOverdue,
    notes: [existing.notes, `報價金額異動：${oldTotal} → ${newTotal}，應收已同步`]
      .filter(Boolean)
      .join("\n"),
    updatedAt: now,
  };

  const data = rescaled.map((r) => ({
    range: AR_SCHEDULE_ROW_RANGE(r.i + 2),
    values: [arScheduleRecordToRow(r.next)],
  }));
  if (arRowIndex >= 0) {
    data.push({ range: AR_ROW_RANGE(arRowIndex + 2), values: [arRecordToRow(updatedAr)] });
  }
  await client.sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: client.spreadsheetId,
    requestBody: { valueInputOption: "RAW", data },
  });
}

async function syncARFromVersion(
  client: SheetsClientHandle,
  version: QuoteVersionRecord,
  caseClientId: string,
): Promise<void> {
  const now = isoNow();
  const today = isoDateNow();

  const arRes = await client.sheets.spreadsheets.values.get({
    spreadsheetId: client.spreadsheetId,
    range: AR_RANGE_DATA,
  });
  const arRows = (arRes.data.values ?? []) as string[][];
  const ars = arRows.map(arRowToRecord);
  const existing = ars.find(
    (ar) => ar.versionId === version.versionId && ar.createdBy === "auto",
  );

  if (version.versionStatus === "accepted") {
    // 已有有效應收：若報價金額被改動，把應收金額同步過來，
    // 否則應收會停在舊金額（帳與報價對不起來）。
    if (existing && existing.arStatus !== "cancelled") {
      await syncARAmountToVersion(client, existing, version, arRows);
      return;
    }
    if (
      ars.some(
        (ar) =>
          ar.versionId === version.versionId &&
          ar.arStatus !== "cancelled" &&
          ar.createdBy !== "auto",
      )
    ) {
      // A user manually made an AR for this version; do not double-book.
      return;
    }

    const billingType = await getCompanyBillingType(client, caseClientId);
    const totalAmount = version.totalAmount;
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) return;

    if (billingType === "monthly") {
      await upsertPendingMonthly(client, version, caseClientId);
      return;
    }
    if (billingType !== "per_quote") return;

    const arId = await generateArId(ars.map((ar) => ar.arId));
    const schedule: ARScheduleRecord = {
      scheduleId: generateArScheduleId(arId, 1),
      arId,
      seq: 1,
      label: "全額",
      ratio: 1,
      amount: totalAmount,
      dueDate: addDays(today, DEFAULT_AR_DUE_DAYS),
      receivedAmount: 0,
      receivedDate: "",
      paymentMethod: "",
      scheduleStatus: "pending",
      adjustmentAmount: 0,
      notes: "",
      createdAt: now,
      updatedAt: now,
    };
    const { arStatus, hasOverdue } = calcARStatusFromSchedules([schedule], today);

    const arRecord: ARRecord = {
      arId,
      issueDate: today,
      caseId: version.caseId,
      caseNameSnapshot: version.projectNameSnapshot,
      quoteId: version.quoteId,
      versionId: version.versionId,
      clientId: caseClientId,
      clientNameSnapshot: version.clientNameSnapshot,
      contactNameSnapshot: version.contactNameSnapshot,
      clientPhoneSnapshot: version.clientPhoneSnapshot,
      projectNameSnapshot: version.projectNameSnapshot,
      totalAmount,
      receivedAmount: 0,
      outstandingAmount: totalAmount,
      scheduleCount: 1,
      arStatus,
      hasOverdue,
      lastReceivedAt: "",
      notes: "報價成交自動開立",
      createdAt: now,
      updatedAt: now,
      createdBy: "auto",
    };

    await client.sheets.spreadsheets.values.append({
      spreadsheetId: client.spreadsheetId,
      range: AR_RANGE_FULL,
      valueInputOption: "RAW",
      requestBody: { values: [arRecordToRow(arRecord)] },
    });
    await client.sheets.spreadsheets.values.append({
      spreadsheetId: client.spreadsheetId,
      range: AR_SCHEDULE_RANGE_FULL,
      valueInputOption: "RAW",
      requestBody: { values: [arScheduleRecordToRow(schedule)] },
    });
    return;
  }

  // Version moved away from "accepted" (rejected / superseded / reverted):
  // cancel any auto-created AR + its pending schedules so the ledger stays
  // consistent without deleting audit data.
  if (existing && existing.arStatus !== "cancelled") {
    const arRowIdx = arRows.findIndex((r) => (r[0] ?? "") === existing.arId);
    if (arRowIdx >= 0) {
      const cancelled: ARRecord = {
        ...existing,
        arStatus: "cancelled",
        notes: existing.notes
          ? `${existing.notes}\n版本狀態變更,自動取消`
          : "版本狀態變更,自動取消",
        updatedAt: now,
      };
      await client.sheets.spreadsheets.values.update({
        spreadsheetId: client.spreadsheetId,
        range: AR_ROW_RANGE(arRowIdx + 2),
        valueInputOption: "RAW",
        requestBody: { values: [arRecordToRow(cancelled)] },
      });

      // Waive schedules that have no money received so reports don't
      // count them as outstanding anymore.
      const schedRes = await client.sheets.spreadsheets.values.get({
        spreadsheetId: client.spreadsheetId,
        range: AR_SCHEDULE_RANGE_DATA,
      });
      const schedRows = (schedRes.data.values ?? []) as string[][];
      for (let i = 0; i < schedRows.length; i++) {
        const sched = arScheduleRowToRecord(schedRows[i]);
        if (sched.arId !== existing.arId) continue;
        if (sched.receivedAmount > 0) continue;
        if (sched.scheduleStatus === "paid" || sched.scheduleStatus === "waived") continue;
        const next: ARScheduleRecord = {
          ...sched,
          scheduleStatus: "waived",
          updatedAt: now,
        };
        await client.sheets.spreadsheets.values.update({
          spreadsheetId: client.spreadsheetId,
          range: AR_SCHEDULE_ROW_RANGE(i + 2),
          valueInputOption: "RAW",
          requestBody: { values: [arScheduleRecordToRow(next)] },
        });
      }
    }
  }

  // Also cancel any pending-monthly entry for this version that hasn't
  // been consolidated yet (consolidated entries are frozen by design).
  try {
    const pendingRes = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: PENDING_MONTHLY_RANGE_DATA,
    });
    const pendingRows = (pendingRes.data.values ?? []) as string[][];
    for (let i = 0; i < pendingRows.length; i++) {
      const rec = pendingMonthlyRowToRecord(pendingRows[i]);
      if (rec.versionId !== version.versionId) continue;
      if (rec.status !== "pending") continue;
      const cancelled: PendingMonthlyRecord = {
        ...rec,
        status: "cancelled",
        notes: rec.notes
          ? `${rec.notes}\n版本狀態變更,自動取消`
          : "版本狀態變更,自動取消",
        updatedAt: now,
      };
      await client.sheets.spreadsheets.values.update({
        spreadsheetId: client.spreadsheetId,
        range: PENDING_MONTHLY_ROW_RANGE(i + 2),
        valueInputOption: "RAW",
        requestBody: { values: [pendingMonthlyRecordToRow(cancelled)] },
      });
    }
  } catch {
    // 月結待出 sheet may not exist yet; silently skip.
  }
}

async function upsertPendingMonthly(
  client: SheetsClientHandle,
  version: QuoteVersionRecord,
  clientId: string,
): Promise<void> {
  const now = isoNow();
  const today = isoDateNow();
  try {
    const res = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: PENDING_MONTHLY_RANGE_DATA,
    });
    const rows = (res.data.values ?? []) as string[][];
    const records = rows.map(pendingMonthlyRowToRecord);
    const existing = records.find((r) => r.versionId === version.versionId);
    if (existing) {
      // If it was cancelled previously (user toggled status back and forth),
      // re-activate it. If it was already consolidated, leave alone — the
      // admin must handle that case manually.
      if (existing.status === "cancelled") {
        const idx = records.findIndex((r) => r.pendingId === existing.pendingId);
        const revived: PendingMonthlyRecord = {
          ...existing,
          status: "pending",
          amount: version.totalAmount,
          acceptedAt: existing.acceptedAt || today,
          notes: "",
          updatedAt: now,
        };
        await client.sheets.spreadsheets.values.update({
          spreadsheetId: client.spreadsheetId,
          range: PENDING_MONTHLY_ROW_RANGE(idx + 2),
          valueInputOption: "RAW",
          requestBody: { values: [pendingMonthlyRecordToRow(revived)] },
        });
      }
      return;
    }
    const pendingId = await generatePendingMonthlyId(records.map((r) => r.pendingId));
    const record: PendingMonthlyRecord = {
      pendingId,
      versionId: version.versionId,
      quoteId: version.quoteId,
      caseId: version.caseId,
      clientId,
      clientNameSnapshot: version.clientNameSnapshot,
      caseNameSnapshot: version.projectNameSnapshot,
      projectNameSnapshot: version.projectNameSnapshot,
      amount: version.totalAmount,
      acceptedAt: today,
      consolidatedArId: "",
      status: "pending",
      notes: "",
      createdAt: now,
      updatedAt: now,
    };
    await client.sheets.spreadsheets.values.append({
      spreadsheetId: client.spreadsheetId,
      range: PENDING_MONTHLY_RANGE_FULL,
      valueInputOption: "RAW",
      requestBody: { values: [pendingMonthlyRecordToRow(record)] },
    });
  } catch {
    // 月結待出 sheet may not exist yet; skip quietly.
  }
}

/**
 * 版本 → 報價 → 案件 → 應收帳款 的狀態連動。
 * accepted：報價=adopted＋採用版本、案件=won＋成交版本、AR 自動開立（依客戶結帳方式）。
 * rejected：報價=not_adopted、案件=lost。
 * 其他狀態：更新 latest 指標；離開 accepted 時自動取消先前自動開立的 AR。
 */
export async function syncVersionToParents(
  client: SheetsClientHandle,
  version: QuoteVersionRecord,
): Promise<void> {
  const now = isoNow();
  const quoteRows = await getQuoteRows(client);
  const quoteRowIndex = quoteRows.findIndex((row) => row[0] === version.quoteId);
  if (quoteRowIndex !== -1) {
    const quote = quoteRowToRecord(quoteRows[quoteRowIndex] ?? []);
    const nextQuote: QuotePlanRecord = {
      ...quote,
      currentVersionId: version.versionId,
      latestSentAt: version.sentAt || quote.latestSentAt,
      nextFollowUpDate: version.nextFollowUpDate || quote.nextFollowUpDate,
      quoteStatus:
        version.versionStatus === "accepted"
          ? "adopted"
          : version.versionStatus === "rejected"
            ? "not_adopted"
            : quote.quoteStatus,
      selectedVersionId:
        version.versionStatus === "accepted" ? version.versionId : quote.selectedVersionId,
      updatedAt: now,
    };
    const sheetRow = quoteRowIndex + 2;
    await client.sheets.spreadsheets.values.update({
      spreadsheetId: client.spreadsheetId,
      range: `報價!A${sheetRow}:P${sheetRow}`,
      valueInputOption: "RAW",
      requestBody: { values: [quoteRecordToRow(nextQuote)] },
    });
  }

  let caseClientId = "";
  const caseRows = await getCaseRows(client);
  const caseRowIndex = caseRows.findIndex((row) => row[0] === version.caseId);
  if (caseRowIndex !== -1) {
    const caseRecord = caseRowToRecord(caseRows[caseRowIndex] ?? []);
    caseClientId = caseRecord.clientId;
    const nextCase: CaseRecord = {
      ...caseRecord,
      latestQuoteId: version.quoteId,
      latestVersionId: version.versionId,
      latestSentAt: version.sentAt || caseRecord.latestSentAt,
      nextFollowUpDate: version.nextFollowUpDate || caseRecord.nextFollowUpDate,
      caseStatus:
        version.versionStatus === "accepted"
          ? "won"
          : version.versionStatus === "rejected"
            ? "lost"
            : caseRecord.caseStatus,
      wonVersionId:
        version.versionStatus === "accepted" ? version.versionId : caseRecord.wonVersionId,
      updatedAt: now,
    };
    const sheetRow = caseRowIndex + 2;
    await client.sheets.spreadsheets.values.update({
      spreadsheetId: client.spreadsheetId,
      range: `案件!A${sheetRow}:AC${sheetRow}`,
      valueInputOption: "RAW",
      requestBody: { values: [caseRecordToRow(nextCase)] },
    });
  }

  try {
    await syncARFromVersion(client, version, caseClientId);
  } catch {
    // AR sync is best-effort; never block the status update itself.
  }
}
