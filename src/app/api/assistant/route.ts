import "server-only";

import { NextResponse } from "next/server";

import { GoogleGenAI, type Content, type Part } from "@google/genai";

import {
  PROPOSE_STATUS_CHANGE,
  STATUS_LABELS,
  SYSTEM_INSTRUCTION,
  findOrders,
  functionDeclarations,
  getOrder,
} from "@/lib/assistant/order-tools";
import type { OrderStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = "gemini-2.5-flash";

interface ChatTurn {
  role: "user" | "model";
  text: string;
}

/** 只讀工具：直接執行、把結果餵回模型。寫入工具(改狀態)不在此，改由前端確認後才呼叫真正的 API。 */
const readHandlers: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {
  find_orders: (a) => findOrders(a as { query?: string; status?: string; month?: string }),
  get_order: (a) => getOrder(a as { orderId: string }),
};

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "尚未設定 GEMINI_API_KEY（請在 Vercel 環境變數新增免費金鑰後重新部署）" },
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
  const contents: Content[] = [
    ...history.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
    { role: "user", parts: [{ text: message }] },
  ];
  const config = { systemInstruction: SYSTEM_INSTRUCTION, tools: [{ functionDeclarations }] };

  try {
    const ai = new GoogleGenAI({ apiKey });
    let resp = await ai.models.generateContent({ model: MODEL, contents, config });
    const calls = resp.functionCalls ?? [];

    // 寫入意圖 → 不執行，回傳待確認動作，由使用者在畫面按確認才真的改。
    const writeCall = calls.find((c) => c.name === PROPOSE_STATUS_CHANGE);
    if (writeCall) {
      const args = (writeCall.args ?? {}) as { orderId?: string; status?: OrderStatus };
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
      const modelParts: Part[] = calls.map((c) => ({ functionCall: c }));
      const responseParts: Part[] = [];
      for (const c of calls) {
        const handler = readHandlers[c.name ?? ""];
        const result = handler
          ? await handler((c.args ?? {}) as Record<string, unknown>)
          : { error: `未知工具 ${c.name}` };
        responseParts.push({ functionResponse: { name: c.name, response: { result } } });
      }
      contents.push({ role: "model", parts: modelParts });
      contents.push({ role: "user", parts: responseParts });
      resp = await ai.models.generateContent({ model: MODEL, contents, config });
    }

    const reply = resp.text ?? "（沒有回覆）";
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
