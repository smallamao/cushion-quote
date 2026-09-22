import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import { findServiceById, updateService } from "@/lib/after-sales-sheet";
import {
  RANGE_DATA,
  ROW_RANGE,
  generateToken,
  normalizePeriod,
  rowToSession,
  sessionToRow,
} from "@/lib/cleaning-slots-sheet";
import type { CleaningSlotProposal, CleaningSlotSession } from "@/lib/types";

export const dynamic = "force-dynamic";

type Located = { session: CleaningSlotSession; rowNumber: number; role: "customer" | "tech" };

async function locate(token: string): Promise<Located | null> {
  const client = await getSheetsClient();
  if (!client) return null;
  const res = await client.sheets.spreadsheets.values.get({
    spreadsheetId: client.spreadsheetId,
    range: RANGE_DATA,
  });
  const rows = (res.data.values ?? []) as string[][];
  const idx = rows.findIndex((r) => r[2] === token || r[3] === token);
  if (idx === -1) return null;
  const session = rowToSession(rows[idx]);
  const role = session.customerToken === token ? "customer" : "tech";
  return { session, rowNumber: idx + 2, role };
}

async function writeSession(session: CleaningSlotSession, rowNumber: number): Promise<void> {
  const client = await getSheetsClient();
  if (!client) throw new Error("Google Sheets 未設定");
  await client.sheets.spreadsheets.values.update({
    spreadsheetId: client.spreadsheetId,
    range: ROW_RANGE(rowNumber),
    valueInputOption: "RAW",
    requestBody: { values: [sessionToRow({ ...session, updatedAt: new Date().toISOString() })] },
  });
}

// GET /api/public/cleaning/[token] — 依 token 類型回檢視資料（免登入）
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await locate(token);
  if (!found) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const { session, role } = found;
  const service = await findServiceById(session.serviceId);

  const item = [service?.modelNameSnapshot, service?.itemDescription].filter(Boolean).join(" ") || "到府清潔";
  if (role === "customer") {
    return NextResponse.json({
      ok: true,
      role,
      status: session.status,
      view: {
        clientName: service?.clientName ?? "",
        item,
        address: session.customerAddress || service?.deliveryAddress || "",
        phone: session.customerPhone || service?.clientPhone || "",
      },
    });
  }
  return NextResponse.json({
    ok: true,
    role,
    status: session.status,
    view: {
      clientName: service?.clientName ?? "",
      address: session.customerAddress || service?.deliveryAddress || "",
      phone: session.customerPhone || service?.clientPhone || "",
      item,
      issue: service?.issueDescription ?? "",
      proposedSlots: session.proposedSlots,
      confirmedDate: session.confirmedDate,
      confirmedPeriod: session.confirmedPeriod,
    },
  });
}

// POST /api/public/cleaning/[token]
//  客人 token → { slots:[{date,period}], address, phone }
//  師傅 token → { chosenIndex, period? } | { reject:true }
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await locate(token);
  if (!found) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const { session, rowNumber, role } = found;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  try {
    if (role === "customer") {
      if (session.status !== "awaiting_customer") {
        return NextResponse.json({ ok: false, error: "already_submitted" }, { status: 409 });
      }
      const rawSlots = Array.isArray(body.slots) ? (body.slots as Array<{ date?: string; period?: string }>) : [];
      const slots: CleaningSlotProposal[] = rawSlots
        .filter((s) => s && typeof s.date === "string" && s.date)
        .slice(0, 3)
        .map((s) => ({ date: s.date as string, period: normalizePeriod(s.period) }));
      if (slots.length === 0) {
        return NextResponse.json({ ok: false, error: "請至少選一個日期時段" }, { status: 400 });
      }
      const address = typeof body.address === "string" ? body.address.trim() : session.customerAddress;
      const phone = typeof body.phone === "string" ? body.phone.trim() : session.customerPhone;
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const next: CleaningSlotSession = {
        ...session,
        proposedSlots: slots,
        customerAddress: address,
        customerPhone: phone,
        techToken: session.techToken || generateToken(),
        status: "awaiting_tech",
      };
      await writeSession(next, rowNumber);
      // 即時把客人填的資料寫回服務單（空白單一送出就長出內容；內勤零登打）
      const svcPatch: Parameters<typeof updateService>[1] = {};
      if (name) svcPatch.clientName = name;
      if (address) svcPatch.deliveryAddress = address;
      if (phone) svcPatch.clientPhone = phone;
      if (Object.keys(svcPatch).length > 0) await updateService(session.serviceId, svcPatch);
      return NextResponse.json({ ok: true });
    }

    // tech
    if (session.status === "confirmed") {
      return NextResponse.json({ ok: true, confirmed: { date: session.confirmedDate, period: session.confirmedPeriod } });
    }
    if (session.status !== "awaiting_tech" && session.status !== "tech_rejected") {
      return NextResponse.json({ ok: false, error: "not_ready" }, { status: 409 });
    }
    if (body.reject === true) {
      await writeSession({ ...session, status: "tech_rejected" }, rowNumber);
      return NextResponse.json({ ok: true, rejected: true });
    }
    const idx = Number(body.chosenIndex);
    const chosen = session.proposedSlots[idx];
    if (!chosen) {
      return NextResponse.json({ ok: false, error: "請選一個時段" }, { status: 400 });
    }
    const period = typeof body.period === "string" && body.period ? normalizePeriod(body.period) : chosen.period;
    await writeSession(
      { ...session, status: "confirmed", confirmedDate: chosen.date, confirmedPeriod: period },
      rowNumber,
    );
    // 精準寫回售後服務單：預定日期/時段、狀態→已排程；地址/電話僅在客人有填時才覆蓋。
    const patch: Parameters<typeof updateService>[1] = {
      scheduledDate: chosen.date,
      scheduledTime: period,
      status: "scheduled",
    };
    if (session.customerAddress) patch.deliveryAddress = session.customerAddress;
    if (session.customerPhone) patch.clientPhone = session.customerPhone;
    await updateService(session.serviceId, patch);
    return NextResponse.json({ ok: true, confirmed: { date: chosen.date, period } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
