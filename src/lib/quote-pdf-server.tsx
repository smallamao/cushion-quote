import fs from "node:fs";
import path from "node:path";

import { Font, renderToBuffer } from "@react-pdf/renderer";

import { QuotePDFDocument } from "@/components/pdf/QuotePDF";
import type { QuotePDFProps } from "@/components/pdf/QuotePDF";

/**
 * 報價單 PDF 的伺服器端渲染（Notion 報價圖用）。
 * 模式沿用 purchase-order-pdf-server：字型改註冊為檔案系統絕對路徑
 * （QuotePDF 模組載入時註冊的 /fonts/... 相對 URL 只在瀏覽器有效；
 * 同 family 再註冊一次會覆蓋，渲染時就吃到 fs 路徑）。
 */

let serverFontsRegistered = false;

function registerServerFonts(): void {
  if (serverFontsRegistered) return;
  const fontsDir = path.join(process.cwd(), "public", "fonts");
  const regular = path.join(fontsDir, "NotoSansTC-Regular.ttf");
  const bold = path.join(fontsDir, "NotoSansTC-Bold.ttf");
  if (!fs.existsSync(regular) || !fs.existsSync(bold)) {
    throw new Error("伺服器端找不到 NotoSansTC 字型檔");
  }
  Font.register({
    family: "NotoSansTC",
    fonts: [
      { src: regular, fontWeight: 400 },
      { src: bold, fontWeight: 700 },
    ],
  });
  Font.registerHyphenationCallback((word) => [word]);
  serverFontsRegistered = true;
}

export async function renderQuotePdfBuffer(props: QuotePDFProps): Promise<Buffer> {
  registerServerFonts();
  return renderToBuffer(<QuotePDFDocument {...props} />);
}
