import { NextResponse } from "next/server";

import { findServiceById } from "@/lib/after-sales-sheet";
import { buildDispatchEvent } from "@/lib/dispatch-calendar";
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

  const ev = buildDispatchEvent(service);
  if (!ev) {
    return NextResponse.json({ ok: false, error: "no_schedule" }, { status: 404 });
  }

  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Potato Sofa//Dispatch//ZH-TW",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:dispatch-${esc(service.serviceId)}@potatosofa`,
    `DTSTAMP:${stamp}`,
    ev.allDay ? `DTSTART;VALUE=DATE:${ev.start}` : `DTSTART:${ev.start}`,
    ev.allDay ? `DTEND;VALUE=DATE:${ev.end}` : `DTEND:${ev.end}`,
    `SUMMARY:${esc(ev.summary)}`,
    ev.location ? `LOCATION:${esc(ev.location)}` : "",
    `DESCRIPTION:${esc(ev.description)}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT2H",
    "ACTION:DISPLAY",
    `DESCRIPTION:${esc(ev.summary)}`,
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
