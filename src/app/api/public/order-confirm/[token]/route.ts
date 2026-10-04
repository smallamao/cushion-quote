import { v2 as cloudinary } from "cloudinary";
import { NextResponse } from "next/server";

import { DEPOSIT_PAYMENT_INFO } from "@/lib/deposit-payment";
import { findByToken, writeOrderConfirm } from "@/lib/order-confirm-sheet";
import {
  getOrderDisclosure,
  pickDisclosureItems,
  type PublicOrderConfirmView,
} from "@/lib/order-confirm-types";
import { addCardComment, getCardImageAttachments } from "@/lib/trello-server";

/**
 * 線上下訂確認單的客人端 API（免登入，token 為唯一憑證）。
 *   GET  → 回傳客人要看的內容（照片張數、告知事項、訂金、匯款資訊）
 *   POST → { signatureDataUrl, signerName } 完成簽名確認
 *
 * 🔴 卡號一律由 token 在伺服器端反查，永不接受前端指定，也不回傳給客人端。
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() ?? "";
  return req.headers.get("x-real-ip") ?? "";
}

/** 卡名「P6276 謝純淳」→ 顯示用客戶姓名（沒有編號時整串就是姓名）。 */
function customerNameOf(cardName: string): string {
  const m = cardName.trim().match(/^[PS]\d{3,6}\s*(.*)$/);
  return (m ? m[1] : cardName).trim() || cardName.trim();
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await findByToken(token);
  if (!found) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const c = found.confirm;

  // 照片數量：讀卡片附件。Trello 掛掉不該讓整頁開不起來，失敗就當 0 張。
  let photoCount = 0;
  try {
    photoCount = (await getCardImageAttachments(c.cardId)).length;
  } catch {
    photoCount = 0;
  }

  const disclosure = getOrderDisclosure();
  const view: PublicOrderConfirmView = {
    status: c.status,
    customerName: customerNameOf(c.cardName),
    depositAmount: c.depositAmount,
    photoCount,
    disclosureHeader: disclosure?.header ?? "",
    disclosureItems: pickDisclosureItems(c.checkedIndexes),
    paymentInfo: DEPOSIT_PAYMENT_INFO,
    signerName: c.signerName,
    confirmedAt: c.confirmedAt,
  };
  return NextResponse.json({ ok: true, view });
}

async function uploadSignature(dataUrl: string, label: string): Promise<string> {
  const bytes = Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64");
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: "image",
        folder: "order-confirm",
        public_id: `order_${label}_${Date.now()}`,
      },
      (err, result) => (err || !result ? reject(err ?? new Error("上傳失敗")) : resolve(result.secure_url)),
    );
    stream.end(bytes);
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await findByToken(token);
  if (!found) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const { confirm: c, rowNumber } = found;

  if (c.status === "confirmed") {
    return NextResponse.json({ ok: false, error: "already_confirmed" }, { status: 409 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  const signerName = String(body.signerName ?? "").trim();
  const signatureDataUrl = String(body.signatureDataUrl ?? "");
  if (!signerName) {
    return NextResponse.json({ ok: false, error: "請填寫您的姓名" }, { status: 400 });
  }
  if (!signatureDataUrl.startsWith("data:image/png;base64,")) {
    return NextResponse.json({ ok: false, error: "請先簽名" }, { status: 400 });
  }

  try {
    const signatureUrl = await uploadSignature(signatureDataUrl, c.token);
    const now = new Date().toISOString();
    await writeOrderConfirm(
      {
        ...c,
        status: "confirmed",
        signerName,
        signatureUrl,
        confirmedAt: now,
        signerIp: clientIp(req),
        signerUserAgent: req.headers.get("user-agent") ?? "",
      },
      rowNumber,
    );

    // 回寫 Trello，讓內勤在卡片上也看得到進度（失敗不影響客人已完成的確認）
    try {
      await addCardComment(
        c.cardId,
        `✅ 客人已線上確認下訂\n簽署人：${signerName}\n時間：${now}\n訂金：NT$ ${c.depositAmount.toLocaleString()}`,
      );
    } catch {
      /* best-effort */
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "送出失敗";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
