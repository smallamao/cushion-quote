import { randomUUID } from "crypto";

import { v2 as cloudinary } from "cloudinary";
import { NextResponse } from "next/server";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB
const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50 MB (~30s @ 1080p from iPhone)
const MAX_PDF_BYTES = 15 * 1024 * 1024;
const ALLOWED_MIME_PREFIXES = ["image/", "video/"];
const ALLOWED_MIME_EXACT = new Set(["application/pdf"]);

function isAllowedMime(type: string): boolean {
  if (ALLOWED_MIME_EXACT.has(type)) return true;
  return ALLOWED_MIME_PREFIXES.some((prefix) => type.startsWith(prefix));
}

function maxBytesFor(type: string): number {
  if (type.startsWith("video/")) return MAX_VIDEO_BYTES;
  if (type === "application/pdf") return MAX_PDF_BYTES;
  return MAX_IMAGE_BYTES;
}

function resourceTypeFor(type: string): "image" | "video" | "raw" {
  if (type.startsWith("video/")) return "video";
  if (type === "application/pdf") return "raw";
  return "image";
}

export async function POST(request: Request) {
  if (!process.env.CLOUDINARY_CLOUD_NAME) {
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

    const isPdf = entry.type === "application/pdf";
    const isVideo = entry.type.startsWith("video/");
    const folder = typeof folderOverride === "string" && folderOverride
      ? folderOverride
      : isPdf
        ? "contract-attachments"
        : isVideo
          ? "after-sales-videos"
          : "quote-attachments";

    const data = Buffer.from(await entry.arrayBuffer());
    const prefix = isPdf ? "doc" : isVideo ? "vid" : "img";
    const publicId = `${prefix}-${Date.now()}-${randomUUID().slice(0, 8)}`;

    const result = await new Promise<{
      secure_url: string;
      public_id: string;
      resource_type: string;
      format?: string;
    }>((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            folder,
            public_id: publicId,
            resource_type: resourceTypeFor(entry.type),
          },
          (error, uploadResult) => {
            if (error || !uploadResult) {
              reject(error ?? new Error("上傳失敗"));
              return;
            }
            resolve(uploadResult);
          },
        )
        .end(data);
    });

    return NextResponse.json({
      ok: true,
      url: result.secure_url,
      fileName: entry.name,
      mimeType: entry.type,
      size: entry.size,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
