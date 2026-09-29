"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Loader2, MapPin, Phone, Send } from "lucide-react";

import { Button } from "@/components/ui/button";

// 外部師傅派工連結：內勤複製後貼 LINE 給師傅，師傅手機打開免登入即可直撥電話／導航地址。
// 連結由後端簽章（HMAC 綁單號），任何狀態（含已排程）都能開，清潔與修復通用。
export function DispatchLinkSection({ serviceId }: { serviceId: string }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/sheets/after-sales/${serviceId}/dispatch-link`, { cache: "no-store" });
      const json = (await res.json()) as { ok: boolean; path?: string; error?: string };
      if (!json.ok || !json.path) throw new Error(json.error ?? "無法取得連結");
      setUrl(`${window.location.origin}${json.path}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "無法取得連結");
    } finally {
      setLoading(false);
    }
  }, [serviceId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
      <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">
        <Send className="h-4 w-4 text-[var(--accent)]" />
        派工連結（給外部師傅）
      </h3>
      <p className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-tertiary)]">
        <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />點就撥</span>
        <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />點就導航</span>
        <span>· 免登入 · 清潔／修復通用</span>
      </p>

      {loading ? (
        <div className="py-4 text-center text-xs text-[var(--text-tertiary)]">
          <Loader2 className="mx-auto h-4 w-4 animate-spin" />
        </div>
      ) : error ? (
        <div className="space-y-2">
          <p className="text-xs text-red-600">{error}</p>
          <Button size="sm" variant="outline" onClick={() => void load()}>重試</Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <div className="flex-1 truncate rounded-md border border-[var(--border)] bg-[var(--bg-subtle)] px-2.5 py-1.5 font-mono text-xs text-[var(--text-secondary)]">
            {url}
          </div>
          <Button
            size="sm"
            variant={copied ? "outline" : "default"}
            onClick={() => void copy()}
            className="shrink-0"
          >
            {copied ? <><Check className="mr-1 h-3.5 w-3.5" />已複製</> : <><Copy className="mr-1 h-3.5 w-3.5" />複製連結</>}
          </Button>
        </div>
      )}
    </div>
  );
}
