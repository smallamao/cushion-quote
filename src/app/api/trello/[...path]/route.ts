import { NextResponse } from "next/server";

import { requireSession } from "@/lib/api-auth";

// 🔴 2026-10-15 修補：這支 catch-all 代理原本整支沒驗身分，只比對路徑前綴。
//    它會自己補上公司的 TRELLO_KEY／TRELLO_TOKEN 再把 Trello 的回應原封不動吐回來，
//    所以等於「任何能打到這個路徑的人都能用公司的 Trello 金鑰」。
//    配上當時 middleware 的副檔名漏洞（網址結尾加 .png 就免登入），外人不用帳號
//    密碼就能抓訂單板卡片上的附件——訂單照片、客人提供的圖、報價單截圖。
//    副檔名那個洞已經修掉，這裡再補 route 層驗證，不要只靠 middleware。
//    旁邊的 attachment-proxy 本來就有驗 session，但 catch-all 這條路繞過它，
//    那道防護等於白做。

const TRELLO_KEY = process.env.TRELLO_KEY?.trim();
const TRELLO_TOKEN = process.env.TRELLO_TOKEN?.trim();
const TRELLO_BASE = "https://api.trello.com/1";

// Allowlist: only permit paths the app legitimately needs
const ALLOWED_GET_PREFIXES = [
  "boards/",
  "cards/",
  "lists/",
  "checklists/",
  "search",
];
const ALLOWED_PUT_PREFIXES = [
  "cards/",
  "checklists/",
];
const ALLOWED_POST_PREFIXES = [
  "cards/",       // attachments, checklist items
  "checklists/",
];
const ALLOWED_DELETE_PREFIXES = [
  "cards/",       // remove labels
  "checklists/",
];

function isAllowed(path: string, prefixes: string[]): boolean {
  return prefixes.some((p) => path === p.replace(/\/$/, "") || path.startsWith(p));
}

function forbidden() {
  return NextResponse.json({ error: "forbidden" }, { status: 403 });
}

function buildTrelloUrl(path: string, searchParams: URLSearchParams) {
  const params = new URLSearchParams(searchParams);
  if (TRELLO_KEY) params.set("key", TRELLO_KEY);
  if (TRELLO_TOKEN) params.set("token", TRELLO_TOKEN);
  return `${TRELLO_BASE}/${path}?${params.toString()}`;
}

async function safeJson(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: `Trello 回應非 JSON: ${text.slice(0, 150)}` };
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const guard = await requireSession(req);
  if (guard.denied) return guard.denied;

  const { path } = await params;
  const joined = path.join("/");
  if (!isAllowed(joined, ALLOWED_GET_PREFIXES)) return forbidden();
  const { searchParams } = new URL(req.url);
  const url = buildTrelloUrl(joined, searchParams);
  const res = await fetch(url, { cache: "no-store" });
  const data = await safeJson(res);
  return NextResponse.json(data, { status: res.status });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const guard = await requireSession(req);
  if (guard.denied) return guard.denied;

  const { path } = await params;
  const joined = path.join("/");
  if (!isAllowed(joined, ALLOWED_PUT_PREFIXES)) return forbidden();
  const { searchParams } = new URL(req.url);
  const body = await req.json().catch(() => undefined);
  const url = buildTrelloUrl(joined, searchParams);
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await safeJson(res);
  return NextResponse.json(data, { status: res.status });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const guard = await requireSession(req);
  if (guard.denied) return guard.denied;

  const { path } = await params;
  const joined = path.join("/");
  if (!isAllowed(joined, ALLOWED_POST_PREFIXES)) return forbidden();
  const { searchParams } = new URL(req.url);
  const body = await req.json().catch(() => undefined);
  const url = buildTrelloUrl(joined, searchParams);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await safeJson(res);
  return NextResponse.json(data, { status: res.status });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const guard = await requireSession(req);
  if (guard.denied) return guard.denied;

  const { path } = await params;
  const joined = path.join("/");
  if (!isAllowed(joined, ALLOWED_DELETE_PREFIXES)) return forbidden();
  const { searchParams } = new URL(req.url);
  const url = buildTrelloUrl(joined, searchParams);
  const res = await fetch(url, { method: "DELETE" });
  const data = await safeJson(res);
  return NextResponse.json(data, { status: res.status });
}
