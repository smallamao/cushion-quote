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

let cachedLogo: string | null | undefined;

/** 讀取 public/logo.png 為 data URI；找不到時回傳 undefined（PDF 就不畫 logo）。 */
function loadLogoDataUri(): string | undefined {
  if (cachedLogo !== undefined) return cachedLogo ?? undefined;
  try {
    const logoPath = path.join(process.cwd(), "public", "logo.png");
    const buffer = fs.readFileSync(logoPath);
    cachedLogo = `data:image/png;base64,${buffer.toString("base64")}`;
  } catch {
    cachedLogo = null;
  }
  return cachedLogo ?? undefined;
}

/**
 * 於伺服器端把採購單渲染成 PDF Buffer。
 * 字型檔遺失時丟出錯誤，讓呼叫端可 try/catch 後降級（不阻擋建單）。
 */
export async function renderPurchaseOrderPdfBuffer(
  props: Omit<PurchaseOrderPDFProps, "logoSrc">,
): Promise<Buffer> {
  if (!ensureFontsRegistered()) {
    throw new Error(
      "採購單字型檔遺失（public/fonts/NotoSansTC-*.ttf），無法在伺服器端產生 PDF",
    );
  }
  return renderToBuffer(
    <PurchaseOrderDocument {...props} logoSrc={loadLogoDataUri()} />,
  );
}
