import { NextResponse } from "next/server";

const TRELLO_KEY = process.env.TRELLO_KEY?.trim();
const TRELLO_TOKEN = process.env.TRELLO_TOKEN?.trim();
const TRELLO_BASE = "https://api.trello.com/1";

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
    return { error: `Trello 回應非 JSON (HTTP ${res.status})` };
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const { searchParams } = new URL(req.url);
  const url = buildTrelloUrl(path.join("/"), searchParams);
  const res = await fetch(url, { cache: "no-store" });
  const data = await safeJson(res);
  return NextResponse.json(data, { status: res.status });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const { searchParams } = new URL(req.url);
  const body = await req.json().catch(() => undefined);
  const url = buildTrelloUrl(path.join("/"), searchParams);
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
  const { path } = await params;
  const { searchParams } = new URL(req.url);
  const body = await req.json().catch(() => undefined);
  const url = buildTrelloUrl(path.join("/"), searchParams);
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
  const { path } = await params;
  const { searchParams } = new URL(req.url);
  const url = buildTrelloUrl(path.join("/"), searchParams);
  const res = await fetch(url, { method: "DELETE" });
  const data = await safeJson(res);
  return NextResponse.json(data, { status: res.status });
}
