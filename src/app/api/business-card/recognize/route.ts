import { randomUUID } from "crypto";

import { v2 as cloudinary } from "cloudinary";
import { NextResponse } from "next/server";

import { recognizeBusinessCard } from "@/lib/gemini-client";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function uploadToCloudinary(
  data: Buffer,
  publicId: string,
): Promise<{ secure_url: string }> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        {
          folder: "business-cards",
          public_id: publicId,
          resource_type: "image",
        },
        (error, result) => {
          if (error || !result) {
            reject(error ?? new Error("上傳失敗"));
            return;
          }
          resolve(result);
        },
      )
      .end(data);
  });
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("images") as File[];

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
    }

    // Run OCR and Cloudinary uploads in parallel
    const hasCloudinary = Boolean(process.env.CLOUDINARY_CLOUD_NAME);

    const [ocrResult, ...uploadResults] = await Promise.all([
      recognizeBusinessCard(images),
      ...(hasCloudinary
        ? images.map((img) => {
            const publicId = `card-${Date.now()}-${randomUUID().slice(0, 8)}`;
            return uploadToCloudinary(img.buffer, publicId);
          })
        : []),
    ]);

    const imageUrls = uploadResults.map((r) => r.secure_url);

    // Fallback: if no Cloudinary, use base64 but compress first
    if (!hasCloudinary) {
      for (const img of images) {
        // Store a small placeholder — just the first 100 chars to indicate image exists
        imageUrls.push("");
      }
    }

    return NextResponse.json({
      ok: true,
      data: ocrResult,
      imageUrls,
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
