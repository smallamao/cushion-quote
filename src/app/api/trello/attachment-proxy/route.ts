import { NextResponse } from "next/server";

// 2026-10-15：原本自己解析 cookie 只驗簽章，不查這個帳號現在還在不在職——
// 停用帳號 30 天內照樣進得來。改用 lib/api-auth 的共用實作，停用與降權立刻生效。

import { getActiveSession } from "@/lib/api-auth";

const TRELLO_KEY = process.env.TRELLO_KEY;
const TRELLO_TOKEN = process.env.TRELLO_TOKEN;

const ALLOWED_HOSTS = [
  "trello.com",
  "trello-attachments.s3.amazonaws.com",
  "attachments.trello.com",
];


export async function GET(request: Request) {
  const session = await getActiveSession(request);
  if (!session) return new NextResponse("not_authenticated", { status: 401 });

  const { searchParams } = new URL(request.url);
  const rawUrl = searchParams.get("url");
  if (!rawUrl) return new NextResponse("missing url", { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return new NextResponse("invalid url", { status: 400 });
  }

  const isAllowed = ALLOWED_HOSTS.some(
    (h) => parsed.hostname === h || parsed.hostname.endsWith("." + h),
  );
  if (!isAllowed) return new NextResponse("forbidden", { status: 403 });

  // S3 pre-signed URLs (downloadUrl) must NOT have an Authorization header — S3 rejects it
  const isS3 = parsed.hostname.includes("s3.amazonaws.com");
  const authHeader =
    !isS3 && TRELLO_KEY && TRELLO_TOKEN
      ? `OAuth oauth_consumer_key="${TRELLO_KEY}", oauth_token="${TRELLO_TOKEN}"`
      : undefined;

  const upstream = await fetch(parsed.toString(), {
    cache: "no-store",
    headers: authHeader ? { Authorization: authHeader } : {},
  });
  if (!upstream.ok) return new NextResponse("upstream error", { status: upstream.status });

  const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
  const body = await upstream.arrayBuffer();
  return new NextResponse(body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
