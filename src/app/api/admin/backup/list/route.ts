import { NextResponse } from "next/server";

// 2026-10-15：原本自己解析 cookie 只驗簽章，不查這個帳號現在還在不在職——
// 停用帳號 30 天內照樣進得來。改用 lib/api-auth 的共用守門，停用與降權立刻生效。

import { getActiveSession } from "@/lib/api-auth";
import { getDriveClient } from "@/lib/sheets-client";

const BACKUP_FOLDER_NAME = "營運系統-備份";

async function isAdmin(request: Request): Promise<boolean> {
  const session = await getActiveSession(request);
  return session?.role === "admin";
}

export async function GET(request: Request) {
  if (!await isAdmin(request)) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }

  const drive = await getDriveClient();
  if (!drive) {
    return NextResponse.json(
      { ok: false, error: "Drive client unavailable" },
      { status: 503 },
    );
  }

  try {
    // Find folder
    const folderRes = await drive.files.list({
      q: `name='${BACKUP_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: "files(id)",
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });
    const folderId = folderRes.data.files?.[0]?.id;
    if (!folderId) {
      return NextResponse.json({ ok: true, files: [], folderExists: false });
    }

    const listRes = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false and mimeType='application/json'`,
      fields: "files(id,name,createdTime,size,webViewLink)",
      orderBy: "createdTime desc",
      pageSize: 50,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });
    return NextResponse.json({
      ok: true,
      folderExists: true,
      folderId,
      files: (listRes.data.files ?? []).map((f) => ({
        id: f.id,
        name: f.name,
        createdTime: f.createdTime,
        sizeBytes: Number(f.size ?? 0),
        webViewLink: f.webViewLink,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
