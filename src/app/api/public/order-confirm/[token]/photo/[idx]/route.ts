/**
 * GET /api/public/order-confirm/[token]/photo/[idx]
 * 線上下訂確認單的客人端照片（訂貨單照片／顏色照片，免登入）。
 *
 * 🔴 安全設計與叫料確認同一套：客人只給 token 與第幾張，**卡號由伺服器從 token 反查**。
 * 不做「?url= 由前端指定」的代理——公開頁若接受任意網址，等於誰都能翻遍所有訂單附件。
 * idx 由該卡附件陣列長度夾住，換數字最多只會拿到同一張卡的另一張圖。
 */
import { NextResponse } from "next/server";

import { findByToken } from "@/lib/order-confirm-sheet";
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
