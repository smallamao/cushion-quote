import type { CustomOrder } from "@/lib/types";

/**
 * 貼進 LINE 記事本的訂製訂單文案。
 *
 * 老闆 2026-11-03：目前是「預覽列印 → 人工把工單上的字重打進記事本 → 同步 Notion
 * → 再去 Notion 把圖複製回來」。那張圖系統本來就產好了（同步 Notion 時用
 * generateWorkOrderJpgBlob 產的），繞一圈只是為了拿回自己做的東西；文字也是
 * 照著圖逐字重打。
 *
 * 版面完全照老闆記事本既有的樣子（S1089 實例）：
 *   編號：S1089 訂製坐背墊
 *   材質 貓抓守衛皮 5753 奶油波斯貓
 *
 *   • 坐墊 (HRH 5" 硬Q料)
 *   W68 x 60 x 13cm *一只
 *   ...
 *
 *   施工備註
 *   ◆ 外布套車拉鍊可拆洗
 *
 * 不加交期、配送、客戶名——老闆的版本沒有，記事本本身就在該客戶的群組裡。
 */

/** 尺寸欄本身就是多行（每行自帶 *一只），逐行輸出不要合併 */
function dimensionLines(dimensions: string | undefined): string[] {
  return (dimensions ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

export function buildWorkOrderNoteText(order: CustomOrder): string {
  const blocks: string[] = [];

  // 編號與材質是連著的兩行，中間不空行（照老闆記事本既有的樣子）
  const head: string[] = [];
  const headParts = [order.orderNumber, order.orderTitle].map((v) => (v ?? "").trim()).filter(Boolean);
  if (headParts.length) head.push(`編號：${headParts.join(" ")}`);
  const material = [order.materialName, order.materialCode].map((v) => (v ?? "").trim()).filter(Boolean);
  if (material.length) head.push(`材質 ${material.join(" ")}`);
  if (head.length) blocks.push(head.join("\n"));

  const itemLines: string[] = [];
  for (const item of order.items ?? []) {
    const name = (item.name ?? "").trim();
    const spec = (item.foamSpec ?? "").trim();
    // 分組標題（itemType=header）沒有尺寸，單獨成一行
    if (item.itemType === "header") {
      if (name) itemLines.push(`■ ${name}`);
      continue;
    }
    const title = [name, spec].filter(Boolean).join(" ");
    if (title) itemLines.push(`• ${title}`);
    const dims = dimensionLines(item.dimensions);
    // 尺寸都寫在 dimensions 時 quantity 會是空的；兩者都有才把數量接在後面
    const qty = (item.quantity ?? "").trim();
    if (dims.length) {
      itemLines.push(...(qty && dims.length === 1 ? [`${dims[0]} ${qty}`] : dims));
    } else if (qty) {
      itemLines.push(qty);
    }
    itemLines.push("");
  }
  while (itemLines.at(-1) === "") itemLines.pop();
  if (itemLines.length) blocks.push(itemLines.join("\n"));

  const notes = (order.notes ?? []).filter((n) => (n.text ?? "").trim());
  if (notes.length) {
    blocks.push(
      ["施工備註", ...notes.map((n) => `${n.isWarning ? "⚠" : "◆"} ${n.text.trim()}`)].join("\n"),
    );
  }

  return blocks.join("\n\n");
}
