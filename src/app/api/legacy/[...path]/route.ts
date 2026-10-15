import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/api-auth";

const BASE_URL = process.env.LEGACY_API_URL;

async function proxy(req: NextRequest, path: string[]) {
  if (!BASE_URL) {
    return NextResponse.json({ error: "LEGACY_API_URL not configured" }, { status: 500 });
  }

  const target = `${BASE_URL}/api/${path.join("/")}`;
  const search = req.nextUrl.searchParams.toString();
  const url = search ? `${target}?${search}` : target;

  const init: RequestInit = { method: req.method };
  if (req.method !== "GET" && req.method !== "HEAD") {
    const body = await req.text();
    init.body = body;
    init.headers = { "Content-Type": "application/json" };
  }

  let upstream: Response;
  try {
    upstream = await fetch(url, init);
  } catch (e) {
    console.error("[legacy proxy] network error:", e);
    return NextResponse.json({ error: "upstream_unavailable" }, { status: 502 });
  }

  const contentType = upstream.headers.get("content-type") ?? "";

  if (contentType.startsWith("image/")) {
    const buffer = await upstream.arrayBuffer();
    return new NextResponse(buffer, {
      status: upstream.status,
      headers: { "Content-Type": contentType },
    });
  }

  try {
    const data: unknown = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
  } catch {
    return NextResponse.json({ error: "invalid_upstream_response" }, { status: 502 });
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  // 🔴 2026-10-15 第二輪稽核：/api/sheets 以外的端點在第一輪被整批漏掉——
  //    我的掃描範圍只做了 /api/sheets/**。這些端點一樣碰公司憑證與營運資料
  //    （Trello／Notion 金鑰、舊系統代理、司機電話、AI 助理工具），
  //    而且同樣只靠 middleware 那一道門。route 層再驗一次。
  const guard = await requireAdmin(req);
  if (guard.denied) return guard.denied;


  const { path } = await params;
  return proxy(req, path);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  // 🔴 2026-10-15 第二輪稽核：/api/sheets 以外的端點在第一輪被整批漏掉——
  //    我的掃描範圍只做了 /api/sheets/**。這些端點一樣碰公司憑證與營運資料
  //    （Trello／Notion 金鑰、舊系統代理、司機電話、AI 助理工具），
  //    而且同樣只靠 middleware 那一道門。route 層再驗一次。
  const guard = await requireAdmin(req);
  if (guard.denied) return guard.denied;


  const { path } = await params;
  return proxy(req, path);
}
