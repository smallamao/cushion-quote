import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME, verifySession } from "@/lib/auth";
import { getDriveClient } from "@/lib/sheets-client";

const BACKUP_FOLDER_NAME = "營運系統-備份";

function isAdmin(request: Request): boolean {
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .find((c) => c.trim().startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.split("=")[1];
  const session = verifySession(token);
  return !!session && session.role === "admin";
}

export async function GET(request: Request) {
  if (!isAdmin(request)) {
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
