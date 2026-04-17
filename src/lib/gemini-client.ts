import "server-only";

import { GoogleGenerativeAI } from "@google/generative-ai";

export interface BusinessCardData {
  companyName: string;
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
  name: "",
  role: "",
  phone: "",
  phone2: "",
  email: "",
  lineId: "",
  address: "",
};

export async function recognizeBusinessCard(
  imageBuffer: Buffer,
  mimeType: string,
): Promise<BusinessCardData> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { ...EMPTY_RESULT };

  try {
    const genai = new GoogleGenerativeAI(apiKey);
    const model = genai.getGenerativeModel({ model: "gemini-2.0-flash" });

    const prompt = `你是一個名片 OCR 助手。請從這張名片圖片中擷取以下資訊，並以 JSON 格式回傳。
若某欄位不存在則回傳空字串。
欄位：companyName（公司名稱）、name（姓名）、role（職稱）、phone（主要電話）、phone2（第二電話）、email（電子郵件）、lineId（LINE ID）、address（地址）。
僅回傳 JSON，不要任何其他文字。`;

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType,
          data: imageBuffer.toString("base64"),
        },
      },
    ]);

    let text = result.response.text();

    // Strip markdown code fences
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

    const parsed = JSON.parse(text) as Partial<BusinessCardData>;
    return {
      companyName: parsed.companyName ?? "",
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
