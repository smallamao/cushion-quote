import { NextResponse } from "next/server";
import { Readable } from "stream";

import { SESSION_COOKIE_NAME, verifySession } from "@/lib/auth";
import { getDriveClient, getSheetsClient } from "@/lib/sheets-client";

const BACKUP_FOLDER_NAME = "營運系統-備份";
const KEEP_LAST_N = 30;

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
  const provided = request.headers.get("authorization");
  return provided === `Bearer ${secret}`;
}

function isAdmin(request: Request): boolean {
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .find((c) => c.trim().startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.split("=")[1];
  const session = verifySession(token);
  return !!session && session.role === "admin";
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
  const sizeBytes = Buffer.byteLength(json, "utf8");
  const ts = manifest.createdAt.replace(/[:.]/g, "-");
  const fileName = `backup-${ts}.json`;

  // 3) Upload to Drive backup folder.
  const folderId = await getOrCreateBackupFolder(drive);
  const uploadRes = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
      mimeType: "application/json",
    },
    media: {
      mimeType: "application/json",
      body: Readable.from(Buffer.from(json, "utf8")),
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
      q: `'${folderId}' in parents and trashed=false and mimeType='application/json'`,
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
    sheetCount: sheetTitles.length,
    pruned,
  };
}

export async function GET(request: Request) {
  // Allow either an authenticated admin user or the Vercel Cron secret.
  if (!allowInternalCron(request) && !isAdmin(request)) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }

  try {
    const result = await runBackup();
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.status ?? 500 },
      );
    }
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  // Manual admin trigger (same behavior as GET, separate method kept for
  // semantic clarity in the UI).
  return GET(request);
}
