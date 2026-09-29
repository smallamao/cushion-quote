import type { AfterSalesService } from "@/lib/types";

/**
 * 派工單 → 行事曆事件（.ics 與 Google 行事曆共用同一份運算，避免兩邊漂移）。
 *
 * 時間處理刻意保守：scheduledTime 是自由輸入，可能是「14:00」也可能是「上午」。
 * 只有明確 HH:MM 才建定時行程（2 小時）；其餘一律整日行程並把時段寫進標題，
 * 不自行推測幾點，免得師傅照行事曆跑錯時段。台北固定 UTC+8（無日光節約）。
 */

export interface DispatchEvent {
  allDay: boolean;
  /** 定時：YYYYMMDDTHHMMSSZ（UTC）；整日：YYYYMMDD */
  start: string;
  end: string;
  summary: string;
  /** 原始純文字（含換行）；.ics 自行跳脫、Google 自行編碼 */
  description: string;
  location: string;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** 台北 YYYY-MM-DD + 時分 → ICS/Google 的 UTC 時間戳。 */
function taipeiToUtcStamp(date: string, hh: number, mm: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const d = new Date(
    Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), hh, mm) - 8 * 3600 * 1000,
  );
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`
  );
}

/** YYYY-MM-DD（+天數）→ YYYYMMDD。 */
function dateOnly(date: string, addDays = 0): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  d.setUTCDate(d.getUTCDate() + addDays);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

const t = (v: string | undefined) => (v ?? "").trim();

/** 由售後服務單組出行事曆事件；無排程日期或日期格式不正確回 null。 */
export function buildDispatchEvent(service: AfterSalesService): DispatchEvent | null {
  const date = t(service.scheduledDate);
  if (!date) return null;

  const rawTime = t(service.scheduledTime);
  const hm = /^(\d{1,2}):(\d{2})$/.exec(rawTime);

  let start: string | null;
  let end: string | null;
  let allDay = false;
  if (hm) {
    const h = Number(hm[1]);
    const mi = Number(hm[2]);
    if (h > 23 || mi > 59) return null;
    start = taipeiToUtcStamp(date, h, mi);
    end = taipeiToUtcStamp(date, h + 2, mi);
  } else {
    allDay = true;
    start = dateOnly(date, 0);
    end = dateOnly(date, 1);
  }
  if (!start || !end) return null;

  const isCleaning = (service.issueCategories ?? []).includes("到府清潔");
  const kind = isCleaning ? "到府清潔" : "到府維修";
  const periodSuffix = !hm && rawTime ? `（${rawTime}）` : "";
  const summary = `${kind}${periodSuffix} — ${t(service.clientName) || "客戶"}`;

  const item = [t(service.modelNameSnapshot), t(service.itemDescription)]
    .filter(Boolean)
    .join(" ");
  const description = [
    t(service.clientName) ? `客戶：${t(service.clientName)}` : "",
    t(service.clientPhone) ? `電話：${t(service.clientPhone)}` : "",
    t(service.clientPhone2)
      ? `電話2${t(service.clientContact2) ? `（${t(service.clientContact2)}）` : ""}：${t(service.clientPhone2)}`
      : "",
    t(service.deliveryAddress) ? `地址：${t(service.deliveryAddress)}` : "",
    item ? `品項：${item}` : "",
    t(service.itemLocation) ? `位置：${t(service.itemLocation)}` : "",
    t(service.issueDescription) ? `問題：${t(service.issueDescription)}` : "",
    t(service.dispatchNotes) ? `備註：${t(service.dispatchNotes)}` : "",
    `單號：${service.serviceId}`,
  ]
    .filter(Boolean)
    .join("\n");

  return { allDay, start, end, summary, description, location: t(service.deliveryAddress) };
}

/**
 * Google 行事曆「新增活動」網址（Android 一點就開 Google 日曆並帶好資料；
 * iPhone 裝了 Google 日曆也可用，沒裝則開網頁版）。
 */
export function googleCalendarUrl(ev: DispatchEvent): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: ev.summary,
    dates: `${ev.start}/${ev.end}`,
    details: ev.description,
  });
  if (ev.location) params.set("location", ev.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
