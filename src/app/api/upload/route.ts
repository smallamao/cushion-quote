import { randomUUID } from "crypto";

import { v2 as cloudinary } from "cloudinary";
import { NextResponse } from "next/server";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  if (!process.env.CLOUDINARY_CLOUD_NAME) {
    return NextResponse.json({ ok: false, error: "Cloudinary 未設定" }, { status: 503 });
  }

  try {
    const formData = await request.formData();
    const entry = formData.get("file");
    if (!(entry instanceof File)) {
      return NextResponse.json({ ok: false, error: "缺少圖片檔案" }, { status: 400 });
    }

    if (!entry.type.startsWith("image/")) {
      return NextResponse.json({ ok: false, error: "僅支援圖片上傳" }, { status: 400 });
    }

    if (entry.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ ok: false, error: "圖片大小不可超過 10MB" }, { status: 400 });
    }

    const data = Buffer.from(await entry.arrayBuffer());
    const publicId = `quote-${Date.now()}-${randomUUID().slice(0, 8)}`;

    const result = await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          folder: "quote-attachments",
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
      ).end(data);
    });

    return NextResponse.json({
      ok: true,
      url: result.secure_url,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
