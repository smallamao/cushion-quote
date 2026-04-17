"use client";

import { Camera, Loader2, Upload } from "lucide-react";
import { useRef } from "react";

import { Button } from "@/components/ui/button";
import { useBusinessCardRecognition } from "@/hooks/useBusinessCardRecognition";
import type { BusinessCardData } from "@/lib/gemini-client";

interface BusinessCardUploadProps {
  onRecognized: (data: BusinessCardData, imageUrl: string) => void;
  existingImageUrl?: string;
}

export function BusinessCardUpload({
  onRecognized,
  existingImageUrl,
}: BusinessCardUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { status, error, recognize } = useBusinessCardRecognition();

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const result = await recognize(file);
    if (result) {
      onRecognized(result.data, result.imageUrl);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-3">
      {existingImageUrl && (
        <div className="overflow-hidden rounded-[var(--radius)]">
          <img
            src={existingImageUrl}
            alt="名片"
            className="h-auto w-full max-w-[280px] rounded-[var(--radius)] border border-[var(--border)]"
          />
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />

      <Button
        variant="outline"
        size="sm"
        disabled={status === "uploading"}
        onClick={() => fileInputRef.current?.click()}
      >
        {status === "uploading" ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            辨識中...
          </>
        ) : existingImageUrl ? (
          <>
            <Camera className="h-3.5 w-3.5" />
            重新上傳名片
          </>
        ) : (
          <>
            <Upload className="h-3.5 w-3.5" />
            上傳名片
          </>
        )}
      </Button>

      {status === "error" && (
        <p className="text-xs text-[var(--error)]">{error}</p>
      )}
    </div>
  );
}
