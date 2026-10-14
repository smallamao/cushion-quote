import { randomUUID } from "node:crypto";

import { v2 as cloudinary } from "cloudinary";

/**
 * Cloudinary 上傳共用層。
 * `/api/upload`（瀏覽器 multipart）與 `/api/sheets/quotes-v2/from-agent`（agent base64）
 * 都走這裡，資料夾、public_id 命名與 PDF 無副檔名的規則只維護一份。
 */

export const CLOUDINARY_FOLDERS = {
  quoteAttachments: "quote-attachments",
  signingUnsigned: "signing-unsigned",
  contractAttachments: "contract-attachments",
  afterSalesVideos: "after-sales-videos",
  productImages: "product-images",
} as const;

/**
 * `/api/upload` 允許寫入的資料夾白名單。
 *
 * 🔴 2026-10-15 修補：原本 folder 直接吃前端給的任意字串，任何登入者都能往
 *    Cloudinary 的任意目錄丟檔案——資產會散落，額度也會被吃掉。
 *    這份清單是實際清查「前端真的會傳的值 ＋ defaultFolderFor 的輸出 ＋
 *    CLOUDINARY_FOLDERS」得出的，不是猜的。
 *    新增上傳點時要同時補這裡，否則上傳會收到 400（故意的：寧可明確壞掉，
 *    也不要靜默寫到別的目錄去）。
 */
const UPLOAD_ALLOWED_FOLDERS = new Set<string>([
  "quote-attachments", // 報價附圖（預設）
  "signing-unsigned", // 待簽的報價單
  "contract-attachments", // PDF 附件（預設）
  "after-sales-videos", // 售後影片（預設）
  "product-images", // 商品圖
  "after-sales-signatures", // 售後現場簽名
  "purchase-products", // 採購商品圖
  "work-order-pdfs", // 工單 PDF
  "notion-workorders", // 工單圖
  "notion-quotes", // 報價圖
  "client-po", // 客供底單
  "signed-contracts", // 簽好的合約
]);

export function isAllowedUploadFolder(folder: string): boolean {
  return UPLOAD_ALLOWED_FOLDERS.has(folder);
}

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
  /** 多頁 PDF 以 image 型別上傳時，Cloudinary 會回傳頁數；其他檔案為 undefined */
  pages?: number;
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

  const result = await new Promise<{ secure_url: string; public_id: string; pages?: number }>((resolve, reject) => {
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

  return { url: result.secure_url, publicId: result.public_id, pages: result.pages };
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
