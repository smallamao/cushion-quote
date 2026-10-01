/**
 * 簽署頁「常見問題」的文字格式與解析。
 *
 * 文案存在系統設定（sign_faq）讓老闆自己改，不寫死在程式裡——改一句話不必重新部署。
 * 刻意用純文字而不是 JSON：設定頁是一個 textarea，老闆要能直接打字，
 * JSON 少一個逗號就整段壞掉，對非工程背景的人是地雷。
 *
 * 格式：每則用一行 `---` 分隔；每則的**第一行是問題**，其餘是答案（答案可多行）。
 *
 *   簽了之後還可以改嗎？
 *   可以。在我們通知您「開始叫料」之前都還能調整。
 *   ---
 *   可以開發票嗎？
 *   可以，簽署時勾選即可。
 *
 * 問題或答案任一為空的區塊直接略過——寧可少顯示一則，也不要在客人面前露出半截文案。
 */

export interface FaqItem {
  q: string;
  a: string;
}

export function parseFaq(text: string | undefined): FaqItem[] {
  return (text ?? "")
    .split(/^[ \t]*-{3,}[ \t]*$/m)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split("\n");
      return {
        q: (lines[0] ?? "").trim(),
        a: lines.slice(1).join("\n").trim(),
      };
    })
    .filter((item) => item.q !== "" && item.a !== "");
}
