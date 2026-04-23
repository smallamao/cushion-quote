import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";

import { getSession } from "../_auth";
import { buildEInvoiceCandidates } from "../_shared";

export async function GET(request: Request) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const versionId = searchParams.get("versionId")?.trim() ?? "";

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: true, candidates: [] });
  }

  try {
    const candidates = await buildEInvoiceCandidates(client, versionId ? { versionId } : {});
    return NextResponse.json({ ok: true, candidates });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
