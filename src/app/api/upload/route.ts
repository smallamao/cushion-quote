import { NextResponse } from "next/server";

import { requireSession } from "@/lib/api-auth";
import {
  defaultFolderFor,
  isAllowedMime,
  isAllowedUploadFolder,
  isCloudinaryConfigured,
  maxBytesFor,
  uploadBufferToCloudinary,
} from "@/lib/cloudinary-upload";

export async function POST(request: Request) {
  // 這支在師傅白名單裡（現場照片／簽名上傳），但原本整支沒讀 session。
  // middleware 之外再驗一次。
  const guard = requireSession(request);
  if (guard.denied) return guard.denied;

  if (!isCloudinaryConfigured()) {
    return NextResponse.json({ ok: false, error: "Cloudinary 未設定" }, { status: 503 });
  }

  try {
    const formData = await request.formData();
    const entry = formData.get("file");
    const folderOverride = formData.get("folder");
    if (!(entry instanceof File)) {
      return NextResponse.json({ ok: false, error: "缺少檔案" }, { status: 400 });
    }

    if (!isAllowedMime(entry.type)) {
      return NextResponse.json(
        { ok: false, error: "僅支援圖片、影片或 PDF 檔案" },
        { status: 400 },
      );
    }

    const maxBytes = maxBytesFor(entry.type);
    if (entry.size > maxBytes) {
      const mb = Math.round(maxBytes / (1024 * 1024));
      return NextResponse.json(
        { ok: false, error: `檔案大小不可超過 ${mb}MB` },
        { status: 400 },
      );
    }

    const folder =
      typeof folderOverride === "string" && folderOverride
        ? folderOverride
        : defaultFolderFor(entry.type);

    // 資料夾只能是白名單上的值，不接受前端自由指定
    if (!isAllowedUploadFolder(folder)) {
      return NextResponse.json(
        { ok: false, error: `不允許的上傳目錄：${folder}` },
        { status: 400 },
      );
    }

    const data = Buffer.from(await entry.arrayBuffer());
    const result = await uploadBufferToCloudinary(data, entry.type, folder);

    return NextResponse.json({
      ok: true,
      url: result.url,
      fileName: entry.name,
      mimeType: entry.type,
      size: entry.size,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
