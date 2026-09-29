import { NextResponse } from "next/server";

import { findServiceById } from "@/lib/after-sales-sheet";
import { verifyDispatchToken } from "@/lib/dispatch-link";

// node:crypto（驗簽）＋ server-only（讀 Sheets）→ 需 Node runtime。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** RFC 5545 文字跳脫：反斜線、分號、逗號、換行。 */
function esc(v: string): string {
  return (v ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** 台北時間（UTC+8，無日光節約）的 YYYY-MM-DD + HH:mm → ICS 的 UTC 字串。 */
function taipeiToUtcStamp(date: string, hh: number, mm: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), hh, mm) - 8 * 3600 * 1000;
  const d = new Date(ms);
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`
  );
}

/** YYYY-MM-DD → ICS DATE（整日用）；可加天數。 */
function dateOnly(date: string, addDays = 0): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  d.setUTCDate(d.getUTCDate() + addDays);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ serviceId: string; sig: string }> },
) {
  const { serviceId, sig } = await params;

  if (!verifyDispatchToken(serviceId, sig)) {
    return NextResponse.json({ ok: false, error: "invalid_or_expired" }, { status: 404 });
  }

  let service;
  try {
    service = await findServiceById(serviceId);
  } catch (err) {
    console.error("dispatch ics findServiceById failed", err);
    return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 });
  }
  if (!service) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (service.status === "completed" || service.status === "cancelled") {
    return NextResponse.json({ ok: false, error: "closed" }, { status: 404 });
  }
  if (!service.scheduledDate) {
    return NextResponse.json({ ok: false, error: "no_schedule" }, { status: 404 });
  }

  const isCleaning = (service.issueCategories ?? []).includes("到府清潔");
  const rawTime = (service.scheduledTime ?? "").trim();
  const hm = /^(\d{1,2}):(\d{2})$/.exec(rawTime);

  // 有明確時刻 → 2 小時行程；否則（上午／下午／皆可／空白）→ 當日整日行程，
  // 時段文字放進標題，絕不自行推測幾點，避免師傅跑錯時段。
  let dtStart: string | null;
  let dtEnd: string | null;
  let allDay = false;
  if (hm) {
    const h = Number(hm[1]);
    const mi = Number(hm[2]);
    dtStart = taipeiToUtcStamp(service.scheduledDate, h, mi);
    dtEnd = taipeiToUtcStamp(service.scheduledDate, h + 2, mi);
  } else {
    allDay = true;
    dtStart = dateOnly(service.scheduledDate, 0);
    dtEnd = dateOnly(service.scheduledDate, 1);
  }
  if (!dtStart || !dtEnd) {
    return NextResponse.json({ ok: false, error: "bad_schedule" }, { status: 404 });
  }

  const kind = isCleaning ? "到府清潔" : "到府維修";
  const periodSuffix = !hm && rawTime ? `（${rawTime}）` : "";
  const summary = `${kind}${periodSuffix} — ${service.clientName || "客戶"}`;

  // 來源欄位常帶尾端換行，先 trim 再組，行事曆備註才不會出現空行。
  const t = (v: string | undefined) => (v ?? "").trim();
  const item = [t(service.modelNameSnapshot), t(service.itemDescription)].filter(Boolean).join(" ");
  const descLines = [
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
  ].filter(Boolean);

  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Potato Sofa//Dispatch//ZH-TW",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:dispatch-${esc(service.serviceId)}@potatosofa`,
    `DTSTAMP:${stamp}`,
    allDay ? `DTSTART;VALUE=DATE:${dtStart}` : `DTSTART:${dtStart}`,
    allDay ? `DTEND;VALUE=DATE:${dtEnd}` : `DTEND:${dtEnd}`,
    `SUMMARY:${esc(summary)}`,
    service.deliveryAddress ? `LOCATION:${esc(service.deliveryAddress)}` : "",
    `DESCRIPTION:${esc(descLines.join("\n"))}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT2H",
    "ACTION:DISPLAY",
    `DESCRIPTION:${esc(summary)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);

  const body = `${lines.join("\r\n")}\r\n`;
  const asciiName = `dispatch_${service.serviceId}.ics`;
  const niceName = `派工_${service.serviceId}.ics`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(niceName)}`,
      "Cache-Control": "no-store",
    },
  });
}
