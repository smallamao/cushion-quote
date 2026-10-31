import type { AfterSalesService } from "@/lib/types";

/**
 * 貼進 LINE 記事本的派工文案。
 *
 * 老闆 2026-10-31：原本的做法是「輸出 PDF → 轉 JPG → 再把文字複製貼到記事本 →
 * 再單獨貼一次派工連結」，同一份資料手工搬三次，太花時間。這支把整段文字連同
 * 派工連結一次組好，貼一次就完成。
 *
 * 版面沿用老闆原本在記事本的格式（服務單號／客戶資訊／產品資訊／服務項目／備註），
 * 只多了「預定時間」與連結——星期由程式算，不會再手打錯。
 */

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

/** 2026-11-21 → 11/21（六） */
export function formatNoteDate(date: string | undefined): string {
  if (!date) return "";
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAYS[d.getDay()]}）`;
}

/**
 * 🔴 內部用的行不要印給師傅。
 *
 * 售後服務單沒有「內部備註」欄位，所以 LINE 客服對話連結這類只有內勤要用的東西
 * 會被寫進「問題描述」裡（建單時的慣例）。那段文字會原樣出現在師傅的派工頁與
 * 這份文案上，外部師傅不該拿到客服後台連結。
 */
function stripInternalLines(text: string): string {
  return text
    .split("\n")
    .filter((line) => !/^\s*LINE\s*對話[：:]/.test(line))
    .join("\n")
    .trim();
}

/** 「標籤 值」一行；值是空的就整行不要 */
function row(label: string, value: string | undefined): string | null {
  const v = (value ?? "").trim();
  return v ? `${label} ${v}` : null;
}

/** 同一行放兩組「標籤 值」，右邊沒值就只印左邊 */
function pairRow(
  l: string,
  lv: string | undefined,
  r: string,
  rv: string | undefined,
): string | null {
  const left = row(l, lv);
  const right = row(r, rv);
  if (!left) return right;
  return right ? `${left}　${right}` : left;
}

export function buildDispatchNoteText(
  service: AfterSalesService,
  dispatchUrl?: string,
): string {
  const blocks: string[] = [];

  const head = pairRow("服務單號", service.serviceId, "填單日期", service.receivedDate);
  if (head) blocks.push(head);

  const client = [
    pairRow("訂單編號", service.relatedOrderNo, "出貨日期", service.shipmentDate),
    pairRow("主要聯絡人", service.clientName, "主要電話", service.clientPhone),
    pairRow("次要聯絡人", service.clientContact2, "次要電話", service.clientPhone2),
    row("送貨地址", service.deliveryAddress),
  ].filter(Boolean) as string[];
  if (client.length) blocks.push(["客戶資訊", ...client].join("\n"));

  const product = [
    pairRow("款式編號", service.modelCode, "款式名稱", service.modelNameSnapshot),
    row("位置", service.itemLocation),
  ].filter(Boolean) as string[];
  if (product.length) blocks.push(["產品資訊", ...product].join("\n"));

  const categories = (service.issueCategories ?? []).join("、");
  const description = stripInternalLines(service.issueDescription ?? "");
  const work = [categories, service.itemDescription, description].filter(Boolean) as string[];
  if (work.length) blocks.push(["服務項目", ...work].join("\n"));

  const when = [formatNoteDate(service.scheduledDate), service.scheduledTime]
    .filter(Boolean)
    .join(" ")
    .trim();
  const schedule = [row("", when)?.trim(), row("負責師傅", service.assignedTo)].filter(
    Boolean,
  ) as string[];
  if (schedule.length) blocks.push(["預定時間", ...schedule].join("\n"));

  const notes = (service.dispatchNotes ?? "").trim();
  if (notes) blocks.push(["備註", notes].join("\n"));

  const url = (dispatchUrl ?? "").trim();
  if (url) blocks.push(["師傅專用連結（可撥號、導航、加入行事曆）", url].join("\n"));

  return blocks.join("\n\n");
}
