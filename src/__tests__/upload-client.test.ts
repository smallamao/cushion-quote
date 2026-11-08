import { describe, it, expect } from "vitest";

import { readJson } from "@/lib/read-json";
import {
  MAX_UPLOAD_BYTES,
  needsCompression,
  scaledSize,
  tooLargeMessage,
} from "@/lib/upload-client";

// 老闆 2026-11-08：訂製訂單上傳附圖跳出
//   Unexpected token 'R', "Request En"... is not valid JSON
// 實測線上：5MB 檔案被 Vercel 擋在函式外（4.5MB 上限），回純文字 413
// 「Request Entity Too Large / FUNCTION_PAYLOAD_TOO_LARGE」，前端卻直接 res.json()。

describe("readJson：平台層 413 純文字", () => {
  it("回看得懂的中文，不是 JSON 解析錯誤", async () => {
    const res = new Response("Request Entity Too Large\n\nFUNCTION_PAYLOAD_TOO_LARGE\n", {
      status: 413,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
    const json = await readJson<{ ok?: boolean; error?: string }>(res);
    expect(json.ok).toBe(false);
    expect(json.error).toContain("太大");
    expect(json.error).not.toContain("Request Entity");
  });

  it("正常 JSON 照舊解析", async () => {
    const res = new Response(JSON.stringify({ ok: true, url: "https://x" }), { status: 200 });
    expect(await readJson<{ ok?: boolean; url?: string }>(res)).toEqual({ ok: true, url: "https://x" });
  });
});

describe("needsCompression", () => {
  const MB = 1024 * 1024;
  it("手機照片（大於 1.5MB 的 JPEG/PNG/WebP）要壓", () => {
    expect(needsCompression({ type: "image/jpeg", size: 6 * MB })).toBe(true);
    expect(needsCompression({ type: "image/png", size: 3 * MB })).toBe(true);
    expect(needsCompression({ type: "image/heic", size: 3 * MB })).toBe(true);
  });
  it("小圖保持原畫質；PDF、影片、GIF、SVG 不碰", () => {
    expect(needsCompression({ type: "image/jpeg", size: 1 * MB })).toBe(false);
    expect(needsCompression({ type: "application/pdf", size: 8 * MB })).toBe(false);
    expect(needsCompression({ type: "video/mp4", size: 20 * MB })).toBe(false);
    expect(needsCompression({ type: "image/gif", size: 5 * MB })).toBe(false);
    expect(needsCompression({ type: "image/svg+xml", size: 5 * MB })).toBe(false);
  });
});

describe("scaledSize", () => {
  it("長邊縮到上限、等比例；已經夠小就不放大", () => {
    expect(scaledSize(4032, 3024, 2560)).toEqual({ width: 2560, height: 1920 });
    expect(scaledSize(3024, 4032, 2560)).toEqual({ width: 1920, height: 2560 });
    expect(scaledSize(1200, 800, 2560)).toEqual({ width: 1200, height: 800 });
  });
});

describe("上傳上限", () => {
  it("留在 Vercel 4.5MB 之下（multipart 表頭還要佔一點）", () => {
    expect(MAX_UPLOAD_BYTES).toBeLessThan(4.5 * 1024 * 1024);
  });
  it("太大的訊息寫出檔名、大小與上限", () => {
    const msg = tooLargeMessage({ name: "掃描.pdf", size: 7.3 * 1024 * 1024 });
    expect(msg).toContain("掃描.pdf");
    expect(msg).toContain("7.3MB");
    expect(msg).toContain("4MB");
  });
});
