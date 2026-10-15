import { describe, it, expect } from "vitest";

import { escapeXml, svgBar, svgDonut } from "@/lib/trello-excel";

// 🔴 2026-10-15 第二輪稽核 D01：業務文字（通路名稱、商品編號）原本直接字串拼接
//    進 SVG 的 <text>，而那份 SVG 會交給 sharp 轉 PNG。sharp 0.34.5 有高風險
//    公告，影像解析層是不是真的能被打還沒驗證——但「業務欄位能改變 SVG 結構」
//    這件事本身就不該成立，而且一個叫「A&B」的通路就足以讓圖產不出來。
describe("escapeXml", () => {
  it("把會改變結構的字元換掉", () => {
    expect(escapeXml('<script>')).toBe("&lt;script&gt;");
    expect(escapeXml("A&B")).toBe("A&amp;B");
    expect(escapeXml('say "hi"')).toBe("say &quot;hi&quot;");
    expect(escapeXml("it's")).toBe("it&apos;s");
  });

  it("& 只轉一次，不會變成 &amp;amp;", () => {
    expect(escapeXml("&lt;")).toBe("&amp;lt;");
  });

  it("一般中文與數字不受影響", () => {
    expect(escapeXml("蝦皮官網 123")).toBe("蝦皮官網 123");
  });
});

describe("圖表不可被業務文字改變結構", () => {
  const EVIL = '</text><script>alert(1)</script><text>';

  it("長條圖的商品編號", () => {
    const svg = svgBar([{ productCode: EVIL, count: 3 } as never]);
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
  });

  it("圓餅圖的通路名稱", () => {
    const svg = svgDonut([{ channel: EVIL, count: 3 } as never]);
    expect(svg).not.toContain("<script>");
  });

  it("含 & 的通路名稱不會破壞 SVG", () => {
    const svg = svgDonut([{ channel: "A&B 設計", count: 5 } as never]);
    expect(svg).toContain("A&amp;B");
    // 產出仍是合法的單一 svg 根元素
    expect(svg.match(/<svg/g)?.length).toBe(1);
    expect(svg.trim().endsWith("</svg>")).toBe(true);
  });
});
