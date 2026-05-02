"use client";

import { useState } from "react";
import { Copy, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MessageResultModalProps {
  open: boolean;
  title: string;
  message: string;
  onClose: () => void;
}

export function MessageResultModal({
  open,
  title,
  message,
  onClose,
}: MessageResultModalProps) {
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  async function handleCopy() {
    await navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-t-2xl bg-[var(--bg-elevated)] sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <span className="text-sm font-semibold text-[var(--text-primary)]">
            {title}
          </span>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4">
          <textarea
            readOnly
            value={message}
            rows={10}
            className="w-full resize-none rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-subtle)] p-3 font-mono text-xs text-[var(--text-primary)] focus:outline-none"
          />
        </div>

        <div className="flex gap-2 border-t border-[var(--border)] px-4 py-3">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            關閉
          </Button>
          <Button className="flex-1" onClick={handleCopy}>
            {copied ? (
              <>
                <Check className="mr-1.5 h-4 w-4" />
                已複製
              </>
            ) : (
              <>
                <Copy className="mr-1.5 h-4 w-4" />
                複製訊息
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
