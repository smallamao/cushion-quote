import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import { createSigningLink, revokePendingLinksForVersion } from "@/lib/signing-links-sheet";
import type { SigningLink } from "@/lib/signing-types";

import { getVersionRows, isoNow, versionRowToRecord } from "../_v2-utils";

interface CreateBody {
  versionId: string;
  unsignedPdfUrl: string;
  expiresInDays?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export async function POST(request: Request) {
  const body = (await request.json()) as CreateBody;
  if (!body?.versionId || !body?.unsignedPdfUrl) {
    return NextResponse.json({ ok: false, error: "缺少 versionId 或 unsignedPdfUrl" }, { status: 400 });
  }

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const version = (await getVersionRows(client))
      .map(versionRowToRecord)
      .find((v) => v.versionId === body.versionId);
    if (!version) {
      return NextResponse.json({ ok: false, error: "version not found" }, { status: 404 });
    }

    // 一次只有一個有效連結：作廢同版本先前 pending 的連結
    await revokePendingLinksForVersion(body.versionId);

    const now = isoNow();
    const days = body.expiresInDays ?? 30;
    const expiresAt = days > 0 ? new Date(Date.now() + days * DAY_MS).toISOString() : "";
    const link: SigningLink = {
      token: randomBytes(24).toString("base64url"),
      versionId: version.versionId,
      quoteId: version.quoteId,
      caseId: version.caseId,
      status: "pending",
      unsignedPdfUrl: body.unsignedPdfUrl,
      createdAt: now,
      createdBy: "",
      expiresAt,
      signedAt: "",
      signerName: "",
      signerIp: "",
      signerUserAgent: "",
      signedPdfUrl: "",
    };
    await createSigningLink(link);

    return NextResponse.json({ ok: true, token: link.token });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }
}
