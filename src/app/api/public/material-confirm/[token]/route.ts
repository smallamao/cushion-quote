/**
 * 叫料確認單 公開 API（免登入，token 為唯一憑證）。
 *   GET  → 客人端檢視資料（照片只回張數，圖走 /photo/{i}）
 *   POST → { action:"confirm", signatureDataUrl, signerName, slots[] }
 *          { action:"dispute", note }
 *
 * 確認即合約分界線（訂貨單條款：確認查收叫料通知後不得取消、訂金不退），
 * 因此一併留存簽名圖、時間、IP 與裝置，並把結果寫回 Trello 留言＋待辦事項。
 */
import { v2 as cloudinary } from "cloudinary";
import { NextResponse } from "next/server";

import { appendNotification } from "@/lib/notifications-sheet";
import { findByToken, writeConfirm } from "@/lib/material-confirm-sheet";
import {
  normalizeDeliveryPeriod,
  type PreferredSlot,
  type PublicMaterialConfirmView,
} from "@/lib/material-confirm-types";
import {
  addCardComment,
  addCheckItem,
  ensureTodoChecklist,
  getCardEstimatedDate,
  getCardImageAttachments,
  rocDateLabel,
  toTaipeiYmd,
} from "@/lib/trello-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const WEEKDAY = ["日", "一", "二", "三", "四", "五", "六"];

function fmtSlot(s: PreferredSlot): string {
  const t = Date.parse(`${s.date}T00:00:00+08:00`);
  if (!Number.isFinite(t)) return `${s.date} ${s.period}`;
  const d = new Date(t + 8 * 60 * 60 * 1000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WEEKDAY[d.getUTCDay()]}) ${s.period}`;
}

function fmtTaipei(iso: string): string {
  const t = new Date(new Date(iso).getTime() + 8 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())} ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())} (UTC+8)`;
}

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() ?? "";
  return req.headers.get("x-real-ip") ?? "";
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await findByToken(token);
  if (!found) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const c = found.confirm;

  // 照片張數當下重抓——老闆常在建卡之後才補照片，用建連結當下的快照會少圖。
  let photoCount = 0;
  try {
    photoCount = (await getCardImageAttachments(c.cardId)).length;
  } catch {
    /* 取不到就當 0 張，頁面會顯示「照片載入失敗」而不是整頁壞掉 */
  }

  // 預計完工日當下重抓（出貨日常常是舊的，見 getCardEstimatedDate 註解）；
  // 抓不到才退回建連結當下存的出貨日。
  let estimatedDate = "";
  try {
    estimatedDate = await getCardEstimatedDate(c.cardId);
  } catch {
    estimatedDate = toTaipeiYmd(c.dueDate);
  }

  const view: PublicMaterialConfirmView = {
    status: c.status,
    orderNumber: c.orderNumber,
    customerName: c.customerName,
    estimatedDate,
    photoCount,
    preferredSlots: c.preferredSlots,
    confirmedAt: c.confirmedAt,
    disputeNote: c.disputeNote,
  };
  return NextResponse.json({ ok: true, view });
}

async function uploadSignature(dataUrl: string, orderNumber: string): Promise<string> {
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
  const bytes = Buffer.from(base64, "base64");
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: "image",
        folder: "material-confirm",
        public_id: `confirm_${orderNumber}_${Date.now()}`,
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

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  const action = String(body.action ?? "");

  try {
    // ── 客人回報內容有誤 ──────────────────────────────
    if (action === "dispute") {
      const note = String(body.note ?? "").trim();
      if (!note) return NextResponse.json({ ok: false, error: "請描述哪裡有誤" }, { status: 400 });
      if (c.status === "confirmed") {
        return NextResponse.json({ ok: false, error: "already_confirmed" }, { status: 409 });
      }
      await writeConfirm({ ...c, status: "disputed", disputeNote: note }, rowNumber);
      await addCardComment(
        c.cardId,
        `【叫料確認單】⚠️ 客戶回報內容有誤\n時間：${fmtTaipei(new Date().toISOString())}\n\n客戶描述：\n${note}\n\n※ 尚未確認，請先處理後重發確認連結。`,
      ).catch(() => {});
      await appendNotification({
        type: "material_confirm",
        title: `⚠️ ${c.orderNumber} 客戶回報訂單內容有誤`,
        body: note.slice(0, 120),
        link: "/material-confirm",
      });
      return NextResponse.json({ ok: true, status: "disputed" });
    }

    // ── 客人確認並簽名 ────────────────────────────────
    if (action !== "confirm") {
      return NextResponse.json({ ok: false, error: "bad_action" }, { status: 400 });
    }
    if (c.status === "confirmed") {
      return NextResponse.json({ ok: false, error: "already_confirmed" }, { status: 409 });
    }
    const signatureDataUrl = String(body.signatureDataUrl ?? "");
    if (!signatureDataUrl.startsWith("data:image/png;base64,")) {
      return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 400 });
    }
    const signerName = String(body.signerName ?? "").trim();
    if (!signerName) return NextResponse.json({ ok: false, error: "missing_name" }, { status: 400 });

    const rawSlots = Array.isArray(body.slots) ? (body.slots as Array<{ date?: string; period?: string }>) : [];
    const slots: PreferredSlot[] = rawSlots
      .filter((s) => s && typeof s.date === "string" && s.date)
      .slice(0, 3)
      .map((s) => ({ date: s.date as string, period: normalizeDeliveryPeriod(s.period) }));
    if (slots.length === 0) {
      return NextResponse.json({ ok: false, error: "請至少選一組希望收件日期" }, { status: 400 });
    }
    if (!process.env.CLOUDINARY_CLOUD_NAME) {
      return NextResponse.json({ ok: false, error: "Cloudinary 未設定" }, { status: 503 });
    }

    const signatureUrl = await uploadSignature(signatureDataUrl, c.orderNumber || "order");
    const confirmedAt = new Date().toISOString();
    await writeConfirm(
      {
        ...c,
        status: "confirmed",
        signerName,
        signatureUrl,
        confirmedAt,
        preferredSlots: slots,
        disputeNote: "",
        signerIp: clientIp(req),
        signerUserAgent: (req.headers.get("user-agent") ?? "").slice(0, 300),
      },
      rowNumber,
    );

    // Trello 回寫：留言放完整證據，待辦事項放狀態（沿用訂金/尾款的既有寫法）。
    // 任何一邊失敗都不該讓客人看到錯誤——確認本身已經存進 Google 表了。
    const slotLines = slots.map((s, i) => `${i + 1}. ${fmtSlot(s)}`).join("\n");
    await addCardComment(
      c.cardId,
      [
        "【叫料確認單】✅ 客戶已確認訂單內容",
        `確認時間：${fmtTaipei(confirmedAt)}`,
        `簽署人：${signerName}`,
        "",
        "希望收件日期（客戶提供，實際仍以排車為準）",
        slotLines,
        "",
        `簽名檔：${signatureUrl}`,
      ].join("\n"),
    ).catch(() => {});
    try {
      const checklistId = await ensureTodoChecklist(c.cardId);
      await addCheckItem(checklistId, `${rocDateLabel()} 客戶已確認叫料內容`, true);
    } catch {
      /* checklist 失敗不影響確認結果 */
    }

    await appendNotification({
      type: "material_confirm",
      title: `✅ ${c.orderNumber} 客戶已確認叫料`,
      body: `${signerName}　希望收件：${slots.map(fmtSlot).join("、")}`,
      link: "/material-confirm",
    });

    return NextResponse.json({ ok: true, status: "confirmed" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
