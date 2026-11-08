/**
 * 瀏覽器端上傳到 /api/upload 的唯一入口。
 *
 * 🔴 2026-11-08：訂製訂單上傳附圖跳出 `Unexpected token 'R', "Request En"... is not valid JSON`。
 *    實測線上：Vercel 函式的請求上限是 4.5MB，超過就在進到我們程式之前被擋掉，
 *    回純文字 413「Request Entity Too Large / FUNCTION_PAYLOAD_TOO_LARGE」。
 *    伺服器端寫的「圖片 15MB」根本到不了；手機照片 5～12MB 是常態。
 *    原本九個上傳點各自 fetch + res.json()，沒有一個壓縮、沒有一個處理非 JSON。
 *
 * 做法：照片上傳前在瀏覽器縮圖（長邊 2560、JPEG 85%），壓完仍超過 4MB 就不送，
 * 直接講清楚；回應一律走 readJson，413 變成看得懂的中文。
 */

import { readJson } from "@/lib/read-json";

/** Vercel 4.5MB 上限扣掉 multipart 表頭與欄位的餘裕 */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
/** 小於這個大小的照片保留原畫質 */
const COMPRESS_ABOVE_BYTES = 1.5 * 1024 * 1024;
/** 長邊像素：A4 工單滿版約 2480，看細節（車線、布紋）也夠 */
const MAX_EDGE_PX = 2560;
const JPEG_QUALITY = 0.85;

/** 動圖與向量圖畫進 canvas 會壞掉，PDF／影片不是圖，都不壓 */
const NEVER_COMPRESS = new Set(["image/gif", "image/svg+xml"]);

export function needsCompression(file: { type: string; size: number }): boolean {
  return (
    file.type.startsWith("image/") &&
    !NEVER_COMPRESS.has(file.type) &&
    file.size > COMPRESS_ABOVE_BYTES
  );
}

export function scaledSize(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const ratio = maxEdge / longest;
  return { width: Math.round(width * ratio), height: Math.round(height * ratio) };
}

export function tooLargeMessage(file: { name: string; size: number }): string {
  const mb = (file.size / (1024 * 1024)).toFixed(1);
  const limit = Math.round(MAX_UPLOAD_BYTES / (1024 * 1024));
  return `「${file.name}」${mb}MB 太大，上傳上限 ${limit}MB。照片請改用較小尺寸；影片請剪短；PDF 請先壓縮或分頁。`;
}

/**
 * 照片縮成長邊 2560 的 JPEG。瀏覽器解不開（例：電腦版 Chrome 遇到 HEIC）或壓完反而更大時，
 * 回傳原檔——交給大小檢查決定能不能送，不要因為壓縮失敗擋掉本來就夠小的檔案。
 */
export async function compressImageIfNeeded(file: File): Promise<File> {
  if (!needsCompression(file) || typeof createImageBitmap !== "function") return file;
  try {
    // from-image：手機直拍照片的 EXIF 方向要套用，不然縮完會躺著
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const { width, height } = scaledSize(bitmap.width, bitmap.height, MAX_EDGE_PX);
    const canvas = document.createElement("canvas");
    let blob: Blob | null = null;
    try {
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return file;
      // JPEG 沒有透明，PNG 透明處補白，不然會變黑
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(bitmap, 0, 0, width, height);
      blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    } finally {
      // 一次選很多張大照片時（iOS Safari 記憶體很緊），每張用完立刻釋放
      bitmap.close();
      canvas.width = 0;
      canvas.height = 0;
    }
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return file;
  }
}

export interface UploadResult {
  url: string;
  fileName?: string;
  mimeType?: string;
  size?: number;
}

/**
 * 上傳一個檔案，成功回 { url }，失敗丟出可以直接顯示給使用者的 Error。
 * folder 必須是伺服器白名單上的資料夾（見 cloudinary-upload.ts）。
 */
export async function uploadFile(file: File, options: { folder?: string } = {}): Promise<UploadResult> {
  const prepared = await compressImageIfNeeded(file);
  if (prepared.size > MAX_UPLOAD_BYTES) throw new Error(tooLargeMessage(prepared));

  const fd = new FormData();
  fd.append("file", prepared);
  if (options.folder) fd.append("folder", options.folder);
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  // 壓過還是被平台擋（例：前端判斷不到的情況），給上傳專用的說明
  if (res.status === 413) throw new Error(tooLargeMessage(prepared));
  const json = await readJson<{ ok?: boolean; url?: string; error?: string; fileName?: string; mimeType?: string; size?: number }>(res);
  if (!res.ok || !json.url) throw new Error(json.error || `上傳失敗（HTTP ${res.status}）`);
  return { url: json.url, fileName: json.fileName, mimeType: json.mimeType, size: json.size };
}
