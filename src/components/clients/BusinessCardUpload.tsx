"use client";

import { Loader2, Upload } from "lucide-react";
import { useRef } from "react";

import { Button } from "@/components/ui/button";
import { useBusinessCardRecognition } from "@/hooks/useBusinessCardRecognition";
import type { BusinessCardData } from "@/lib/gemini-client";

interface BusinessCardUploadProps {
  onRecognized: (data: BusinessCardData, imageUrls: string[]) => void;
}

export function BusinessCardUpload({ onRecognized }: BusinessCardUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { status, error, recognize } = useBusinessCardRecognition();

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const result = await recognize(Array.from(files));
    if (result) {
      onRecognized(result.data, result.imageUrls);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        capture="environment"
        multiple
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
        ) : (
          <>
            <Upload className="h-3.5 w-3.5" />
            上傳名片（可多選正反面）
          </>
        )}
      </Button>

      {status === "error" && (
        <p className="text-xs text-[var(--error)]">{error}</p>
      )}
    </div>
  );
}
