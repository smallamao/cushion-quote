import { describe, expect, it } from "vitest";

import { AI_MAX_TOKENS, AI_MODEL_AGENT, AI_MODEL_VISION } from "@/lib/ai-model";
import { toolDefinitions as agentTools } from "@/lib/agent-tools";
import { toolDefinitions as orderTools } from "@/lib/assistant/order-tools";

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
  checkTools(orderTools as unknown as ToolLike[], "訂單助手");
  checkTools(agentTools as unknown as ToolLike[], "LINE agent");

  it("LINE agent 的 9 個工具都在", () => {
    expect(agentTools).toHaveLength(9);
  });

  it("工具名稱不重複", () => {
    for (const tools of [orderTools, agentTools]) {
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
