"use client";

import { useState } from "react";
import { Bot, X } from "lucide-react";

import { AssistantPanel } from "@/components/assistant/AssistantPanel";

/**
 * 全站右下角浮窗 AI 助手：常駐圓鈕，點開就是對話面板；掛在 root layout，跨頁不消失。
 * 比照戰情室 / 釘選浮窗的做法（FloatingImageViewer）。
 */
export function FloatingAssistant() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {open && (
        <div className="fixed bottom-20 right-4 z-[70] flex h-[70vh] max-h-[600px] w-[min(92vw,380px)] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-elevated)] shadow-2xl">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-[var(--text-primary)]">
              <Bot className="h-4 w-4" /> AI 助手
            </span>
            <button
              onClick={() => setOpen(false)}
              className="rounded p-1 text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
              aria-label="關閉"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <AssistantPanel />
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-4 right-4 z-[70] flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-lg transition hover:opacity-90"
        title="AI 助手"
        aria-label="AI 助手"
      >
        {open ? <X className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
      </button>
    </>
  );
}
