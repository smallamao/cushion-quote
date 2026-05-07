import { NextResponse } from "next/server";

import { getSession } from "@/app/api/sheets/einvoices/_auth";
import { fetchNotionOrders } from "@/lib/notion-client";

const DB_ID = "f47a37a2-0100-4d31-8286-ca25f32f8380";

// ── CSV helpers ───────────────────────────────────────────

const BOM = "﻿";

function csvCell(v: string | number | null | undefined): string {
  const s = String(v ?? "");
  return s.includes(",") || s.includes('"') || s.includes("\n")
    ? `"${s.replace(/"/g, '""')}"` : s;
}

function fmtDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${Number(y) - 1911}/${m}/${d}`;
}

// ── Route ─────────────────────────────────────────────────

interface ExportRequest {
  since: string; // YYYY-MM-DD
  until: string; // YYYY-MM-DD
}

export async function POST(request: Request) {
  const session = getSession(request as unknown as Request);
  if (!session) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  let body: ExportRequest;
  try {
    body = (await request.json()) as ExportRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "請求格式錯誤" }, { status: 400 });
  }

  if (!body.since || !body.until) {
    return NextResponse.json({ ok: false, error: "缺少 since / until 參數" }, { status: 400 });
  }

  try {
    const rows = await fetchNotionOrders(DB_ID, body.since, body.until);

    const header = [csvCell("Name"), csvCell("下單日"), csvCell("成本"), csvCell("出貨日"), csvCell("報價")].join(",");
    const lines = rows.map((r) =>
      [
        csvCell(r.name),
        csvCell(fmtDate(r.orderDate)),
        csvCell(r.cost),
        csvCell(fmtDate(r.shippingDate)),
        csvCell(r.quote),
      ].join(",")
    );

    const csv = BOM + [header, ...lines].join("\r\n");
    const base64 = Buffer.from(csv, "utf8").toString("base64");

    // Filename based on billing month (until date)
    const [y, m] = body.until.split("-");
    const filename = `Notion訂單_${Number(y) - 1911}${m}.csv`;

    return NextResponse.json({ ok: true, rowCount: rows.length, base64, filename });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "匯出失敗";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
