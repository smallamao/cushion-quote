import { NextResponse } from "next/server";

import { recognizeBusinessCard } from "@/lib/gemini-client";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("images") as File[];

    // Backward compat: single "image" field
    if (files.length === 0) {
      const single = formData.get("image") as File | null;
      if (single) files.push(single);
    }

    if (files.length === 0) {
      return NextResponse.json(
        { ok: false, error: "未提供圖片" },
        { status: 400 },
      );
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/heic"];
    const maxSize = 10 * 1024 * 1024;

    const images: { buffer: Buffer; mimeType: string }[] = [];
    const imageUrls: string[] = [];

    for (const file of files) {
      if (!allowedTypes.includes(file.type)) {
        return NextResponse.json(
          { ok: false, error: "不支援的圖片格式，請使用 JPG、PNG 或 WebP" },
          { status: 400 },
        );
      }
      if (file.size > maxSize) {
        return NextResponse.json(
          { ok: false, error: "圖片大小不可超過 10MB" },
          { status: 400 },
        );
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      images.push({ buffer, mimeType: file.type });
      imageUrls.push(`data:${file.type};base64,${buffer.toString("base64")}`);
    }

    const ocrResult = await recognizeBusinessCard(images);

    return NextResponse.json({
      ok: true,
      data: ocrResult,
      imageUrls,
      // backward compat
      imageUrl: imageUrls[0] ?? "",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
