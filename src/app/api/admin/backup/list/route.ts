import { NextResponse } from "next/server";

// 2026-10-15：原本自己解析 cookie 只驗簽章，不查這個帳號現在還在不在職——
// 停用帳號 30 天內照樣進得來。改用 lib/api-auth 的共用守門，停用與降權立刻生效。

import { getActiveSession } from "@/lib/api-auth";
import {
  getUserDriveClient,
  loadDriveConnection,
  toPublicStatus,
} from "@/lib/drive-backup-auth";
import { BACKUP_FOLDER_QUERY } from "@/lib/drive-backup-credential";

export const dynamic = "force-dynamic";

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

  try {
    // 2026-11-01：備份改存老闆的 Drive，列表也要用老闆的身分看，
    // 服務帳號看不到那邊的檔案。連結狀態一起回，畫面才知道要不要叫人去連結。
    const access = await getUserDriveClient();
    // 讀狀態放在換 token 之後：換 token 失敗時會把狀態標成失效，這裡要拿到最新的
    const connection = toPublicStatus(await loadDriveConnection());
    if (!access.ok) {
      return NextResponse.json({
        ok: true,
        connection,
        driveError: access.reason,
        files: [],
        folderExists: false,
      });
    }
    const drive = access.auth;

    const folderRes = await drive.files.list({
      q: BACKUP_FOLDER_QUERY,
      fields: "files(id)",
      orderBy: "createdTime",
    });
    const folderId = folderRes.data.files?.[0]?.id;
    if (!folderId) {
      return NextResponse.json({ ok: true, connection, files: [], folderExists: false });
    }

    const listRes = await drive.files.list({
      // 2026-10-16 之後的備份是 gzip，原本只列 json 會一份都看不到
      q: `'${folderId}' in parents and trashed=false and (mimeType='application/json' or mimeType='application/gzip')`,
      fields: "files(id,name,createdTime,size,webViewLink)",
      orderBy: "createdTime desc",
      pageSize: 100,
    });
    return NextResponse.json({
      ok: true,
      connection,
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
