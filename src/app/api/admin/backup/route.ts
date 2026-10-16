import { NextResponse } from "next/server";

// 2026-10-15：原本自己解析 cookie 只驗簽章，不查這個帳號現在還在不在職——
// 停用帳號 30 天內照樣進得來。改用 lib/api-auth 的共用守門，停用與降權立刻生效。
import { gzipSync } from "node:zlib";
import { Readable } from "stream";

import { getActiveSession } from "@/lib/api-auth";
import { timingSafeEqual } from "@/lib/constant-time";
import { appendAuditLog } from "@/lib/audit-log";
import { appendNotification } from "@/lib/notifications-sheet";
import { getDriveClient, getSheetsClient } from "@/lib/sheets-client";

const BACKUP_FOLDER_NAME = "營運系統-備份";
// 保留 90 份（約 3 個月）。資料被改壞不一定馬上發現——某張報價單的金額被誤改，
// 可能一個月後對帳才看出來，那時 30 天前的版本已經被刪了。
// 實測一份壓縮後約 0.44 MB，90 份約 40 MB，免費額度 15 GB 綽綽有餘。
const KEEP_LAST_N = 90;

interface BackupManifest {
  spreadsheetId: string;
  spreadsheetTitle: string;
  createdAt: string; // ISO
  sheets: Array<{ title: string; rowCount: number; columnCount: number }>;
}

interface BackupPayload {
  manifest: BackupManifest;
  data: Record<string, string[][]>;
}

function allowInternalCron(request: Request): boolean {
  // Vercel Cron sends requests with this header set to the deployment's
  // CRON_SECRET. If configured, accept; otherwise fall back to auth cookie.
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const provided = request.headers.get("authorization") ?? "";
  return timingSafeEqual(provided, `Bearer ${secret}`);
}

async function isAdmin(request: Request): Promise<boolean> {
  const session = await getActiveSession(request);
  return session?.role === "admin";
}

async function getOrCreateBackupFolder(
  drive: NonNullable<Awaited<ReturnType<typeof getDriveClient>>>,
): Promise<string> {
  const listRes = await drive.files.list({
    q: `name='${BACKUP_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id)",
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
  });
  const existing = listRes.data.files?.[0];
  if (existing?.id) return existing.id;

  // Create under the first available drive root. The Service Account
  // needs permission to create folders; if the backups folder should
  // live inside a shared drive, the admin can pre-create it and share
  // it with the Service Account.
  const createRes = await drive.files.create({
    requestBody: {
      name: BACKUP_FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
    },
    fields: "id",
    supportsAllDrives: true,
  });
  const id = createRes.data.id;
  if (!id) throw new Error("無法建立備份資料夾");
  return id;
}

async function runBackup(): Promise<{
  ok: true;
  fileId: string;
  fileName: string;
  sizeBytes: number;
  rawBytes: number;
  sheetCount: number;
  pruned: number;
} | { ok: false; error: string; status?: number }> {
  const sheetsClient = await getSheetsClient();
  const drive = await getDriveClient();
  if (!sheetsClient || !drive) {
    return { ok: false, error: "Google Sheets / Drive 尚未設定", status: 503 };
  }

  // 1) List all sheets in the spreadsheet.
  const meta = await sheetsClient.sheets.spreadsheets.get({
    spreadsheetId: sheetsClient.spreadsheetId,
  });
  const sheets = meta.data.sheets ?? [];
  const sheetTitles = sheets
    .map((s) => s.properties?.title)
    .filter((t): t is string => !!t);

  // 2) batchGet all sheet data.
  const ranges = sheetTitles.map((title) => `${title}`);
  const batch = await sheetsClient.sheets.spreadsheets.values.batchGet({
    spreadsheetId: sheetsClient.spreadsheetId,
    ranges,
    majorDimension: "ROWS",
  });
  const valueRanges = batch.data.valueRanges ?? [];

  const data: Record<string, string[][]> = {};
  const manifestSheets: BackupManifest["sheets"] = [];
  for (let i = 0; i < sheetTitles.length; i++) {
    const title = sheetTitles[i];
    const rows = (valueRanges[i]?.values ?? []) as string[][];
    data[title] = rows;
    const props = sheets[i].properties?.gridProperties;
    manifestSheets.push({
      title,
      rowCount: rows.length,
      columnCount: props?.columnCount ?? 0,
    });
  }

  const manifest: BackupManifest = {
    spreadsheetId: sheetsClient.spreadsheetId,
    spreadsheetTitle: meta.data.properties?.title ?? "",
    createdAt: new Date().toISOString(),
    sheets: manifestSheets,
  };
  const payload: BackupPayload = { manifest, data };

  const json = JSON.stringify(payload);
  const rawBytes = Buffer.byteLength(json, "utf8");
  // 純文字壓得特別好：實測 2.92 MB → 0.44 MB（6.6 倍）。
  // 備份是「平常不看、出事才要」的東西，壓縮的代價只有還原時多一步 gunzip。
  const gz = gzipSync(Buffer.from(json, "utf8"));
  const sizeBytes = gz.length;
  const ts = manifest.createdAt.replace(/[:.]/g, "-");
  const fileName = `backup-${ts}.json.gz`;

  // 3) Upload to Drive backup folder.
  const folderId = await getOrCreateBackupFolder(drive);
  const uploadRes = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
      mimeType: "application/gzip",
    },
    media: {
      mimeType: "application/gzip",
      body: Readable.from(gz),
    },
    fields: "id,name",
    supportsAllDrives: true,
  });
  const fileId = uploadRes.data.id;
  if (!fileId) {
    return { ok: false, error: "備份上傳失敗 (no fileId)", status: 500 };
  }

  // 4) Prune older backups, keep last N.
  let pruned = 0;
  try {
    const listRes = await drive.files.list({
      // 認 json 與 gzip 兩種：2026-10-16 之前的備份是未壓縮的 .json，
      // 只比對 gzip 的話那些舊檔永遠不會被清掉
      q: `'${folderId}' in parents and trashed=false and (mimeType='application/json' or mimeType='application/gzip')`,
      fields: "files(id,name,createdTime)",
      orderBy: "createdTime desc",
      pageSize: 100,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });
    const files = listRes.data.files ?? [];
    const extra = files.slice(KEEP_LAST_N);
    for (const f of extra) {
      if (!f.id) continue;
      try {
        await drive.files.delete({ fileId: f.id, supportsAllDrives: true });
        pruned++;
      } catch {
        /* ignore individual delete failures */
      }
    }
  } catch {
    /* pruning is best-effort */
  }

  return {
    ok: true,
    fileId,
    fileName,
    sizeBytes,
    rawBytes,
    sheetCount: sheetTitles.length,
    pruned,
  };
}

/**
 * 備份失敗一定要讓人看到。
 *
 * 🔴 2026-10-15：實查服務帳號的 Drive——「營運系統-備份」資料夾在 10-13 建立成功，
 *    但裡面 0 個檔案。進一步用 drive.about.get 查，服務帳號的 storageQuota limit
 *    是 0；試上傳 12 bytes 直接被拒，Google 的錯誤訊息是
 *      "Service Accounts do not have storage quota."
 *    也就是說：資料夾建得起來（資料夾不佔空間），檔案永遠上傳不上去。
 *    這個備份從設定以來一次都沒成功，而且照現在的設計永遠不會成功。
 *
 *    修好儲存位置之前，至少不能再「安靜地失敗」——這正是老闆記錄過的
 *    「排程有跑不等於有產出」。失敗就寫一筆通知到後台。
 */
async function notifyBackupFailure(detail: string): Promise<void> {
  try {
    await appendNotification({
      type: "backup_failed",
      title: "每日備份失敗",
      body:
        `${new Date().toISOString().slice(0, 16).replace("T", " ")} 的備份沒有產出檔案。` +
        `原因：${detail}。` +
        `備份是誤刪或資料被改壞時唯一的救援手段，請盡快處理。`,
      link: "/settings",
    });
  } catch {
    // 通知失敗不能再讓整個端點爆掉
  }
}

/**
 * 成功也要留下紀錄。
 *
 * 🔴 只有「失敗通知」是不夠的：萬一排程根本沒被觸發，就不會有任何失敗事件，
 *    畫面上一片安靜，而你會以為備份正常。這正是這次踩到的坑——備份資料夾
 *    10-13 就建好了，看起來像在運作，實際上一個檔案都沒有。
 *    所以成功時也寫一筆，你才看得到「最後一次成功是什麼時候」。
 */
function recordBackupSuccess(info: {
  fileName: string;
  sizeBytes: number;
  rawBytes: number;
  sheetCount: number;
}): void {
  try {
    const mb = (n: number) => (n / 1048576).toFixed(2);
    appendAuditLog({
      actor: "system",
      action: "create",
      targetType: "backup",
      targetId: info.fileName,
      summary:
        `${info.sheetCount} 個分頁，` +
        `${mb(info.rawBytes)} MB → 壓縮後 ${mb(info.sizeBytes)} MB`,
    });
  } catch {
    // 記錄失敗不能讓備份本身被判定成失敗
  }
}

export async function GET(request: Request) {
  // Allow either an authenticated admin user or the Vercel Cron secret.
  if (!allowInternalCron(request) && !await isAdmin(request)) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }

  try {
    const result = await runBackup();
    if (!result.ok) {
      await notifyBackupFailure(result.error ?? "unknown");
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.status ?? 500 },
      );
    }
    recordBackupSuccess(result);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    await notifyBackupFailure(message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  // Manual admin trigger (same behavior as GET, separate method kept for
  // semantic clarity in the UI).
  return GET(request);
}
