"use client";

import { Download, FileDown, Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

// ── Types ─────────────────────────────────────────────────

interface ExportResponse {
  ok: boolean;
  error?: string;
  rowCount?: number;
  base64?: string;
  filename?: string;
}

// ── Helpers ───────────────────────────────────────────────

function prevMonth(): string {
  const now = new Date();
  const y = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const m = now.getMonth() === 0 ? 12 : now.getMonth();
  return `${y}-${String(m).padStart(2, "0")}`;
}

// 跨月結算週期：選「N月」= 上月26日 ~ N月25日（含頭尾）
function monthToRange(month: string): { since: string; until: string } {
  const [y, m] = month.split("-").map(Number);
  const sinceYear = m === 1 ? y! - 1 : y!;
  const sinceMonth = m === 1 ? 12 : m! - 1;
  const since = `${sinceYear}-${String(sinceMonth).padStart(2, "0")}-26`;
  const until = `${y}-${String(m).padStart(2, "0")}-25`;
  return { since, until };
}

function downloadCsv(base64: string, filename: string) {
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  const blob = new Blob([arr], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Component ─────────────────────────────────────────────

export function NotionOrdersExportPanel() {
  const [month, setMonth] = useState<string>(prevMonth);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExportResponse | null>(null);

  async function handleExport() {
    setLoading(true);
    setError(null);
    setResult(null);

    const { since, until } = monthToRange(month);
    try {
      const res = await fetch("/api/notion/export-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ since, until }),
      });
      const data = (await res.json()) as ExportResponse;
      if (!data.ok) {
        setError(data.error ?? "匯出失敗");
      } else {
        setResult(data);
        if (data.base64 && data.filename) downloadCsv(data.base64, data.filename);
      }
    } catch {
      setError("網路錯誤，請稍後再試");
    } finally {
      setLoading(false);
    }
  }

  const [y, m] = month.split("-");
  const displayMonth = `${y}年${Number(m)}月`;
  const { since, until } = monthToRange(month);
  const sinceLabel = since.replace(/(\d{4})-(\d{2})-(\d{2})/, "$2/$3");
  const untilLabel = until.replace(/(\d{4})-(\d{2})-(\d{2})/, "$2/$3");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Label className="shrink-0 text-sm">匯出月份</Label>
        <input
          type="month"
          value={month}
          onChange={(e) => {
            setMonth(e.target.value);
            setResult(null);
            setError(null);
          }}
          className="h-9 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
        />
        <span className="text-xs text-[var(--text-tertiary)]">
          結算區間：{sinceLabel} ~ {untilLabel}
        </span>
        <Button onClick={handleExport} disabled={loading} size="sm" className="ml-auto">
          {loading
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <FileDown className="h-3.5 w-3.5" />
          }
          {loading ? "匯出中..." : `匯出 ${displayMonth}`}
        </Button>
      </div>

      {error && <p className="text-sm text-[var(--error)]">{error}</p>}

      {result?.rowCount != null && !error && (
        <p className="text-sm text-[var(--text-secondary)]">
          共 <span className="font-medium text-[var(--text-primary)]">{result.rowCount}</span> 筆
          {result.base64 && result.filename && (
            <button
              className="ml-2 inline-flex items-center gap-1 text-[var(--primary)] underline-offset-2 hover:underline"
              onClick={() => downloadCsv(result.base64!, result.filename!)}
            >
              <Download className="h-3 w-3" />
              {result.filename}
            </button>
          )}
        </p>
      )}
    </div>
  );
}
