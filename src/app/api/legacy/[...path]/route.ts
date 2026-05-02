import { NextRequest, NextResponse } from "next/server";

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

  const upstream = await fetch(url, init);
  const contentType = upstream.headers.get("content-type") ?? "";

  if (contentType.startsWith("image/")) {
    const buffer = await upstream.arrayBuffer();
    return new NextResponse(buffer, {
      status: upstream.status,
      headers: { "Content-Type": contentType },
    });
  }

  const data: unknown = await upstream.json();
  return NextResponse.json(data, { status: upstream.status });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxy(req, path);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxy(req, path);
}
