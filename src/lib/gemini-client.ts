import "server-only";

import { GoogleGenerativeAI } from "@google/generative-ai";

export interface BusinessCardData {
  companyName: string;
  taxId: string;
  name: string;
  role: string;
  phone: string;
  phone2: string;
  email: string;
  lineId: string;
  address: string;
}

const EMPTY_RESULT: BusinessCardData = {
  companyName: "",
  taxId: "",
  name: "",
  role: "",
  phone: "",
  phone2: "",
  email: "",
  lineId: "",
  address: "",
};

export async function recognizeBusinessCard(
  images: { buffer: Buffer; mimeType: string }[],
): Promise<BusinessCardData> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { ...EMPTY_RESULT };

  try {
    const genai = new GoogleGenerativeAI(apiKey);
    const model = genai.getGenerativeModel({ model: "gemini-2.5-flash" });

    const basePrompt = `你是一個名片 OCR 助手。${images.length > 1 ? "以下是同一張名片的正面和反面。請綜合兩面的資訊，擷取" : "請從這張名片圖片中擷取"}以下欄位並以 JSON 格式回傳。
若某欄位不存在則回傳空字串。
欄位說明：
- companyName：公司名稱
- taxId：統一編號（8位數字）
- name：姓名，如果有中文名和英文名請合在一起，例如「徐燕娜 Nana」
- role：職稱
- phone：主要電話（手機優先）
- phone2：第二電話（市話）
- email：電子郵件
- lineId：LINE ID（如有）
- address：地址
僅回傳 JSON，不要任何其他文字。`;
    const prompt = basePrompt;

    const parts: (string | { inlineData: { mimeType: string; data: string } })[] = [prompt];
    for (const img of images) {
      parts.push({
        inlineData: {
          mimeType: img.mimeType,
          data: img.buffer.toString("base64"),
        },
      });
    }

    const result = await model.generateContent(parts);

    let text = result.response.text();
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

    const parsed = JSON.parse(text) as Partial<BusinessCardData>;
    return {
      companyName: parsed.companyName ?? "",
      taxId: parsed.taxId ?? "",
      name: parsed.name ?? "",
      role: parsed.role ?? "",
      phone: parsed.phone ?? "",
      phone2: parsed.phone2 ?? "",
      email: parsed.email ?? "",
      lineId: parsed.lineId ?? "",
      address: parsed.address ?? "",
    };
  } catch {
    return { ...EMPTY_RESULT };
  }
}
