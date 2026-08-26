import crypto from "node:crypto";
import { NextResponse } from "next/server";

import {
  decodeBase64Image,
  isAllowedMime,
  maxBytesFor,
  uploadBufferToCloudinary,
  CLOUDINARY_FOLDERS,
} from "@/lib/cloudinary-upload";
import type { Channel, LeadSource } from "@/lib/types";
import { POST as createCaseHandler } from "../../cases/route";
import { PATCH as patchVersionHandler } from "../../versions/[versionId]/route";
import { POST as createQuoteHandler } from "../route";

export const dynamic = "force-dynamic";

/**
 * 對話 agent（quote-drafter skill）建立「草稿」報價的整合端點。
 * 以 x-api-key（AGENT_API_KEY）驗證，與排程系統的 from-paste 同一模式。
 *
 * POST  建案件＋報價＋版本＋品項（永遠 draft，發送權在操作者）
 * PATCH 幫既有版本補「補充說明附圖」
 *
 * 內部直接組合既有的 cases POST / quotes-v2 POST / versions PATCH，不重複寫入邏輯。
 */

interface AgentLine {
  itemName: string;
  spec?: string;
  qty: number;
  unit?: string;
  unitPrice: number;
  isCostItem?: boolean;
  notes?: string;
}

interface AgentClient {
  /** 公司名稱，B2B 才填。散客一律留空（否則會跑到報價單「公司」欄） */
  company?: string;
  /** 對外顯示的人名；散客慣例「S編號 姓名」，例：S962 陳美惠 */
  name: string;
  phone?: string;
  channel?: Channel;
  address?: string;
  leadSource?: LeadSource;
}

interface AgentImage {
  /** 可含 `data:image/jpeg;base64,` 前綴；純 base64 需另給 mimeType */
  base64: string;
  mimeType?: string;
}

interface AgentQuotePayload {
  /** 既有案件可直接指定；留空則以 client 建新案件 */
  caseId?: string;
  client?: AgentClient;
  /** 散客留空 → 不進案件紀錄 */
  caseName?: string;
  quoteName?: string;
  quoteDate?: string;
  validUntil?: string;
  /** 百分比，5 = 5%；0 = 未稅 */
  taxRate?: number;
  channel?: Channel;
  publicDescription?: string;
  /** 補充說明附圖：已在線上的網址，或由端點代為上傳的 base64 */
  descriptionImageUrl?: string;
  descriptionImage?: AgentImage;
  internalNotes?: string;
  lines: AgentLine[];
}

interface AgentAttachImagePayload {
  versionId: string;
  descriptionImageUrl?: string;
  descriptionImage?: AgentImage;
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function authorize(request: Request): NextResponse | null {
  const configuredKey = process.env.AGENT_API_KEY?.trim();
  if (!configuredKey) {
    return NextResponse.json({ ok: false, error: "AGENT_API_KEY 未設定，端點停用" }, { status: 503 });
  }
  const providedKey = request.headers.get("x-api-key")?.trim() ?? "";
  if (!providedKey || !timingSafeEqualStr(providedKey, configuredKey)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return null;
}

function taipeiToday(): string {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function internalRequest(path: string, body: unknown, method: "POST" | "PATCH" = "POST"): Request {
  return new Request(`http://internal${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** 附圖：優先用給定網址；否則把 base64 上傳到 Cloudinary（同編輯器的 quote-attachments） */
async function resolveDescriptionImageUrl(
  url: string | undefined,
  image: AgentImage | undefined,
): Promise<string> {
  if (url?.trim()) return url.trim();
  if (!image?.base64) return "";
  const { data, mimeType } = decodeBase64Image(image.base64, image.mimeType);
  if (!mimeType.startsWith("image/") || !isAllowedMime(mimeType)) {
    throw new Error(`附圖僅支援圖片格式（收到 ${mimeType || "未知"}）`);
  }
  if (data.length > maxBytesFor(mimeType)) {
    throw new Error("附圖超過 15MB");
  }
  const uploaded = await uploadBufferToCloudinary(data, mimeType, CLOUDINARY_FOLDERS.quoteAttachments);
  return uploaded.url;
}

export async function POST(request: Request) {
  const denied = authorize(request);
  if (denied) return denied;

  let payload: AgentQuotePayload;
  try {
    payload = (await request.json()) as AgentQuotePayload;
  } catch {
    return NextResponse.json({ ok: false, error: "格式錯誤" }, { status: 400 });
  }
  if (!Array.isArray(payload.lines) || payload.lines.length === 0) {
    return NextResponse.json({ ok: false, error: "lines is required" }, { status: 400 });
  }
  if (!payload.caseId && !payload.client?.name?.trim()) {
    return NextResponse.json({ ok: false, error: "caseId 或 client.name 至少一項" }, { status: 400 });
  }

  const today = payload.quoteDate ?? taipeiToday();
  const channel: Channel = payload.channel ?? payload.client?.channel ?? "retail";

  try {
    // 0) 附圖先上傳：失敗就不留下半張案件
    const descriptionImageUrl = await resolveDescriptionImageUrl(
      payload.descriptionImageUrl,
      payload.descriptionImage,
    );

    // 1) 案件（既有或新建）。散客：公司空白、聯絡人＝「S編號 姓名」，與編輯器建的資料同一慣例
    let caseId = payload.caseId?.trim() ?? "";
    if (!caseId) {
      const c = payload.client!;
      const caseRes = await createCaseHandler(
        internalRequest("/api/sheets/cases", {
          caseName: payload.caseName ?? "",
          clientNameSnapshot: c.company?.trim() ?? "",
          contactNameSnapshot: c.name.trim(),
          phoneSnapshot: c.phone ?? "",
          projectAddress: c.address ?? "",
          channelSnapshot: channel,
          leadSource: c.leadSource ?? "line",
          caseStatus: "quoting",
          inquiryDate: today,
        }),
      );
      const caseJson = (await caseRes.json()) as { ok: boolean; caseId?: string; error?: string };
      if (!caseJson.ok || !caseJson.caseId) {
        return NextResponse.json({ ok: false, error: `建立案件失敗：${caseJson.error ?? "unknown"}` }, { status: 500 });
      }
      caseId = caseJson.caseId;
    }

    // 2) 金額
    const lines = payload.lines.map((l, i) => {
      const qty = Number(l.qty) || 0;
      const unitPrice = Math.round(Number(l.unitPrice) || 0);
      return {
        lineNo: i + 1,
        itemName: l.itemName,
        spec: l.spec ?? "",
        qty,
        unit: l.unit ?? "式",
        unitPrice,
        lineAmount: Math.round(qty * unitPrice),
        isCostItem: l.isCostItem ?? false,
        showOnQuote: true,
        notes: l.notes ?? "",
      };
    });
    const subtotal = lines.reduce((s, l) => s + l.lineAmount, 0);
    const taxRate = payload.taxRate ?? 0;
    const taxAmount = Math.round((subtotal * taxRate) / 100);
    const totalAmount = subtotal + taxAmount;

    // 3) 報價＋版本＋品項（草稿）
    const quoteRes = await createQuoteHandler(
      internalRequest("/api/sheets/quotes-v2", {
        caseId,
        quoteName: payload.quoteName ?? "",
        firstVersion: {
          versionLabel: "V01 初版",
          versionStatus: "draft",
          quoteDate: today,
          validUntil: payload.validUntil ?? addDays(today, 30),
          channel,
          taxRate,
          subtotalBeforeTax: subtotal,
          taxAmount,
          totalAmount,
          publicDescription: payload.publicDescription ?? "",
          descriptionImageUrl,
          internalNotes: ["[agent 建立]", payload.internalNotes ?? ""].filter(Boolean).join(" "),
          lines,
        },
      }),
    );
    const quoteJson = (await quoteRes.json()) as { ok: boolean; quoteId?: string; versionId?: string; error?: string };
    if (!quoteJson.ok) {
      return NextResponse.json({ ok: false, error: `建立報價失敗：${quoteJson.error ?? "unknown"}`, caseId }, { status: 500 });
    }

    return NextResponse.json(
      {
        ok: true,
        caseId,
        quoteId: quoteJson.quoteId,
        versionId: quoteJson.versionId,
        subtotal,
        taxAmount,
        totalAmount,
        descriptionImageUrl,
      },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/** 幫既有版本補附圖（建單時忘了給、或客戶事後才傳照片） */
export async function PATCH(request: Request) {
  const denied = authorize(request);
  if (denied) return denied;

  let payload: AgentAttachImagePayload;
  try {
    payload = (await request.json()) as AgentAttachImagePayload;
  } catch {
    return NextResponse.json({ ok: false, error: "格式錯誤" }, { status: 400 });
  }
  const versionId = payload.versionId?.trim();
  if (!versionId) {
    return NextResponse.json({ ok: false, error: "versionId is required" }, { status: 400 });
  }
  if (!payload.descriptionImageUrl?.trim() && !payload.descriptionImage?.base64) {
    return NextResponse.json({ ok: false, error: "descriptionImageUrl 或 descriptionImage 至少一項" }, { status: 400 });
  }

  try {
    const descriptionImageUrl = await resolveDescriptionImageUrl(
      payload.descriptionImageUrl,
      payload.descriptionImage,
    );
    const res = await patchVersionHandler(
      internalRequest(`/api/sheets/versions/${encodeURIComponent(versionId)}`, { descriptionImageUrl }, "PATCH"),
      { params: Promise.resolve({ versionId }) },
    );
    const json = (await res.json()) as { ok: boolean; error?: string };
    if (!json.ok) {
      return NextResponse.json({ ok: false, error: `更新版本失敗：${json.error ?? "unknown"}` }, { status: res.status === 404 ? 404 : 500 });
    }
    return NextResponse.json({ ok: true, versionId, descriptionImageUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
