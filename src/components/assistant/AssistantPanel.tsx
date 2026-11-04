"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Loader2, Check, X, ShieldAlert } from "lucide-react";

import { useTouchDevice } from "@/hooks/useTouchDevice";
import { shouldSubmitOnEnter } from "@/lib/chat-input";

interface ChatTurn {
  role: "user" | "model";
  text: string;
}
interface PendingAction {
  type: "status_change";
  orderId: string;
  status: string;
  statusLabel: string;
}
interface Msg {
  role: "user" | "assistant";
  text: string;
  pending?: PendingAction;
}

const EXAMPLES = ["查 S941", "邱意晴的訂單", "這個月完成幾張", "把 S941 改完成"];

/** 輸入框最高約五行，再長就自己捲，不要把對話區擠掉 */
const MAX_INPUT_HEIGHT = 132;

export function AssistantPanel() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [history, setHistory] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  /** Safari 的 isComposing 不可靠，compositionstart/end 自己再記一份 */
  const composingRef = useRef(false);
  const touchDevice = useTouchDevice();

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // 輸入框跟著內容長高
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`;
  }, [input]);

  async function send(text: string) {
    const msg = text.trim();
    if (!msg || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: msg }]);
    setLoading(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, history }),
      });
      const data = await res.json();
      if (!data.ok) {
        setMessages((m) => [...m, { role: "assistant", text: `⚠️ ${data.error}` }]);
      } else {
        setMessages((m) => [...m, { role: "assistant", text: data.reply, pending: data.pendingAction }]);
        if (Array.isArray(data.history)) setHistory(data.history);
      }
    } catch {
      setMessages((m) => [...m, { role: "assistant", text: "⚠️ 連線失敗" }]);
    } finally {
      setLoading(false);
    }
  }

  async function confirmAction(idx: number, action: PendingAction) {
    if (confirming) return;
    setConfirming(true);
    try {
      const res = await fetch(`/api/sheets/orders/${encodeURIComponent(action.orderId)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: action.status }),
      });
      const data = await res.json().catch(() => ({}));
      const ok = res.ok && data.ok !== false;
      setMessages((m) => {
        const copy = m.map((x, i) => (i === idx ? { ...x, pending: undefined } : x));
        copy.push({
          role: "assistant",
          text: ok
            ? `✅ 已將 ${action.orderId} 改為「${action.statusLabel}」`
            : `⚠️ 改狀態失敗：${data.error ?? res.status}`,
        });
        return copy;
      });
    } catch {
      setMessages((m) => [...m, { role: "assistant", text: "⚠️ 改狀態連線失敗" }]);
    } finally {
      setConfirming(false);
    }
  }

  function cancelAction(idx: number) {
    setMessages((m) => {
      const copy = m.map((x, i) => (i === idx ? { ...x, pending: undefined } : x));
      copy.push({ role: "assistant", text: "已取消，未做任何更動。" });
      return copy;
    });
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--bg-elevated)]">
      {/* 隱私提示 */}
      <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--bg-subtle)] px-4 py-2 text-[11px] text-[var(--text-tertiary)]">
        <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
        使用 Anthropic Claude，對話內容（含查到的訂單資料）會傳給 Anthropic。請勿輸入不該外流的機密。
      </div>

      {/* 訊息區 */}
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="mt-6 text-center text-sm text-[var(--text-tertiary)]">
            <p className="mb-3">用自然語言查訂單、改狀態。試試：</p>
            <div className="flex flex-wrap justify-center gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => void send(ex)}
                  className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm ${
                m.role === "user"
                  ? "bg-[var(--accent)] text-white"
                  : "border border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-primary)]"
              }`}
            >
              {m.text}
              {m.pending && (
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => void confirmAction(i, m.pending!)}
                    disabled={confirming}
                    className="flex items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {confirming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    確認
                  </button>
                  <button
                    onClick={() => cancelAction(i)}
                    disabled={confirming}
                    className="flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" />
                    取消
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3.5 py-2 text-sm text-[var(--text-tertiary)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              思考中…
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* 輸入區 */}
      <div className="flex items-end gap-2 border-t border-[var(--border)] p-3">
        <textarea
          ref={inputRef}
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={(e) => {
            composingRef.current = false;
            setInput(e.currentTarget.value);
          }}
          onKeyDown={(e) => {
            const isComposing =
              e.nativeEvent.isComposing || e.keyCode === 229 || composingRef.current;
            if (!shouldSubmitOnEnter({ key: e.key, shiftKey: e.shiftKey, isComposing, touchDevice }))
              return;
            e.preventDefault();
            void send(input);
          }}
          placeholder={
            touchDevice ? "輸入指令，按右邊箭頭送出" : "輸入指令（Shift+Enter 換行）"
          }
          style={{ maxHeight: MAX_INPUT_HEIGHT }}
          className="flex-1 resize-none overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-sm leading-6 text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
        />
        <button
          onClick={() => void send(input)}
          disabled={loading || !input.trim()}
          aria-label="送出"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent)] text-white disabled:opacity-40 sm:h-9 sm:w-9"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
