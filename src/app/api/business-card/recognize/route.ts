import { NextResponse } from "next/server";

import { recognizeBusinessCard } from "@/lib/gemini-client";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("image") as File | null;

    if (!file) {
      return NextResponse.json(
        { ok: false, error: "未提供圖片" },
        { status: 400 },
      );
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/heic"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { ok: false, error: "不支援的圖片格式，請使用 JPG、PNG 或 WebP" },
        { status: 400 },
      );
    }

    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { ok: false, error: "圖片大小不可超過 10MB" },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // OCR with Gemini
    const ocrResult = await recognizeBusinessCard(buffer, file.type);

    // Store image as base64 data URL (no Drive upload needed)
    const base64 = buffer.toString("base64");
    const imageUrl = `data:${file.type};base64,${base64}`;

    return NextResponse.json({
      ok: true,
      data: ocrResult,
      imageUrl,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
