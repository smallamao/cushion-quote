import { describe, expect, it } from "vitest";

import { AI_MAX_TOKENS, AI_MODEL_AGENT, AI_MODEL_VISION } from "@/lib/ai-model";
import { MUTATING_TOOLS, readOnlyTools, toolDefinitions as agentTools } from "@/lib/agent-tools";
import {
  PROPOSE_PURCHASE_STATUS_TOOL,
  PROPOSE_STATUS_TOOL,
  SYSTEM_INSTRUCTION,
} from "@/lib/assistant/order-tools";

/**
 * 2026-11-04 從 Gemini 換到 Claude：工具宣告是用機械式轉換改過來的
 * （SchemaType.OBJECT → "object"、parameters → input_schema）。
 * 這種改法最容易留下「看起來對、送上去才被拒」的格式問題，所以用測試擋。
 */

type ToolLike = { name: string; description?: string; input_schema: { type: string; properties?: Record<string, unknown>; required?: string[] } };

function checkTools(tools: readonly ToolLike[], label: string) {
  it(`${label}：每個工具都有名稱與說明`, () => {
    for (const t of tools) {
      expect(t.name, `${label} 有工具沒有名稱`).toBeTruthy();
      expect(t.description?.length ?? 0, `${t.name} 沒有說明`).toBeGreaterThan(0);
    }
  });

  it(`${label}：input_schema 一律是 object`, () => {
    for (const t of tools) {
      expect(t.input_schema, `${t.name} 缺 input_schema`).toBeTruthy();
      expect(t.input_schema.type, `${t.name} 的 input_schema.type 不是 object`).toBe("object");
    }
  });

  it(`🔴 ${label}：不可殘留 Gemini 的型別字串`, () => {
    const json = JSON.stringify(tools);
    expect(json).not.toContain("SchemaType");
    expect(json).not.toContain("Type.");
    // Gemini 用大寫型別名，JSON Schema 是小寫
    expect(json).not.toMatch(/"type":"(OBJECT|STRING|NUMBER|ARRAY|BOOLEAN)"/);
  });

  it(`${label}：型別只能是 JSON Schema 認得的小寫字串`, () => {
    const valid = new Set(["object", "string", "number", "integer", "boolean", "array", "null"]);
    const walk = (node: unknown, path: string) => {
      if (!node || typeof node !== "object") return;
      const o = node as Record<string, unknown>;
      if (typeof o.type === "string") {
        expect(valid.has(o.type), `${path} 的 type="${o.type}" 不合法`).toBe(true);
      }
      for (const [k, v] of Object.entries(o)) walk(v, `${path}.${k}`);
    };
    for (const t of tools) walk(t.input_schema, t.name);
  });

  it(`${label}：required 裡的欄位必須真的存在於 properties`, () => {
    const walk = (node: unknown, path: string) => {
      if (!node || typeof node !== "object") return;
      const o = node as { type?: string; properties?: Record<string, unknown>; required?: string[] };
      if (o.type === "object" && Array.isArray(o.required)) {
        for (const key of o.required) {
          expect(o.properties?.[key], `${path} 的 required 有 "${key}" 但 properties 裡沒有`).toBeDefined();
        }
      }
      for (const [k, v] of Object.entries(o as Record<string, unknown>)) walk(v, `${path}.${k}`);
    };
    for (const t of tools) walk(t.input_schema, t.name);
  });
}

describe("Claude 工具宣告", () => {
  checkTools(
    [PROPOSE_STATUS_TOOL, PROPOSE_PURCHASE_STATUS_TOOL] as unknown as ToolLike[],
    "面板專屬",
  );
  checkTools(agentTools as unknown as ToolLike[], "共用工具表");

  it("共用工具表涵蓋 14 個工具（含訂製訂單查詢、叫料狀況、Notion 預約）", () => {
    expect(agentTools).toHaveLength(14);
    const names = agentTools.map((t) => t.name);
    expect(names).toContain("query_orders");
    expect(names).toContain("get_order");
    expect(names).toContain("get_order_materials");
    expect(names).toContain("query_bookings");
    expect(names).toContain("create_notion_booking");
  });

  it("🔴 新增預約會寫進 Notion，面板不可以直接拿到", () => {
    expect(MUTATING_TOOLS.has("create_notion_booking")).toBe(true);
    expect(readOnlyTools().map((t) => t.name)).not.toContain("create_notion_booking");
  });

  /**
   * 2026-11-04 踩過：加了工具卻沒改 SYSTEM_INSTRUCTION，指令裡還寫著一個早就不存在的
   * find_orders，等於一邊給工具一邊叫模型別用。這條測試讓下次漏改就紅。
   */
  it("🔴 系統指令提到的工具名稱必須真的存在", () => {
    const mentioned = SYSTEM_INSTRUCTION.match(/\b[a-z_]+_[a-z_]+\b/g) ?? [];
    const known = new Set([
      ...agentTools.map((t) => t.name),
      PROPOSE_STATUS_TOOL.name,
      PROPOSE_PURCHASE_STATUS_TOOL.name,
    ]);
    for (const name of mentioned) {
      expect(known.has(name), `系統指令提到 ${name}，但工具表裡沒有這個工具`).toBe(true);
    }
  });

  it("🔴 每個唯讀工具都要寫進系統指令，否則模型不知道自己查得到", () => {
    for (const t of readOnlyTools()) {
      expect(SYSTEM_INSTRUCTION, `系統指令沒提到 ${t.name}`).toContain(t.name);
    }
  });

  it("🔴 宣告與處理函式必須一一對應——漏一個就是模型看得到卻呼叫沒反應", async () => {
    const mod = (await import("@/lib/agent-tools")) as unknown as Record<string, unknown>;
    void mod;
    // executeTool 對未知工具會回「未知工具：」，用它反查每個宣告都有處理函式
    const { executeTool } = await import("@/lib/agent-tools");
    for (const t of agentTools) {
      const out = await executeTool(t.name, {}, new Set([t.name]));
      // 被擋下代表名稱有被認得（擋在 handler 查找之前），不會是「未知工具」
      expect(out, `${t.name} 沒有對應的處理函式`).not.toContain("未知工具");
    }
    expect(await executeTool("definitely_not_a_tool", {}, new Set())).toContain("未知工具");
  });

  it("唯讀子集不含任何會寫入的工具", () => {
    for (const t of readOnlyTools()) {
      expect(MUTATING_TOOLS.has(t.name), `${t.name} 會寫入卻出現在唯讀清單`).toBe(false);
    }
    expect(readOnlyTools().length).toBeLessThan(agentTools.length);
  });

  it("工具名稱不重複", () => {
    for (const tools of [agentTools]) {
      const names = tools.map((t) => t.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });
});

describe("AI 模型設定", () => {
  it("模型名稱集中在一處，且是 Claude", () => {
    expect(AI_MODEL_AGENT).toMatch(/^claude-/);
    expect(AI_MODEL_VISION).toMatch(/^claude-/);
  });

  it("回覆長度有上限", () => {
    expect(AI_MAX_TOKENS).toBeGreaterThan(0);
  });
});
