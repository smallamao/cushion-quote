import "server-only";

import { requireAdmin } from "@/lib/api-auth";

import { NextResponse } from "next/server";

import Anthropic from "@anthropic-ai/sdk";

import { AI_MAX_TOKENS, AI_MODEL_AGENT } from "@/lib/ai-model";
import {
  PROPOSE_STATUS_CHANGE,
  STATUS_LABELS,
  SYSTEM_INSTRUCTION,
  findOrders,
  getOrder,
  toolDefinitions,
} from "@/lib/assistant/order-tools";
import type { OrderStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 對前端的歷史格式刻意維持 role: "user" | "model"（Gemini 時代的命名）。
 * Anthropic 用的是 "assistant"，只在這支內部轉換——改 wire format 會連帶
 * 要動前端與已存在瀏覽器裡的對話，沒有好處。
 */
interface ChatTurn {
  role: "user" | "model";
  text: string;
}

/** 只讀工具：直接執行、把結果餵回模型。寫入工具(改狀態)不在此，改由前端確認後才呼叫真正的 API。 */
const readHandlers: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {
  find_orders: (a) => findOrders(a as { query?: string; status?: string; month?: string }),
  get_order: (a) => getOrder(a as { orderId: string }),
};

function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();
}

export async function POST(request: Request) {
  // 🔴 2026-10-15 第二輪稽核：/api/sheets 以外的端點在第一輪被整批漏掉——
  //    我的掃描範圍只做了 /api/sheets/**。這些端點一樣碰公司憑證與營運資料
  //    （Trello／Notion 金鑰、舊系統代理、司機電話、AI 助理工具），
  //    而且同樣只靠 middleware 那一道門。route 層再驗一次。
  const guard = await requireAdmin(request);
  if (guard.denied) return guard.denied;


  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "尚未設定 ANTHROPIC_API_KEY（請在 Vercel 環境變數新增後重新部署）" },
      { status: 503 },
    );
  }

  let body: { message?: string; history?: ChatTurn[] };
  try {
    body = (await request.json()) as { message?: string; history?: ChatTurn[] };
  } catch {
    return NextResponse.json({ ok: false, error: "請求格式錯誤" }, { status: 400 });
  }
  const message = (body.message ?? "").trim();
  if (!message) return NextResponse.json({ ok: false, error: "訊息為空" }, { status: 400 });

  const history: ChatTurn[] = Array.isArray(body.history) ? body.history.slice(-12) : [];
  const messages: Anthropic.MessageParam[] = [
    ...history.map((t) => ({
      role: (t.role === "model" ? "assistant" : "user") as "assistant" | "user",
      content: t.text,
    })),
    { role: "user", content: message },
  ];

  try {
    const anthropic = new Anthropic({ apiKey });
    let resp = await anthropic.messages.create({
      model: AI_MODEL_AGENT,
      max_tokens: AI_MAX_TOKENS,
      system: SYSTEM_INSTRUCTION,
      tools: toolDefinitions,
      messages,
    });

    const calls = resp.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );

    // 寫入意圖 → 不執行，回傳待確認動作，由使用者在畫面按確認才真的改。
    const writeCall = calls.find((c) => c.name === PROPOSE_STATUS_CHANGE);
    if (writeCall) {
      const args = (writeCall.input ?? {}) as { orderId?: string; status?: OrderStatus };
      const orderId = (args.orderId ?? "").trim();
      const status = args.status as OrderStatus;
      const statusLabel = STATUS_LABELS[status] ?? String(status);
      return NextResponse.json({
        ok: true,
        reply: `請確認：要把 ${orderId} 改為「${statusLabel}」嗎？`,
        pendingAction: { type: "status_change", orderId, status, statusLabel },
        history: [
          ...history,
          { role: "user", text: message },
          { role: "model", text: `（等待使用者確認：${orderId} → ${statusLabel}）` },
        ],
      });
    }

    // 只讀工具 → 執行、餵回結果、再取最終回答。
    if (calls.length > 0) {
      messages.push({ role: "assistant", content: resp.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const c of calls) {
        const handler = readHandlers[c.name];
        const result = handler
          ? await handler((c.input ?? {}) as Record<string, unknown>)
          : { error: `未知工具 ${c.name}` };
        results.push({
          type: "tool_result",
          tool_use_id: c.id,
          content: JSON.stringify(result),
        });
      }
      messages.push({ role: "user", content: results });
      resp = await anthropic.messages.create({
        model: AI_MODEL_AGENT,
        max_tokens: AI_MAX_TOKENS,
        system: SYSTEM_INSTRUCTION,
        tools: toolDefinitions,
        messages,
      });
    }

    const reply = textOf(resp) || "（沒有回覆）";
    return NextResponse.json({
      ok: true,
      reply,
      history: [...history, { role: "user", text: message }, { role: "model", text: reply }],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "AI 服務錯誤";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
