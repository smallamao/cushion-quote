import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import { scanClientImpact } from "@/lib/client-cleanup";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get("ids")?.trim() ?? "";
  const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);

  if (ids.length === 0) {
    return NextResponse.json({ ok: false, error: "ids is required" }, { status: 400 });
  }

  const sheetsClient = await getSheetsClient();
  if (!sheetsClient) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const impact = await scanClientImpact(sheetsClient, ids);
    return NextResponse.json({ ok: true, impact });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
