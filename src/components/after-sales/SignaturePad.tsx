"use client";

import { useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";

import { Button } from "@/components/ui/button";

interface SignaturePadProps {
  open: boolean;
  onClose: () => void;
  onSave: (dataUrl: string) => void;
  uploading?: boolean;
}

export function SignaturePad({ open, onClose, onSave, uploading }: SignaturePadProps) {
  const sigRef = useRef<SignatureCanvas>(null);
  const [empty, setEmpty] = useState(true);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl bg-[var(--bg-elevated)] p-5 shadow-2xl">
        <h2 className="mb-3 text-center text-sm font-semibold text-[var(--text-primary)]">
          客戶簽名確認
        </h2>

        <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-white">
          <SignatureCanvas
            ref={sigRef}
            penColor="black"
            canvasProps={{ width: 320, height: 160, className: "block touch-none" }}
            onBegin={() => setEmpty(false)}
          />
        </div>
        <p className="mt-1.5 text-center text-[11px] text-[var(--text-tertiary)]">
          請在上方用手指簽名
        </p>

        <div className="mt-4 flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => {
              sigRef.current?.clear();
              setEmpty(true);
            }}
          >
            清除
          </Button>
          <Button
            type="button"
            size="sm"
            className="flex-1"
            disabled={empty || uploading}
            onClick={() => {
              const dataUrl = sigRef.current?.toDataURL("image/png");
              if (dataUrl) onSave(dataUrl);
            }}
          >
            {uploading ? "上傳中…" : "確認簽名"}
          </Button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full text-center text-xs text-[var(--text-tertiary)] underline"
        >
          取消
        </button>
      </div>
    </div>
  );
}
