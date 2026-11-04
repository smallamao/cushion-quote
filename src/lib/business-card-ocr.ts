import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { AI_MAX_TOKENS, AI_MODEL_VISION } from "@/lib/ai-model";

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

/** Anthropic 只收這四種圖片格式，其他一律當 JPEG 送（手機拍照幾乎都是 JPEG） */
const SUPPORTED_MEDIA = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type SupportedMedia = (typeof SUPPORTED_MEDIA)[number];

function normalizeMedia(mimeType: string): SupportedMedia {
  const lower = (mimeType || "").toLowerCase();
  return (SUPPORTED_MEDIA as readonly string[]).includes(lower)
    ? (lower as SupportedMedia)
    : "image/jpeg";
}

export async function recognizeBusinessCard(
  images: { buffer: Buffer; mimeType: string }[],
): Promise<BusinessCardData> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ...EMPTY_RESULT };

  const prompt = `你是一個名片 OCR 助手。${images.length > 1 ? "以下是同一張名片的正面和反面。請綜合兩面的資訊，擷取" : "請從這張名片圖片中擷取"}以下欄位並以 JSON 格式回傳。
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

  const content: Anthropic.ContentBlockParam[] = [
    ...images.map(
      (img): Anthropic.ImageBlockParam => ({
        type: "image",
        source: {
          type: "base64",
          media_type: normalizeMedia(img.mimeType),
          data: img.buffer.toString("base64"),
        },
      }),
    ),
    { type: "text", text: prompt },
  ];

  const anthropic = new Anthropic({ apiKey });
  const resp = await anthropic.messages.create({
    model: AI_MODEL_VISION,
    max_tokens: AI_MAX_TOKENS,
    messages: [{ role: "user", content }],
  });

  const raw = resp.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();

  // 模型偶爾會把 JSON 包在 ```json 區塊裡，脫掉再解析
  const text = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

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
}
