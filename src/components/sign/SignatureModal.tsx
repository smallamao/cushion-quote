"use client";

import { useState } from "react";

import { SignaturePad } from "@/components/sign/SignaturePad";

interface SignatureModalProps {
  onDone: (dataUrl: string) => void;
  onClose: () => void;
}

/** 全螢幕簽名框：大畫布 + 清除（在 pad 內）與底部「取消 / 完成」。 */
export function SignatureModal({ onDone, onClose }: SignatureModalProps) {
  const [data, setData] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-white">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <span className="text-sm font-medium text-gray-800">請在下方空白處簽名</span>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-400 hover:text-gray-700"
          aria-label="關閉"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-hidden p-3">
        <SignaturePad heightClass="h-[65vh]" onChange={setData} />
      </div>

      <div className="flex gap-3 border-t border-gray-200 p-3">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-lg border border-gray-300 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          取消
        </button>
        <button
          type="button"
          disabled={!data}
          onClick={() => data && onDone(data)}
          className="flex-1 rounded-lg bg-emerald-600 py-3 text-sm font-semibold text-white disabled:opacity-40"
        >
          完成
        </button>
      </div>
    </div>
  );
}
