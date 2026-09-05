import "server-only";

import fs from "node:fs";
import path from "node:path";

import { Font, renderToBuffer } from "@react-pdf/renderer";

import {
  PurchaseOrderDocument,
  type PurchaseOrderPDFProps,
} from "@/components/pdf/PurchaseOrderDocument";

// 伺服器端（Node runtime）產生採購單 PDF。
//
// 與瀏覽器端最大的差異：react-pdf 在 Node 無法解析相對路徑的字型 / 圖片，
// 因此字型改由檔案系統（public/fonts）以絕對路徑註冊，logo 則讀成 data URI。
// 已用 renderToBuffer 實測可正確嵌入繁體中文字型並輸出有效 PDF。

let fontsRegistered = false;

/** 以檔案路徑註冊 NotoSansTC；字型檔遺失時回傳 false（呼叫端據此降級）。 */
function ensureFontsRegistered(): boolean {
  if (fontsRegistered) return true;
  const fontsDir = path.join(process.cwd(), "public", "fonts");
  const regular = path.join(fontsDir, "NotoSansTC-Regular.ttf");
  const bold = path.join(fontsDir, "NotoSansTC-Bold.ttf");
  if (!fs.existsSync(regular) || !fs.existsSync(bold)) {
    return false;
  }
  Font.register({
    family: "NotoSansTC",
    fonts: [
      { src: regular, fontWeight: 400 },
      { src: bold, fontWeight: 700 },
    ],
  });
  Font.registerHyphenationCallback((word) => [word]);
  fontsRegistered = true;
  return true;
}

export async function renderPurchaseOrderPdfBuffer(
  props: Omit<PurchaseOrderPDFProps, "logoSrc">,
): Promise<Buffer> {
  if (!ensureFontsRegistered()) {
    throw new Error(
      "採購單字型檔遺失（public/fonts/NotoSansTC-*.ttf），無法在伺服器端產生 PDF",
    );
  }
  return renderToBuffer(
    <PurchaseOrderDocument {...props} />,
  );
}
