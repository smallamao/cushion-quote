import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";

let fontBytesCache: Uint8Array | null = null;

async function loadFontBytes(): Promise<Uint8Array> {
  if (!fontBytesCache) {
    const buf = await readFile(path.join(process.cwd(), "public", "fonts", "NotoSansTC-Regular.ttf"));
    fontBytesCache = new Uint8Array(buf);
  }
  return fontBytesCache;
}

export interface SignAuditInfo {
  signerName: string;
  /** 已格式化好的簽署時間字串（例：2026-08-07 23:31 (UTC+8)） */
  signedAtDisplay: string;
  ip: string;
  userAgent: string;
  token: string;
  quoteId: string;
}

/**
 * 把客戶簽名圖與一頁「電子簽署存證」附加到待簽報價單 PDF 後面，回傳已簽 PDF bytes。
 * 用 pdf-lib（純 Node，不需重跑 react-pdf），中文以 NotoSansTC 內嵌（subset）。
 */
export async function bakeSignedPdf(
  unsignedPdf: Uint8Array,
  signaturePng: Uint8Array,
  audit: SignAuditInfo,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(unsignedPdf);
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(await loadFontBytes(), { subset: true });
  const sig = await doc.embedPng(signaturePng);

  const PAGE_W = 595.28;
  const PAGE_H = 841.89;
  const margin = 56;
  const ink = rgb(0.1, 0.1, 0.1);
  const muted = rgb(0.42, 0.42, 0.42);
  const page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - margin;

  page.drawText("電子簽署存證", { x: margin, y: y - 6, size: 20, font, color: ink });
  y -= 34;
  page.drawLine({
    start: { x: margin, y },
    end: { x: PAGE_W - margin, y },
    thickness: 0.8,
    color: rgb(0.82, 0.82, 0.82),
  });
  y -= 28;

  page.drawText("客戶簽名", { x: margin, y, size: 12, font, color: muted });
  y -= 14;

  const maxW = 320;
  const maxH = 150;
  const ratio = Math.min(maxW / sig.width, maxH / sig.height, 1);
  const imgW = sig.width * ratio;
  const imgH = sig.height * ratio;
  y -= imgH;
  page.drawImage(sig, { x: margin, y, width: imgW, height: imgH });
  y -= 32;

  const rows: Array<[string, string]> = [
    ["簽署人", audit.signerName || "—"],
    ["簽署時間", audit.signedAtDisplay],
    ["報價編號", audit.quoteId],
    ["來源 IP", audit.ip || "—"],
    ["裝置資訊", (audit.userAgent || "—").slice(0, 70)],
    ["驗證碼", audit.token],
  ];
  const lineH = 24;
  for (const [label, value] of rows) {
    page.drawText(`${label}：`, { x: margin, y, size: 11, font, color: muted });
    page.drawText(value, { x: margin + 92, y, size: 11, font, color: ink });
    y -= lineH;
  }
  y -= 8;
  page.drawText("本頁為線上電子簽署之存證紀錄，與上述報價單內容一併存檔。", {
    x: margin,
    y,
    size: 9,
    font,
    color: muted,
  });

  return doc.save();
}
