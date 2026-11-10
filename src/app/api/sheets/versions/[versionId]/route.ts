import { NextResponse, after } from "next/server";

import { requireAdmin } from "@/lib/api-auth";

import { appendNotification } from "@/lib/notifications-sheet";
import { createOrder } from "@/lib/order-create";
import { shouldAutoCreateOrderOnArchive } from "@/lib/signed-back";
import { findCompanyIdentityForCase } from "@/lib/company-lookup";
import { getSheetsClient } from "@/lib/sheets-client";
import { deriveOptionMeta } from "@/lib/quote-options";
import type { QuoteVersionRecord, VersionLineRecord } from "@/lib/types";

import {
  calculateNextFollowUpDate,
  calculateReminderStatus,
  getVersionLineRows,
  getVersionRows,
  isoNow,
  lineRowToRecord,
  makeItemId,
  replaceVersionLines,
  versionRecordToRow,
  versionRowToRecord,
} from "../../_v2-utils";
import { syncAutoCommissionSettlements } from "../../_settlement-utils";
import { syncVersionToParents } from "../../_version-sync-utils";

interface PutVersionPayload {
  version: QuoteVersionRecord;
  lines: Array<Partial<VersionLineRecord>>;
}

function normalizeVersion(record: QuoteVersionRecord, now: string): QuoteVersionRecord {
  const sentAt = record.sentAt || (record.versionStatus === "sent" ? now : "");
  const nextFollowUpDate =
    record.nextFollowUpDate || calculateNextFollowUpDate(sentAt, record.followUpDays);
  return {
    ...record,
    sentAt,
    nextFollowUpDate,
    reminderStatus: calculateReminderStatus({
      versionStatus: record.versionStatus,
      sentAt,
      nextFollowUpDate,
      lastFollowUpAt: record.lastFollowUpAt,
    }),
    updatedAt: now,
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ versionId: string }> },
) {
  // route 層再驗一次身分。middleware 已經把這條路徑限制在 admin，這裡是第二道鎖：
  // /api/sheets 底下多數端點原本只靠 middleware 那一道門，而 Next.js 近期就有三個
  // middleware bypass 的公告——一道門倒了不該等於全部資料大開（2026-10-15 弱點分析）。
  const guard = await requireAdmin(request);
  if (guard.denied) return guard.denied;


  const { versionId } = await params;

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const [versionRows, lineRows] = await Promise.all([
      getVersionRows(client),
      getVersionLineRows(client),
    ]);
    const version = versionRows
      .map(versionRowToRecord)
      .find((row) => row.versionId === versionId);

    if (!version) {
      return NextResponse.json({ ok: false, error: "version not found" }, { status: 404 });
    }

    const lines = lineRows
      .map(lineRowToRecord)
      .filter((line) => line.versionId === versionId);

    // 預覽側欄的報價單 PDF 要跟伺服器印出來的那份一致，所以統編也在這裡查好回去。
    const identity = await findCompanyIdentityForCase(client, version.caseId, version.clientNameSnapshot);

    return NextResponse.json({ version, lines, clientTaxId: identity?.taxId ?? "" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ versionId: string }> },
) {
  // route 層再驗一次身分。middleware 已經把這條路徑限制在 admin，這裡是第二道鎖：
  // /api/sheets 底下多數端點原本只靠 middleware 那一道門，而 Next.js 近期就有三個
  // middleware bypass 的公告——一道門倒了不該等於全部資料大開（2026-10-15 弱點分析）。
  const guard = await requireAdmin(request);
  if (guard.denied) return guard.denied;


  const { versionId } = await params;
  const payload = (await request.json()) as PutVersionPayload;

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const versionRows = await getVersionRows(client);
    const rowIndex = versionRows.findIndex((row) => row[0] === versionId);
    if (rowIndex === -1) {
      return NextResponse.json({ ok: false, error: "version not found" }, { status: 404 });
    }
    if (payload.version.versionId !== versionId) {
      return NextResponse.json({ ok: false, error: "versionId mismatch" }, { status: 400 });
    }

    const now = isoNow();
    const optionMeta = deriveOptionMeta(payload.lines ?? []);
    const isMultiOption =
      typeof payload.version.isMultiOption === "boolean" ? payload.version.isMultiOption : optionMeta.isMultiOption;
    if (payload.version.versionStatus === "accepted" && isMultiOption) {
      return NextResponse.json(
        { ok: false, error: "多方案報價不能直接接受，請先建立「確認方案」的新版本（只留客人選的方案）" },
        { status: 409 },
      );
    }
    const record = normalizeVersion(
      {
        ...payload.version,
        isMultiOption,
        optionMinAmount: optionMeta.optionMinAmount,
        updatedAt: now,
      },
      now,
    );

    const sheetRow = rowIndex + 2;
    await client.sheets.spreadsheets.values.update({
      spreadsheetId: client.spreadsheetId,
      range: `報價版本!A${sheetRow}:AW${sheetRow}`,
      valueInputOption: "RAW",
      requestBody: { values: [versionRecordToRow(record)] },
    });

    const lines: VersionLineRecord[] = payload.lines.map((line, index) => ({
      itemId: makeItemId(versionId, index + 1),
      versionId,
      quoteId: record.quoteId,
      caseId: record.caseId,
      lineNo: line.lineNo ?? index + 1,
      itemName: line.itemName ?? "",
      spec: line.spec ?? "",
      materialId: line.materialId ?? "",
      qty: line.qty ?? 0,
      unit: line.unit ?? "式",
      unitPrice: line.unitPrice ?? 0,
      lineAmount: line.lineAmount ?? 0,
      estimatedUnitCost: line.estimatedUnitCost ?? 0,
      estimatedCostAmount: line.estimatedCostAmount ?? 0,
      lineMarginAmount: line.lineMarginAmount ?? 0,
      lineMarginRate: line.lineMarginRate ?? 0,
      isCostItem: line.isCostItem ?? false,
      showOnQuote: line.showOnQuote ?? true,
      notes: line.notes ?? "",
      imageUrl: line.imageUrl ?? "",
      specImageUrl: line.specImageUrl ?? "",
      createdAt: line.createdAt ?? now,
      updatedAt: now,
      installHeightTier: line.installHeightTier ?? "",
      panelSizeTier: line.panelSizeTier ?? "",
      installSurchargeRate: line.installSurchargeRate ?? 0,
      // v0.3.2 fields
      panelInputMode: line.panelInputMode ?? "",
      surfaceWidthCm: line.surfaceWidthCm ?? 0,
      surfaceHeightCm: line.surfaceHeightCm ?? 0,
      splitDirection: line.splitDirection ?? "",
      splitCount: line.splitCount ?? 0,
      caiRoundingMode: line.caiRoundingMode ?? "",
      customSplitSizesCsv: line.customSplitSizesCsv ?? "",
    }));

    await replaceVersionLines(client, versionId, lines);

    await syncAutoCommissionSettlements(client, record);

    // 版本狀態可能在編輯器內變更 → 連動報價/案件/應收帳款，避免狀態脫鉤
    await syncVersionToParents(client, record);

    return NextResponse.json({ ok: true, versionId, lineCount: lines.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

interface VersionPatchPayload {
  versionStatus?: QuoteVersionRecord["versionStatus"];
  signedBack?: boolean;
  signedBackDate?: string;
  signedContractUrls?: string[];
  signedNotes?: string;
  /** 「已追蹤」快速鍵：記錄追蹤時間並重排下一輪 */
  lastFollowUpAt?: string;
  nextFollowUpDate?: string;
  /** 補充說明附圖（agent 端點補圖用；編輯器走 PUT） */
  descriptionImageUrl?: string;
}

/** 報價追蹤預設間隔（天）；版本自帶 followUpDays>0 時以版本為準 */
const DEFAULT_FOLLOW_UP_DAYS = 3;

function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("sv-SE");
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ versionId: string }> },
) {
  // route 層再驗一次身分。middleware 已經把這條路徑限制在 admin，這裡是第二道鎖：
  // /api/sheets 底下多數端點原本只靠 middleware 那一道門，而 Next.js 近期就有三個
  // middleware bypass 的公告——一道門倒了不該等於全部資料大開（2026-10-15 弱點分析）。
  const guard = await requireAdmin(request);
  if (guard.denied) return guard.denied;


  const { versionId } = await params;
  const payload = (await request.json()) as VersionPatchPayload;

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const versionRows = await getVersionRows(client);
    const rowIndex = versionRows.findIndex((row) => row[0] === versionId);
    if (rowIndex === -1) {
      return NextResponse.json({ ok: false, error: "version not found" }, { status: 404 });
    }

    const existing = versionRowToRecord(versionRows[rowIndex] ?? []);
    if (payload.versionStatus === "accepted" && existing.isMultiOption) {
      return NextResponse.json(
        { ok: false, error: "多方案報價不能直接接受，請先建立「確認方案」的新版本（只留客人選的方案）" },
        { status: 409 },
      );
    }
    const now = isoNow();
    const updated: QuoteVersionRecord = {
      ...existing,
      versionStatus: payload.versionStatus ?? existing.versionStatus,
      signedBack: payload.signedBack ?? existing.signedBack,
      signedBackDate: payload.signedBackDate ?? existing.signedBackDate,
      signedContractUrls: payload.signedContractUrls ?? existing.signedContractUrls,
      signedNotes: payload.signedNotes ?? existing.signedNotes,
      lastFollowUpAt: payload.lastFollowUpAt ?? existing.lastFollowUpAt,
      nextFollowUpDate: payload.nextFollowUpDate ?? existing.nextFollowUpDate,
      descriptionImageUrl: payload.descriptionImageUrl ?? existing.descriptionImageUrl,
      updatedAt: now,
    };

    // 追蹤排程連動（機制先前只存在於 PUT 的 normalizeVersion，狀態下拉走的
    // PATCH 漏接 → 追蹤欄位從未被寫入、行事曆報價追蹤永遠是空的）：
    const today = now.slice(0, 10);
    if (updated.versionStatus === "sent") {
      if (!updated.sentAt) updated.sentAt = now;
      if (updated.followUpDays <= 0) updated.followUpDays = DEFAULT_FOLLOW_UP_DAYS;
      if (!payload.nextFollowUpDate && !existing.nextFollowUpDate) {
        updated.nextFollowUpDate = addDaysStr(today, updated.followUpDays);
      }
    }
    if (["accepted", "rejected", "superseded"].includes(updated.versionStatus)) {
      updated.nextFollowUpDate = ""; // 已成交/已拒絕：追蹤結束，從行事曆與待追蹤清單消失
    }
    updated.reminderStatus = calculateReminderStatus(updated);

    const sheetRow = rowIndex + 2;
    await client.sheets.spreadsheets.values.update({
      spreadsheetId: client.spreadsheetId,
      range: `報價版本!A${sheetRow}:AW${sheetRow}`,
      valueInputOption: "RAW",
      requestBody: { values: [versionRecordToRow(updated)] },
    });

    // 狀態連動（修正「版本已接受、案件仍報價中」的脫鉤）：
    // 報價列表的狀態下拉、合約回簽都走這個端點，過去漏了連動，
    // 造成版本 accepted 但報價/案件/應收帳款全部沒跟上。
    await syncAutoCommissionSettlements(client, updated);
    await syncVersionToParents(client, updated);

    // 🔴 人工上傳合約歸檔也要自動開訂製訂單（老闆 2026-11-02 發現）。
    //
    // 線上簽署（/api/public/sign/[token]）早就有這段，理由是「客人一簽完就會匯訂金，
    // 訂單若沒開就不會進排程、不會叫料，等於收了錢卻沒人在做」（2026-09-29）。
    // 但客人不一定走線上連結——紙本簽回、LINE 傳回簽圖，內勤是用這個端點歸檔的，
    // 那條路沒接上，同一個洞等於只補了一半。
    // 實例：CA-202610-023-Q01-V03（NT$40,000）2026-11-02 歸檔後沒有任何訂單。
    //
    // 只在「這次才從未回簽變成已回簽」時觸發，重複儲存不會重跑；
    // createOrder 本身也有同版本去重，與報價列表的手動開單按鈕不會重複建單。
    // 已拒絕／已取代的版本不開單——回簽後又被拒的情況確實存在
    // （CA-202607-009-Q01-V02），那種單開出來是錯的。
    if (shouldAutoCreateOrderOnArchive(existing, updated)) {
      // 放 after()：歸檔要先存檔成功，開單慢或失敗都不該讓內勤看到「儲存失敗」
      const amountText = `NT$ ${(updated.totalAmount ?? 0).toLocaleString()}`;
      after(async () => {
        let orderId = "";
        try {
          const created = await createOrder(client, {
            sourceType: "quote",
            versionId,
            createdBy: "回簽歸檔自動開單",
          });
          orderId = created.orderId;
        } catch {
          orderId = "";
        }
        try {
          await appendNotification({
            type: "quote_signed",
            title: orderId ? "合約已歸檔，訂單已自動建立" : "合約已歸檔（訂單未建立）",
            body: orderId
              ? `${updated.contactNameSnapshot || updated.clientNameSnapshot || "客戶"} 的 ${updated.quoteId}（${amountText}）已歸檔回簽合約，已自動開立訂單 ${orderId}，請補上交期與排程`
              : `${updated.contactNameSnapshot || updated.clientNameSnapshot || "客戶"} 的 ${updated.quoteId}（${amountText}）已歸檔回簽合約，但自動開單未成功，請到報價紀錄手動建立訂製訂單`,
            link: orderId ? `/orders/${orderId}` : "/quotes",
          });
        } catch {
          // 通知失敗不影響已完成的歸檔與開單
        }
      });
    }

    return NextResponse.json({ ok: true, version: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
