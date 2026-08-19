"use client";

import { useMemo, useState } from "react";
import { Check, ClipboardCopy, Loader2, MessageSquarePlus } from "lucide-react";

/**
 * 訂單異動確認：在排程出貨選好卡片後，條列本次異動項目（一行一項），
 * 自動帶今天日期，產生給客戶的確認訊息（可複製），並可一鍵存成該 Trello 卡片的留言（即異動紀錄）。
 */
export function OrderChangeTool({ cardId }: { cardId: string }) {
  const [input, setInput] = useState("");
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");

  const items = useMemo(
    () =>
      input
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean),
    [input],
  );

  const message = useMemo(() => buildChangeMessage(items), [items]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 忽略：部分瀏覽器無剪貼簿權限 */
    }
  }

  async function saveComment() {
    if (!items.length || saving) return;
    setSaving(true);
    setSavedMsg("");
    try {
      const res = await fetch(
        `/api/trello/cards/${cardId}/actions/comments?text=${encodeURIComponent(message)}`,
        { method: "POST" },
      );
      if (!res.ok) throw new Error(`Trello 留言失敗 ${res.status}`);
      setSavedMsg("✓ 已存入卡片留言");
      setInput("");
      setTimeout(() => setSavedMsg(""), 3000);
    } catch (e) {
      setSavedMsg(e instanceof Error ? `⚠️ ${e.message}` : "⚠️ 存入失敗");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-[var(--text-secondary)]">訂單異動確認（存入卡片留言）</p>
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        rows={3}
        placeholder={"一行一項，例如：\n改面左加裝 USB\n總額 $68,200\n餘額 $58,200"}
        className="w-full resize-none rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
      />

      {items.length > 0 && (
        <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 font-sans text-xs leading-relaxed text-[var(--text-secondary)]">
          {message}
        </pre>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={() => void copy()}
          disabled={!items.length}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border)] py-2 text-sm font-medium text-[var(--text-secondary)] disabled:opacity-40"
        >
          {copied ? <Check className="h-4 w-4" /> : <ClipboardCopy className="h-4 w-4" />}
          {copied ? "已複製" : "複製訊息"}
        </button>
        <button
          onClick={() => void saveComment()}
          disabled={!items.length || saving}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--accent)] py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquarePlus className="h-4 w-4" />}
          存入卡片留言
        </button>
      </div>

      {savedMsg && <p className="text-xs text-[var(--text-tertiary)]">{savedMsg}</p>}
    </div>
  );
}

/** 產生客戶確認訊息：`M/D 這邊有幫您更改訂貨單內容：` + 編號項目 + 固定結尾。 */
function buildChangeMessage(items: string[]): string {
  const now = new Date();
  const md = `${now.getMonth() + 1}/${now.getDate()}`;
  const body = items.map((it, i) => `${i + 1}. ${it}`).join("\n");
  return `${md} 這邊有幫您更改訂貨單內容：\n\n${body}\n\n請協助確認內容，若有錯誤敬請告知！`;
}
