import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME, verifySession } from "@/lib/auth";

const TRELLO_KEY = process.env.TRELLO_KEY;
const TRELLO_TOKEN = process.env.TRELLO_TOKEN;

const ALLOWED_HOSTS = [
  "trello.com",
  "trello-attachments.s3.amazonaws.com",
  "attachments.trello.com",
];

function getSession(request: Request) {
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .find((c) => c.trim().startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.split("=")[1];
  return verifySession(token);
}

export async function GET(request: Request) {
  const session = getSession(request);
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

  const authHeader =
    TRELLO_KEY && TRELLO_TOKEN
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
