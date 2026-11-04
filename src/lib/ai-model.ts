/**
 * AI 模型設定集中在這裡。
 *
 * 2026-11-04 從 Gemini 換成 Claude：原本 gemini-2.5-flash 寫死在三個檔案裡
 * （assistant/route.ts、agent-tools.ts、business-card-ocr.ts），換模型要改三處、
 * 很容易漏掉一個。換過來時順手集中。
 *
 * 換掉的原因是 Gemini 預付額度用罄（402 RESOURCE_EXHAUSTED），不是模型不好。
 */

/** 對話助手與 agent 工具：要做 16 個工具的 function calling，需要穩的推理 */
export const AI_MODEL_AGENT = "claude-sonnet-5-5";

/** 名片 OCR：單純從圖片擷取欄位，用便宜的就夠 */
export const AI_MODEL_VISION = "claude-haiku-5-5";

/** 一次回覆的上限。工具回傳的結果可能很長，但給人看的回覆不該落落長 */
export const AI_MAX_TOKENS = 2048;

/** 缺金鑰時的統一訊息——讓畫面講人話，不要把原始錯誤 JSON 丟給使用者 */
export const AI_NO_KEY_MESSAGE = "AI 助手尚未設定（缺 ANTHROPIC_API_KEY），請聯絡管理員。";
