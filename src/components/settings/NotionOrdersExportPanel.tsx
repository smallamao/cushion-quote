"use client";

import { Download, FileDown, Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { NotionOrderRow } from "@/lib/notion-client";

// ── Types ─────────────────────────────────────────────────

interface ExportResponse {
  ok: boolean;
  error?: string;
  rowCount?: number;
  base64?: string;
  filename?: string;
  rows?: NotionOrderRow[];
}

// ── Helpers ───────────────────────────────────────────────

function prevMonth(): string {
  const now = new Date();
  const y = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const m = now.getMonth() === 0 ? 12 : now.getMonth();
  return `${y}-${String(m).padStart(2, "0")}`;
}

function monthToRange(month: string): { since: string; until: string } {
  const [y, m] = month.split("-").map(Number);
  const sinceYear = m === 1 ? y! - 1 : y!;
  const sinceMonth = m === 1 ? 12 : m! - 1;
  const since = `${sinceYear}-${String(sinceMonth).padStart(2, "0")}-26`;
  const until = `${y}-${String(m).padStart(2, "0")}-25`;
  return { since, until };
}

function fmtDate(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${Number(y) - 1911}/${m}/${d}`;
}

function fmtAmount(n: number | null): string {
  if (n == null) return "—";
  return n.toLocaleString();
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
      {/* 控制列 */}
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

      {result?.rows && result.rows.length > 0 && (
        <div className="space-y-2">
          {/* 摘要 + 重新下載 */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-[var(--text-secondary)]">
              共 <span className="font-medium text-[var(--text-primary)]">{result.rowCount}</span> 筆
            </span>
            {result.base64 && result.filename && (
              <button
                className="inline-flex items-center gap-1 text-xs text-[var(--primary)] underline-offset-2 hover:underline"
                onClick={() => downloadCsv(result.base64!, result.filename!)}
              >
                <Download className="h-3 w-3" />
                {result.filename}
              </button>
            )}
          </div>

          {/* 預覽表格 */}
          <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--border)]">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--surface-raised)]">
                  {["#", "Name", "下單日", "成本", "出貨日", "報價"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-medium text-[var(--text-secondary)]">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, i) => (
                  <tr
                    key={i}
                    className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-raised)]"
                  >
                    <td className="px-3 py-2 text-[var(--text-tertiary)]">{i + 1}</td>
                    <td className="px-3 py-2 font-medium text-[var(--text-primary)]">{row.name || "—"}</td>
                    <td className="px-3 py-2 text-[var(--text-secondary)]">{fmtDate(row.orderDate)}</td>
                    <td className="px-3 py-2 text-right text-[var(--text-secondary)]">{fmtAmount(row.cost)}</td>
                    <td className="px-3 py-2 text-[var(--text-secondary)]">{fmtDate(row.shippingDate)}</td>
                    <td className="px-3 py-2 text-right font-medium text-[var(--text-primary)]">{fmtAmount(row.quote)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-[var(--surface-raised)] font-medium">
                  <td colSpan={3} className="px-3 py-2 text-right text-[var(--text-secondary)]">合計</td>
                  <td className="px-3 py-2 text-right text-[var(--text-primary)]">
                    {result.rows.reduce((s, r) => s + (r.cost ?? 0), 0).toLocaleString()}
                  </td>
                  <td />
                  <td className="px-3 py-2 text-right text-[var(--text-primary)]">
                    {result.rows.reduce((s, r) => s + (r.quote ?? 0), 0).toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {result?.rowCount === 0 && (
        <p className="text-sm text-[var(--text-tertiary)]">此區間無資料</p>
      )}
    </div>
  );
}
