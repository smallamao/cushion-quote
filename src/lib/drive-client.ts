import "server-only";

import { Readable } from "stream";

import { getDriveClient } from "./sheets-client";

const FOLDER_NAME = "營運系統-名片";

async function getOrCreateFolder(drive: Awaited<ReturnType<typeof getDriveClient>>): Promise<string> {
  if (!drive) throw new Error("Drive client unavailable");

  const listRes = await drive.files.list({
    q: `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id)",
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
  });

  const existing = listRes.data.files?.[0];
  if (existing?.id) {
    return existing.id;
  }

  throw new Error(`找不到共享資料夾「${FOLDER_NAME}」，請先在 Google Drive 建立並共享給 Service Account`);
}

export async function uploadBusinessCardImage(
  imageBuffer: Buffer,
  fileName: string,
  mimeType: string,
): Promise<string> {
  const drive = await getDriveClient();
  if (!drive) throw new Error("Drive client unavailable");

  const folderId = await getOrCreateFolder(drive);

  const uploadRes = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: Readable.from(imageBuffer),
    },
    fields: "id",
    supportsAllDrives: true,
  });

  const fileId = uploadRes.data.id;
  if (!fileId) throw new Error("Upload failed: no file ID returned");

  await drive.permissions.create({
    fileId,
    requestBody: {
      role: "reader",
      type: "anyone",
    },
    supportsAllDrives: true,
  });

  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`;
}
