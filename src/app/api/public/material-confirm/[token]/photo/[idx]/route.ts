/**
 * GET /api/public/material-confirm/[token]/photo/[idx]
 * 客人端訂單照片（免登入）。
 *
 * 🔴 安全設計：客人只給 token 與第幾張，**卡號由伺服器從 token 反查**。
 * 刻意不做成「?url= 由前端指定」那種代理（員工版 attachment-proxy 是那樣，
 * 但它要求已登入）——公開版若接受任意網址，等於誰都能翻遍所有訂單附件。
 * idx 也一律用該卡的附件陣列長度夾住，換數字最多只會拿到同一張卡的另一張圖。
 */
import { NextResponse } from "next/server";

import { findByToken } from "@/lib/material-confirm-sheet";
import { fetchAttachmentImage, getCardImageAttachments } from "@/lib/trello-server";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string; idx: string }> },
) {
  const { token, idx } = await params;

  const found = await findByToken(token);
  if (!found) return new NextResponse("not_found", { status: 404 });

  const i = Number.parseInt(idx, 10);
  if (!Number.isInteger(i) || i < 0) return new NextResponse("bad_index", { status: 400 });

  let attachments;
  try {
    attachments = await getCardImageAttachments(found.confirm.cardId);
  } catch {
    return new NextResponse("trello_error", { status: 502 });
  }
  const target = attachments[i];
  if (!target) return new NextResponse("not_found", { status: 404 });

  // 縮圖給清單用，原圖給放大用
  const preferFull = new URL(request.url).searchParams.get("size") !== "thumb";
  const img = await fetchAttachmentImage(target, preferFull);
  if (!img) return new NextResponse("image_unavailable", { status: 502 });

  return new NextResponse(img.body, {
    headers: {
      "Content-Type": img.contentType,
      // 連結是客人私有的，不可進共用快取
      "Cache-Control": "private, max-age=3600",
    },
  });
}
