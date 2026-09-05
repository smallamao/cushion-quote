import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import {
  decodeBase64Image,
  isAllowedMime,
  maxBytesFor,
  uploadBufferToCloudinary,
  CLOUDINARY_FOLDERS,
} from "@/lib/cloudinary-upload";
import { DEFAULT_TERMS } from "@/lib/constants";
import { deriveOptionMeta } from "@/lib/quote-options";
import { applyTaxModeToTerms } from "@/lib/quote-terms";
import { getSheetsClient } from "@/lib/sheets-client";
import type { Channel, ItemUnit, LeadSource, VersionLineRecord } from "@/lib/types";
import { getVersionLineRows, getVersionRows, lineRowToRecord, versionRowToRecord } from "../../_v2-utils";
import { POST as syncNotionHandler } from "@/app/api/notion/sync-quote/route";
import { buildQuoteJpgUrl } from "../_quote-image";
import { POST as createCaseHandler } from "../../cases/route";
import { POST as createVersionHandler } from "../../versions/route";
import { PATCH as patchVersionHandler, PUT as putVersionHandler } from "../../versions/[versionId]/route";
import { POST as createQuoteHandler } from "../route";

export const dynamic = "force-dynamic";

/**
 * 對話 agent（quote-drafter skill）建立／修改「草稿」報價的整合端點。
 * 以 x-api-key（AGENT_API_KEY）驗證，與排程系統的 from-paste 同一模式。
 *
 * POST  建案件＋報價＋版本＋品項（永遠 draft，發送權在操作者）
 * PATCH 修改既有版本：補「補充說明附圖」；或整組換掉品項（只允許 draft）
 *
 * 內部直接組合既有的 cases POST / quotes-v2 POST / versions PUT・PATCH，不重複寫入邏輯。
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
  /** 建單後同步 Notion 報價資料庫，預設 true */
  syncNotion?: boolean;
}

interface AgentPatchPayload {
  versionId: string;
  /** 定案流程：以 versionId 為底建立新版本（V1 自動變已取代），lines 等修改套用在新版本上 */
  createNewVersion?: boolean;
  versionLabel?: string;
  /** 給了就整組取代（只允許草稿），金額重算 */
  lines?: AgentLine[];
  publicDescription?: string;
  internalNotes?: string;
  descriptionImageUrl?: string;
  descriptionImage?: AgentImage;
  /** 改完同步 Notion，預設 true */
  syncNotion?: boolean;
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

function internalRequest(path: string, body: unknown, method: "POST" | "PATCH" | "PUT" = "POST"): Request {
  return new Request(`http://internal${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** 品項＋金額：POST 與 PATCH 共用同一套算法 */
function buildLines(input: AgentLine[]) {
  const lines: Array<Partial<VersionLineRecord>> = input.map((l, i) => {
    const qty = Number(l.qty) || 0;
    const unitPrice = Math.round(Number(l.unitPrice) || 0);
    return {
      lineNo: i + 1,
      itemName: l.itemName,
      spec: l.spec ?? "",
      qty,
      // 單位跟編輯器同一組選項；agent 給了非標準字串就照字面存，PDF 仍可顯示
      unit: (l.unit ?? "式") as ItemUnit,
      unitPrice,
      lineAmount: Math.round(qty * unitPrice),
      isCostItem: l.isCostItem ?? false,
      showOnQuote: true,
      notes: l.notes ?? "",
    };
  });
  const subtotal = lines.reduce((s, l) => s + (l.lineAmount ?? 0), 0);
  return { lines, subtotal };
}

function taxOf(subtotal: number, taxRate: number) {
  const taxAmount = Math.round((subtotal * taxRate) / 100);
  return { taxAmount, totalAmount: subtotal + taxAmount };
}

interface NotionSyncResult {
  ok: boolean;
  action?: string;
  notionUrl?: string;
  /** 這次同步帶去的報價圖網址；undefined＝產圖失敗、無圖同步（原因在 server log） */
  jpgUrl?: string;
  error?: string;
}

/**
 * 同步到 Notion 報價資料庫（與報價列表／編輯器的「Notion」按鈕同一支端點）。
 * best-effort：Notion 沒設定或失敗只回錯誤訊息，不影響報價本身。
 * clientName 傳散客的「S編號 姓名」，否則 Notion 標題會退回版本名稱。
 */
async function syncToNotion(versionId: string, clientName: string): Promise<NotionSyncResult> {
  try {
    // 報價圖：伺服器端渲染 PDF → Cloudinary 轉第 1 頁 JPG（與 UI 按鈕的 jpgUrl 同義）。
    // 失敗就無圖同步，不擋流程。
    let jpgUrl: string | undefined;
    try {
      jpgUrl = await buildQuoteJpgUrl(versionId);
    } catch (err) {
      // 無圖同步：不擋流程，但要在 log 留下原因（曾默默失敗過，Notion 沒圖查不到為什麼）
      console.error(`[from-agent] 報價圖產生失敗 ${versionId}:`, err instanceof Error ? err.message : err);
      jpgUrl = undefined;
    }
    const req = new NextRequest("http://internal/api/notion/sync-quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ versionId, clientName: clientName || undefined, jpgUrl }),
    });
    const res = await syncNotionHandler(req);
    const json = (await res.json()) as NotionSyncResult;
    return json.ok ? { ...json, jpgUrl } : { ok: false, error: json.error ?? `Notion 同步失敗（${res.status}）` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Notion 同步失敗" };
  }
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
    const { lines, subtotal } = buildLines(payload.lines);
    const taxRate = payload.taxRate ?? 0;
    const { taxAmount, totalAmount } = taxOf(subtotal, taxRate);

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
          // 條款跟編輯器同一套：未稅去掉逾期罰則、稅金行改「未含」；含稅用預設機關版
          termsTemplate: applyTaxModeToTerms(DEFAULT_TERMS, taxRate > 0),
          internalNotes: ["[agent 建立]", payload.internalNotes ?? ""].filter(Boolean).join(" "),
          // 兩檔／加價選項 → 多方案：PDF 不顯示合計、列表顯示最低方案
          ...deriveOptionMeta(lines),
          lines,
        },
      }),
    );
    const quoteJson = (await quoteRes.json()) as { ok: boolean; quoteId?: string; versionId?: string; error?: string };
    if (!quoteJson.ok) {
      return NextResponse.json({ ok: false, error: `建立報價失敗：${quoteJson.error ?? "unknown"}`, caseId }, { status: 500 });
    }

    const notion =
      payload.syncNotion !== false && quoteJson.versionId
        ? await syncToNotion(quoteJson.versionId, payload.client?.company?.trim() || payload.client?.name?.trim() || "")
        : undefined;

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
        ...deriveOptionMeta(lines),
        notion,
      },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/**
 * 修改既有版本。
 * - 只補附圖：走 versions PATCH（任何狀態都可以，附圖不影響金額）。
 * - 換品項／補充說明：只允許 draft，走 versions PUT（與編輯器儲存同一條路），金額重算。
 */
export async function PATCH(request: Request) {
  const denied = authorize(request);
  if (denied) return denied;

  let payload: AgentPatchPayload;
  try {
    payload = (await request.json()) as AgentPatchPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "格式錯誤" }, { status: 400 });
  }
  const versionId = payload.versionId?.trim();
  if (!versionId) {
    return NextResponse.json({ ok: false, error: "versionId is required" }, { status: 400 });
  }
  const wantsLines = Array.isArray(payload.lines);
  const wantsText = payload.publicDescription !== undefined || payload.internalNotes !== undefined;
  const wantsImage = Boolean(payload.descriptionImageUrl?.trim() || payload.descriptionImage?.base64);
  const wantsSyncOnly = !wantsLines && !wantsText && !wantsImage && payload.syncNotion === true;
  if (!wantsLines && !wantsText && !wantsImage && !wantsSyncOnly) {
    return NextResponse.json(
      { ok: false, error: "lines、publicDescription、internalNotes、附圖至少一項（或 syncNotion:true 只同步 Notion）" },
      { status: 400 },
    );
  }

  // 只同步 Notion：任何狀態的版本都可以（已發送／已接受的也能補同步）
  if (wantsSyncOnly) {
    const client = await getSheetsClient();
    if (!client) return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
    const row = (await getVersionRows(client)).find((r) => r[0] === versionId);
    if (!row) return NextResponse.json({ ok: false, error: "version not found" }, { status: 404 });
    const v = versionRowToRecord(row);
    const notion = await syncToNotion(versionId, v.clientNameSnapshot || v.contactNameSnapshot || "");
    return NextResponse.json({ ok: true, versionId, versionStatus: v.versionStatus, notion });
  }
  if (wantsLines && payload.lines!.length === 0) {
    return NextResponse.json({ ok: false, error: "lines 不可為空" }, { status: 400 });
  }

  try {
    // 定案流程（需求：客人選定方案後開「確認方案」新版本，保留原多方案紀錄）
    let targetVersionId = versionId;
    if (payload.createNewVersion === true) {
      const res = await createVersionHandler(
        internalRequest("/api/sheets/versions", {
          action: "new_version",
          basedOnVersionId: versionId,
          versionLabel: payload.versionLabel ?? "確認方案",
        }),
      );
      const json = (await res.json()) as { ok: boolean; versionId?: string; error?: string };
      if (!json.ok || !json.versionId) {
        return NextResponse.json({ ok: false, error: `建立新版本失敗：${json.error ?? "unknown"}` }, { status: 500 });
      }
      targetVersionId = json.versionId;
    }

    const descriptionImageUrl = await resolveDescriptionImageUrl(
      payload.descriptionImageUrl,
      payload.descriptionImage,
    );
    const params = { params: Promise.resolve({ versionId: targetVersionId }) };

    // 只補圖：不碰金額
    if (!wantsLines && !wantsText) {
      const res = await patchVersionHandler(
        internalRequest(`/api/sheets/versions/${encodeURIComponent(targetVersionId)}`, { descriptionImageUrl }, "PATCH"),
        params,
      );
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) {
        return NextResponse.json({ ok: false, error: `更新版本失敗：${json.error ?? "unknown"}` }, { status: res.status === 404 ? 404 : 500 });
      }
      return NextResponse.json({ ok: true, versionId: targetVersionId, descriptionImageUrl });
    }

    const client = await getSheetsClient();
    if (!client) {
      return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
    }
    const existingRow = (await getVersionRows(client)).find((r) => r[0] === targetVersionId);
    if (!existingRow) {
      return NextResponse.json({ ok: false, error: "version not found" }, { status: 404 });
    }
    const existing = versionRowToRecord(existingRow);
    if (existing.versionStatus !== "draft") {
      return NextResponse.json(
        { ok: false, error: `只能修改草稿（目前狀態 ${existing.versionStatus}）；已發送的請建新版本` },
        { status: 409 },
      );
    }

    const built = wantsLines ? buildLines(payload.lines!) : null;
    const subtotal = built ? built.subtotal : existing.subtotalBeforeTax;
    const { taxAmount, totalAmount } = taxOf(subtotal, existing.taxRate);
    const updated = {
      ...existing,
      ...(built ? deriveOptionMeta(built.lines) : {}),
      subtotalBeforeTax: subtotal,
      taxAmount,
      totalAmount,
      publicDescription: payload.publicDescription ?? existing.publicDescription,
      internalNotes: payload.internalNotes ?? existing.internalNotes,
      descriptionImageUrl: descriptionImageUrl || existing.descriptionImageUrl,
    };

    // 換品項走 PUT（會整組取代明細）；只改文字時要把既有明細原樣送回，否則會被清空
    let lines: Array<Partial<VersionLineRecord>>;
    if (built) {
      lines = built.lines;
    } else {
      lines = (await getVersionLineRows(client))
        .filter((r) => r[1] === targetVersionId)
        .map(lineRowToRecord)
        .sort((a, b) => a.lineNo - b.lineNo);
    }

    const res = await putVersionHandler(
      internalRequest(`/api/sheets/versions/${encodeURIComponent(targetVersionId)}`, { version: updated, lines }, "PUT"),
      params,
    );
    const json = (await res.json()) as { ok: boolean; error?: string };
    if (!json.ok) {
      return NextResponse.json({ ok: false, error: `更新版本失敗：${json.error ?? "unknown"}` }, { status: 500 });
    }
    const notion =
      payload.syncNotion !== false
        ? await syncToNotion(targetVersionId, existing.clientNameSnapshot || existing.contactNameSnapshot || "")
        : undefined;

    return NextResponse.json({
      ok: true,
      versionId: targetVersionId,
      basedOn: payload.createNewVersion ? versionId : undefined,
      subtotal,
      taxAmount,
      totalAmount,
      lineCount: lines.length,
      descriptionImageUrl: updated.descriptionImageUrl,
      notion,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
