import "server-only";

import { requireAdmin } from "@/lib/api-auth";

import { NextResponse } from "next/server";

import Anthropic from "@anthropic-ai/sdk";

import { AI_MAX_TOKENS, AI_MODEL_AGENT } from "@/lib/ai-model";
import { executeTool, readOnlyTools } from "@/lib/agent-tools";
import {
  PROPOSE_PURCHASE_STATUS_CHANGE,
  PROPOSE_PURCHASE_STATUS_TOOL,
  PROPOSE_STATUS_CHANGE,
  PROPOSE_STATUS_TOOL,
  STATUS_LABELS,
  SYSTEM_INSTRUCTION,
} from "@/lib/assistant/order-tools";
import { describePurchaseProposal } from "@/lib/assistant/purchase-proposal";
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

/**
 * 這個面板能用的工具＝共用工具表裡的唯讀那些，加上「提議改狀態」。
 *
 * 2026-11-04 改成共用：原本畫面助手與 LINE agent 各自維護一份工具宣告，
 * 加一個能力要寫兩遍，結果就是兩邊都不加、助手停在很早期的狀態。
 * 寫入動作一律不給這個面板直接執行——改狀態走 propose，由使用者在畫面按確認。
 */
function panelTools() {
  return [...readOnlyTools(), PROPOSE_STATUS_TOOL, PROPOSE_PURCHASE_STATUS_TOOL];
}

const NO_WRITES: ReadonlySet<string> = new Set();

/**
 * 一題最多讓模型呼叫幾輪工具。
 *
 * 老闆 2026-11-04 問「目前排程中的訂製訂單，面料都有採購了嗎？」得到「（沒有回覆）」。
 * 實測那一題模型要三輪：第一輪查訂單＋採購單、第二輪補查單張工單、第三輪才寫出答案。
 * 這支原本只執行一輪工具就收工，拿到的第二輪回應還是 tool_use、一個文字區塊都沒有，
 * textOf() 於是是空字串，就印出「（沒有回覆）」——看起來像壞掉，其實是話還沒說完就被切斷。
 * LINE 那條（runAgent）本來就有迴圈，只有畫面這條漏了。
 *
 * 給 5 輪而不是 runAgent 的 3 輪：面板是唯讀的，多繞幾輪只是多查，不會動到資料。
 */
const MAX_TOOL_ROUNDS = 5;

/** 迴圈跑完仍然沒有文字時，把原因講出來，不要只回「（沒有回覆）」讓人猜。 */
function fallbackReply(resp: Anthropic.Message | null, lastToolResult: string): string {
  if (resp?.stop_reason === "max_tokens") {
    return "（這題的回答太長被截斷了，請問得更小一點，例如指定單號或月份。）";
  }
  if (lastToolResult) {
    return `（查了 ${MAX_TOOL_ROUNDS} 輪還是沒整理出結論，以下是最後查到的原始資料）\n\n${lastToolResult}`;
  }
  return "（沒有回覆，請換個問法再試一次。）";
}

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
    let resp: Anthropic.Message | null = null;
    let lastToolResult = "";

    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      resp = await anthropic.messages.create({
        model: AI_MODEL_AGENT,
        max_tokens: AI_MAX_TOKENS,
        system: SYSTEM_INSTRUCTION,
        tools: panelTools(),
        messages,
      });

      const calls = resp.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
      );
      if (calls.length === 0) break;

      // 採購單改狀態 → 一樣不執行，但確認訊息要先查有沒有內容相同的重複單。
      const purchaseCall = calls.find((c) => c.name === PROPOSE_PURCHASE_STATUS_CHANGE);
      if (purchaseCall) {
        const args = (purchaseCall.input ?? {}) as { purchaseId?: string; status?: string };
        const proposal = await describePurchaseProposal(
          (args.purchaseId ?? "").trim(),
          String(args.status ?? ""),
        );
        return NextResponse.json({
          ok: true,
          reply: proposal.reply,
          pendingAction: proposal.pendingAction,
          history: [
            ...history,
            { role: "user", text: message },
            { role: "model", text: proposal.historyNote },
          ],
        });
      }

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

      // 只讀工具 → 執行、餵回結果，下一輪再問。
      // content 要原封不動推回去：模型的 thinking 區塊在後續輪次是必要的上下文。
      messages.push({ role: "assistant", content: resp.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const c of calls) {
        const result = await executeTool(c.name, (c.input ?? {}) as Record<string, unknown>, NO_WRITES);
        lastToolResult = result;
        results.push({ type: "tool_result", tool_use_id: c.id, content: result });
      }
      messages.push({ role: "user", content: results });
    }

    const reply = (resp ? textOf(resp) : "") || fallbackReply(resp, lastToolResult);
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
