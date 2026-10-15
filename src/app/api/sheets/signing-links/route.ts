import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/api-auth";

import { getSheetsClient } from "@/lib/sheets-client";
import { createSigningLink, revokePendingLinksForVersion } from "@/lib/signing-links-sheet";
import { generateShortCode, SHORT_CODE_LEN } from "@/lib/signing-link-code";
import type { SigningLink } from "@/lib/signing-types";

import { getVersionRows, isoNow, versionRowToRecord } from "../_v2-utils";


interface CreateBody {
  versionId: string;
  unsignedPdfUrl: string;
  unsignedImageUrl?: string;
  expiresInDays?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export async function POST(request: Request) {
  // route 層再驗一次身分。middleware 已經把這條路徑限制在 admin，這裡是第二道鎖：
  // /api/sheets 底下多數端點原本只靠 middleware 那一道門，而 Next.js 近期就有三個
  // middleware bypass 的公告——一道門倒了不該等於全部資料大開（2026-10-15 弱點分析）。
  const guard = requireAdmin(request);
  if (guard.denied) return guard.denied;


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
    // 一版一合約：已回簽的版本不再產生連結，內容要改請建新版本（舊版自動變已取代）。
    // 否則客人再簽一次會在同一版本疊出第二份合約，歸檔時分不清哪份算數。
    if (version.isMultiOption) {
      return NextResponse.json(
        { ok: false, error: "多方案報價不能簽署，請先建立「確認方案」的新版本再產生連結" },
        { status: 409 },
      );
    }
    if (version.signedBack || (version.signedContractUrls?.length ?? 0) > 0) {
      return NextResponse.json(
        { ok: false, error: "此版本已回簽，如需修改請建立新版本" },
        { status: 409 },
      );
    }

    // 一次只有一個有效連結：作廢同版本先前 pending 的連結
    await revokePendingLinksForVersion(body.versionId);

    const now = isoNow();
    const days = body.expiresInDays ?? 30;
    const expiresAt = days > 0 ? new Date(Date.now() + days * DAY_MS).toISOString() : "";
    const link: SigningLink = {
      // 10 字元短碼（無易混淆字元 0/O/1/l/I）：54^10 ≈ 2×10^17 組合（~57 bits）；
      // 有效期 30 天、簽完即失效、查無此碼一律 404 不洩漏資訊。
      // 舊版 6 字元短碼以字串等值比對，已發出的連結永久相容（不因版本更新失效）。
      token: generateShortCode(SHORT_CODE_LEN),
      versionId: version.versionId,
      quoteId: version.quoteId,
      caseId: version.caseId,
      status: "pending",
      unsignedPdfUrl: body.unsignedPdfUrl,
      unsignedImageUrl: body.unsignedImageUrl ?? "",
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
