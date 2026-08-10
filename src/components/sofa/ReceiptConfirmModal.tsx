"use client";

import { useState } from "react";
import { Check, Copy, X } from "lucide-react";

import { Button } from "@/components/ui/button";

interface Segment {
  label: string;
  text: string;
}

interface ReceiptConfirmModalProps {
  open: boolean;
  title: string;
  segments: Segment[];
  onClose: () => void;
}

/**
 * 一次顯示多段訊息（收款確認的「客戶回覆聯」「完整記錄」），每段各有複製鈕。
 * 複製不自動關閉，讓使用者可依需要複製任一段（省去先切換再輸出的步驟）。
 */
export function ReceiptConfirmModal({ open, title, segments, onClose }: ReceiptConfirmModalProps) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  if (!open) return null;

  async function copy(idx: number, text: string) {
    await navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx((c) => (c === idx ? null : c)), 1500);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col rounded-t-2xl bg-[var(--bg-elevated)] sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <span className="text-sm font-semibold text-[var(--text-primary)]">{title}</span>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {segments.map((seg, idx) => (
            <div key={seg.label}>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[var(--text-secondary)]">{seg.label}</span>
                <Button size="sm" onClick={() => void copy(idx, seg.text)}>
                  {copiedIdx === idx ? (
                    <>
                      <Check className="mr-1 h-3.5 w-3.5" />
                      已複製
                    </>
                  ) : (
                    <>
                      <Copy className="mr-1 h-3.5 w-3.5" />
                      複製此段
                    </>
                  )}
                </Button>
              </div>
              <textarea
                readOnly
                value={seg.text}
                rows={9}
                className="w-full resize-none rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-subtle)] p-3 font-mono text-xs leading-relaxed text-[var(--text-primary)] focus:outline-none"
              />
            </div>
          ))}
        </div>

        <div className="border-t border-[var(--border)] px-4 py-3">
          <Button variant="outline" className="w-full" onClick={onClose}>
            關閉
          </Button>
        </div>
      </div>
    </div>
  );
}
