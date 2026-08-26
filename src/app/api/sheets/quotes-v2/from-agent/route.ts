import crypto from "node:crypto";
import { NextResponse } from "next/server";

import type { Channel, LeadSource } from "@/lib/types";
import { POST as createCaseHandler } from "../../cases/route";
import { POST as createQuoteHandler } from "../route";

export const dynamic = "force-dynamic";

/**
 * 對話 agent（quote-drafter skill）建立「草稿」報價的整合端點。
 * 以 x-api-key（AGENT_API_KEY）驗證，與排程系統的 from-paste 同一模式。
 * 內部直接組合既有的 cases POST（建案件）與 quotes-v2 POST（建報價＋版本＋品項），
 * 不重複任何寫入邏輯。永遠只建 draft，發送權在操作者。
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

interface AgentQuotePayload {
  /** 既有案件可直接指定；留空則以 client 建新案件 */
  caseId?: string;
  client?: {
    name: string;
    contactName?: string;
    phone?: string;
    channel?: Channel;
    address?: string;
    leadSource?: LeadSource;
  };
  /** 散客留空 → 不進案件紀錄 */
  caseName?: string;
  quoteName?: string;
  quoteDate?: string;
  validUntil?: string;
  /** 百分比，5 = 5%；0 = 未稅 */
  taxRate?: number;
  channel?: Channel;
  publicDescription?: string;
  internalNotes?: string;
  lines: AgentLine[];
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function taipeiToday(): string {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function internalRequest(path: string, body: unknown): Request {
  return new Request(`http://internal${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function POST(request: Request) {
  const configuredKey = process.env.AGENT_API_KEY?.trim();
  if (!configuredKey) {
    return NextResponse.json({ ok: false, error: "AGENT_API_KEY 未設定，端點停用" }, { status: 503 });
  }
  const providedKey = request.headers.get("x-api-key")?.trim() ?? "";
  if (!providedKey || !timingSafeEqualStr(providedKey, configuredKey)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let payload: AgentQuotePayload;
  try {
    payload = (await request.json()) as AgentQuotePayload;
  } catch {
    return NextResponse.json({ ok: false, error: "格式錯誤" }, { status: 400 });
  }
  if (!Array.isArray(payload.lines) || payload.lines.length === 0) {
    return NextResponse.json({ ok: false, error: "lines is required" }, { status: 400 });
  }
  if (!payload.caseId && !payload.client?.name) {
    return NextResponse.json({ ok: false, error: "caseId 或 client.name 至少一項" }, { status: 400 });
  }

  const today = payload.quoteDate ?? taipeiToday();
  const channel: Channel = payload.channel ?? payload.client?.channel ?? "retail";

  try {
    // 1) 案件（既有或新建）
    let caseId = payload.caseId?.trim() ?? "";
    if (!caseId) {
      const c = payload.client!;
      const caseRes = await createCaseHandler(
        internalRequest("/api/sheets/cases", {
          caseName: payload.caseName ?? "",
          clientNameSnapshot: c.name,
          contactNameSnapshot: c.contactName ?? "",
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
      { ok: true, caseId, quoteId: quoteJson.quoteId, versionId: quoteJson.versionId, subtotal, taxAmount, totalAmount },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
