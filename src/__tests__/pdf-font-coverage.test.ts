import fs from "fs";
import { createRequire } from "node:module";
import path from "path";

import { describe, expect, it } from "vitest";

// fontkit 只有 CJS 匯出，vitest 的 ESM default import 拿不到 openSync
const require_ = createRequire(import.meta.url);
const fontkit = require_("fontkit") as { openSync(p: string): { hasGlyphForCodePoint(cp: number): boolean } };

/**
 * PDF 元件裡用到的符號，必須在打包的字型裡有字。
 *
 * 2026-11-03：工單的分組標題用了 ▸（U+25B8），Noto Sans TC 兩個字重都沒有這個字，
 * react-pdf 於是畫出一個小小的亂碼，印出來的工單上掛了好幾個月沒人發現——
 * 缺字不會報錯，只會安靜地畫錯，所以必須用測試擋。
 *
 * 瀏覽器端的元件（ImageCropModal 用 react-easy-crop）走系統字型，不受這個限制。
 */

const FONT_DIR = path.resolve(__dirname, "../../public/fonts");
const PDF_DIR = path.resolve(__dirname, "../components/pdf");

/** 這些元件不經過 react-pdf，用的是瀏覽器字型 */
const BROWSER_ONLY = ["ImageCropModal.tsx", "WorkOrderLayoutEditor.tsx", "PDFPreviewModal.tsx"];

/**
 * 已知會在渲染前被換掉的字元，不必有字。
 * ❖ → safeText()／description.replace() 一律換成 ◆。
 */
const REPLACED_BEFORE_RENDER = new Set(["❖"]);

/**
 * 註解不會進 PDF，必須先拿掉再掃。
 * 否則連「不可用 ▸」這種提醒、或 🔴 這類標記都會被當成缺字（2026-11-03 第一版就踩到）。
 * 只移除整行註解與區塊註解，不動 https:// 這種行內斜線。
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join("\n");
}

function isCjkOrPunctuation(cp: number): boolean {
  return (
    (cp >= 0x3000 && cp <= 0x303f) || // 中文標點
    (cp >= 0x4e00 && cp <= 0x9fff) || // 漢字
    (cp >= 0xff00 && cp <= 0xffef) || // 全形
    cp < 0x2000 // ASCII 與拉丁補充
  );
}

describe("PDF 字型缺字檢查", () => {
  const fonts = fs
    .readdirSync(FONT_DIR)
    .filter((f) => f.endsWith(".ttf"))
    .map((f) => ({ name: f, font: fontkit.openSync(path.join(FONT_DIR, f)) }));

  it("字型檔讀得到", () => {
    expect(fonts.length).toBeGreaterThan(0);
  });

  it("🔴 PDF 元件用到的符號在每個字重都要有字", () => {
    const missing: string[] = [];
    for (const file of fs.readdirSync(PDF_DIR).filter((f) => f.endsWith(".tsx"))) {
      if (BROWSER_ONLY.includes(file)) continue;
      const source = stripComments(fs.readFileSync(path.join(PDF_DIR, file), "utf8"));
      for (const ch of new Set(source)) {
        const cp = ch.codePointAt(0)!;
        if (isCjkOrPunctuation(cp) || REPLACED_BEFORE_RENDER.has(ch)) continue;
        for (const { name, font } of fonts) {
          if (!font.hasGlyphForCodePoint(cp)) {
            missing.push(`${file}: ${ch} (U+${cp.toString(16).toUpperCase().padStart(4, "0")}) 在 ${name} 缺字`);
          }
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("擋得住已知的壞字元：▸ 真的缺字、▶ 真的有", () => {
    for (const { font } of fonts) {
      expect(font.hasGlyphForCodePoint(0x25b8)).toBe(false); // ▸
      expect(font.hasGlyphForCodePoint(0x25b6)).toBe(true); // ▶
    }
  });
});
