"use client";

import { ImagePlus, Loader2 } from "lucide-react";
import { useRef, useState } from "react";

interface ImageDropLabelProps {
  /** 選檔或拖入單一檔案時觸發（取第一個檔）。 */
  onFile: (file: File) => void;
  uploading?: boolean;
  disabled?: boolean;
  /** 預設只收圖片；訂製工單也只放圖片。可傳 "image/*,video/*"。 */
  accept?: string;
  /** 高度 class，例如 h-16 / h-20。 */
  heightClass?: string;
}

/**
 * 點擊選檔 + 拖曳上傳（桌機從檔案總管拖入）的上傳佔位框，拖曳時高亮。
 * 取代原本「label 包 hidden input」的單圖上傳區。
 */
export function ImageDropLabel({
  onFile,
  uploading = false,
  disabled = false,
  accept = "image/*",
  heightClass = "h-16",
}: ImageDropLabelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const active = over && !disabled;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => !disabled && inputRef.current?.click()}
      onDragOver={(e) => {
        if (disabled) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files?.[0];
        if (!disabled && f) onFile(f);
      }}
      className={`flex ${heightClass} w-full cursor-pointer items-center justify-center rounded-[var(--radius-sm)] border border-dashed transition-colors ${
        active
          ? "border-[var(--accent)] bg-[var(--accent-muted)]"
          : "border-[var(--border)] hover:border-[var(--accent)] hover:bg-[var(--accent-muted)]"
      } ${disabled ? "pointer-events-none opacity-60" : ""}`}
    >
      {uploading ? (
        <Loader2 className="h-4 w-4 animate-spin text-[var(--text-tertiary)]" />
      ) : (
        <ImagePlus className="h-4 w-4 text-[var(--text-tertiary)]" />
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.currentTarget.value = "";
        }}
      />
    </div>
  );
}
