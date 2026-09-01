import { randomUUID } from "node:crypto";

import { v2 as cloudinary } from "cloudinary";

/**
 * Cloudinary 上傳共用層。
 * `/api/upload`（瀏覽器 multipart）與 `/api/sheets/quotes-v2/from-agent`（agent base64）
 * 都走這裡，資料夾、public_id 命名與 PDF 無副檔名的規則只維護一份。
 */

export const CLOUDINARY_FOLDERS = {
  quoteAttachments: "quote-attachments",
  contractAttachments: "contract-attachments",
  afterSalesVideos: "after-sales-videos",
  productImages: "product-images",
} as const;

const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB
const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50 MB (~30s @ 1080p from iPhone)
const MAX_PDF_BYTES = 15 * 1024 * 1024;
const ALLOWED_MIME_PREFIXES = ["image/", "video/"];
const ALLOWED_MIME_EXACT = new Set(["application/pdf"]);

let configured = false;
function ensureConfigured(): boolean {
  if (!process.env.CLOUDINARY_CLOUD_NAME) return false;
  if (!configured) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
    configured = true;
  }
  return true;
}

export function isCloudinaryConfigured(): boolean {
  return ensureConfigured();
}

export function isAllowedMime(type: string): boolean {
  if (ALLOWED_MIME_EXACT.has(type)) return true;
  return ALLOWED_MIME_PREFIXES.some((prefix) => type.startsWith(prefix));
}

export function maxBytesFor(type: string): number {
  if (type.startsWith("video/")) return MAX_VIDEO_BYTES;
  if (type === "application/pdf") return MAX_PDF_BYTES;
  return MAX_IMAGE_BYTES;
}

function resourceTypeFor(type: string): "image" | "video" | "raw" {
  if (type.startsWith("video/")) return "video";
  if (type === "application/pdf") return "raw";
  return "image";
}

export function defaultFolderFor(mimeType: string): string {
  if (mimeType === "application/pdf") return CLOUDINARY_FOLDERS.contractAttachments;
  if (mimeType.startsWith("video/")) return CLOUDINARY_FOLDERS.afterSalesVideos;
  return CLOUDINARY_FOLDERS.quoteAttachments;
}

export interface CloudinaryUploadResult {
  url: string;
  publicId: string;
}

/**
 * 把 buffer 上傳到 Cloudinary，回傳 https 網址。
 * 呼叫端負責先用 isAllowedMime / maxBytesFor 驗過；這裡只做上傳。
 */
export async function uploadBufferToCloudinary(
  data: Buffer,
  mimeType: string,
  folder: string = defaultFolderFor(mimeType),
  resourceTypeOverride?: "image" | "video" | "raw",
): Promise<CloudinaryUploadResult> {
  if (!ensureConfigured()) throw new Error("Cloudinary 未設定");

  const isPdf = mimeType === "application/pdf";
  const isVideo = mimeType.startsWith("video/");
  const prefix = isPdf ? "doc" : isVideo ? "vid" : "img";
  // 注意：PDF 的 public_id 刻意「不」帶 .pdf 副檔名。
  // Cloudinary 帳號預設封鎖 PDF 對外供檔，帶 .pdf 會被認出而回 401；
  // 無副檔名則以 octet-stream 供檔（200），前端讀取時再強制標回 application/pdf。
  const publicId = `${prefix}-${Date.now()}-${randomUUID().slice(0, 8)}`;

  const result = await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        { folder, public_id: publicId, resource_type: resourceTypeOverride ?? resourceTypeFor(mimeType) },
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

  return { url: result.secure_url, publicId: result.public_id };
}

/** 解析 `data:image/jpeg;base64,...` 或純 base64（需另給 mimeType） */
export function decodeBase64Image(
  input: string,
  mimeTypeHint?: string,
): { data: Buffer; mimeType: string } {
  const match = /^data:([\w/+.-]+);base64,(.+)$/s.exec(input.trim());
  const mimeType = match?.[1] ?? mimeTypeHint ?? "";
  const raw = match?.[2] ?? input.trim();
  if (!mimeType) throw new Error("缺少圖片 mimeType");
  return { data: Buffer.from(raw, "base64"), mimeType };
}
