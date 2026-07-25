"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { QuoteNoteTemplate } from "@/lib/quote-note-templates";

// 報價「補充說明」底稿的自助管理：存於 Google Sheets 報價補充底稿 分頁，
// 報價編輯器的「帶入底稿」按鈕即時讀取。
export function QuoteNoteTemplatesPanel() {
  const [templates, setTemplates] = useState<QuoteNoteTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/sheets/quote-note-templates", { cache: "no-store" })
      .then((res) => res.json())
      .then((json: { ok: boolean; templates?: QuoteNoteTemplate[] }) => {
        if (json.ok && json.templates) setTemplates(json.templates);
      })
      .catch(() => setNotice({ ok: false, text: "載入失敗，請重新整理" }))
      .finally(() => setLoading(false));
  }, []);

  function updateTemplate(idx: number, patch: Partial<QuoteNoteTemplate>) {
    setTemplates((prev) => prev.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  }

  async function handleSave() {
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch("/api/sheets/quote-note-templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templates }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) throw new Error(json.error ?? "儲存失敗");
      setNotice({ ok: true, text: "已儲存，報價編輯器立即生效" });
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : "儲存失敗" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-[var(--text-secondary)]">
        <Loader2 className="h-4 w-4 animate-spin" /> 載入中…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-[var(--text-tertiary)]">
        報價編輯器「補充說明」上方的「帶入底稿」按鈕來源。每組一顆按鈕，內容一行一句；帶入後仍可在報價中自由刪改。
      </p>

      {templates.map((t, idx) => (
        <div key={idx} className="rounded-lg border border-[var(--border)] p-3">
          <div className="flex items-center gap-2">
            <Input
              value={t.name}
              onChange={(e) => updateTemplate(idx, { name: e.target.value })}
              placeholder="底稿名稱（按鈕文字）"
              className="h-8 w-40"
            />
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-8 w-8 p-0 text-red-500"
              title="刪除此底稿"
              onClick={() => setTemplates((prev) => prev.filter((_, i) => i !== idx))}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <Textarea
            value={t.lines.join("\n")}
            onChange={(e) => updateTemplate(idx, { lines: e.target.value.split("\n") })}
            placeholder={"一行一句，例如：\n外布套車拉鍊\n泡綿包內裏布套(無拉鍊)"}
            rows={Math.max(3, t.lines.length + 1)}
            className="mt-2 font-mono text-xs"
          />
        </div>
      ))}

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setTemplates((prev) => [...prev, { name: "", lines: [] }])}
        >
          <Plus className="mr-1 h-4 w-4" /> 新增底稿
        </Button>
        <Button size="sm" onClick={() => void handleSave()} disabled={saving} className="ml-auto">
          {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
          儲存
        </Button>
      </div>

      {notice && (
        <p className={`text-xs ${notice.ok ? "text-green-600" : "text-red-600"}`}>{notice.text}</p>
      )}
    </div>
  );
}
