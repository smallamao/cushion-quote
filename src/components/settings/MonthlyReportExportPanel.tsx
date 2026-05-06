"use client";

import { Download, FileDown, FileSpreadsheet, Loader2 } from "lucide-react";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { PivotChartPoint, SourceChartPoint } from "@/lib/trello-exporter";

// ── Types ─────────────────────────────────────────────────

interface CsvFile {
  filename: string;
  base64: string;
}

interface ExcelFile {
  base64: string;
  filename: string;
}

interface ExportResponse {
  ok: boolean;
  error?: string;
  cardCount?: number;
  pivotData?: PivotChartPoint[];
  sourceData?: SourceChartPoint[];
  csvFiles?: CsvFile[];
  excel?: ExcelFile;
}

// ── Constants ─────────────────────────────────────────────

const COLORS = [
  "#2563eb", "#16a34a", "#f59e0b", "#dc2626",
  "#7c3aed", "#0891b2", "#db2777", "#65a30d",
  "#ea580c", "#0284c7", "#9333ea", "#d97706",
];

// ── Helpers ───────────────────────────────────────────────

function downloadBlob(base64: string, filename: string, mime: string) {
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  const blob = new Blob([arr], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadExcel(excel: ExcelFile) {
  downloadBlob(
    excel.base64,
    excel.filename,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
}

function downloadCsvFile(csv: CsvFile) {
  downloadBlob(csv.base64, csv.filename, "text/csv;charset=utf-8;");
}

function downloadAllCsvs(csvFiles: CsvFile[]) {
  csvFiles.forEach((csv, i) => {
    setTimeout(() => downloadCsvFile(csv), i * 150);
  });
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

function prevMonth(): string {
  const now = new Date();
  const y = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const m = now.getMonth() === 0 ? 12 : now.getMonth();
  return `${y}-${String(m).padStart(2, "0")}`;
}

// ── Sub-components ────────────────────────────────────────

function PivotBarChart({ data }: { data: PivotChartPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={210}>
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 28, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey="productCode"
          tick={{ fontSize: 11, fill: "var(--text-secondary)" }}
          angle={-35}
          textAnchor="end"
          interval={0}
        />
        <YAxis tick={{ fontSize: 11, fill: "var(--text-secondary)" }} allowDecimals={false} />
        <Tooltip formatter={(v: number) => [`${v} 組`, "組數"]} />
        <Bar dataKey="count" radius={[3, 3, 0, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function SourceDonutChart({ data }: { data: SourceChartPoint[] }) {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-xs text-[var(--text-tertiary)]">
        無「分析/XXX」標籤資料
      </p>
    );
  }
  const total = data.reduce((s, d) => s + d.count, 0);
  return (
    <div className="flex items-center gap-3">
      <ResponsiveContainer width={180} height={180}>
        <PieChart>
          <Pie
            data={data}
            dataKey="count"
            nameKey="channel"
            cx="50%"
            cy="50%"
            innerRadius={48}
            outerRadius={82}
            paddingAngle={2}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(v: number, name: string) => [
              `${v} 組 (${((v / total) * 100).toFixed(1)}%)`,
              name,
            ]}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-col gap-1.5 overflow-hidden">
        {data.map((d, i) => (
          <div key={d.channel} className="flex items-center gap-1.5 text-xs">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ background: COLORS[i % COLORS.length] }}
            />
            <span className="truncate text-[var(--text-secondary)]">{d.channel}</span>
            <span className="ml-auto shrink-0 font-medium text-[var(--text-primary)]">
              {d.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────

export function MonthlyReportExportPanel() {
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
      const res = await fetch("/api/trello/export-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ since, until }),
      });
      const data = (await res.json()) as ExportResponse;
      if (!data.ok) {
        setError(data.error ?? "匯出失敗");
      } else {
        setResult(data);
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
  const sinceLabel = since.replace(/-(\d)-/, "-0$1-").replace(/(\d{4})-(\d{2})-(\d{2})/, "$2/$3");
  const untilLabel = until.replace(/-(\d)-/, "-0$1-").replace(/(\d{4})-(\d{2})-(\d{2})/, "$2/$3");

  return (
    <div className="space-y-6">
      {/* 控制列：一排 */}
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

      {result && (
        <div className="space-y-5">
          {/* 摘要 */}
          <p className="text-sm text-[var(--text-secondary)]">
            共{" "}
            <span className="font-medium text-[var(--text-primary)]">{result.cardCount}</span>{" "}
            張卡片
          </p>

          {/* 下載區 */}
          <div className="flex flex-wrap gap-3">
            {/* CSV 下載 */}
            {result.csvFiles && result.csvFiles.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-[var(--text-secondary)]">CSV（可個別下載）</p>
                <div className="flex flex-wrap gap-2">
                  {result.csvFiles.map((csv) => (
                    <Button
                      key={csv.filename}
                      size="sm"
                      variant="outline"
                      onClick={() => downloadCsvFile(csv)}
                    >
                      <Download className="h-3.5 w-3.5" />
                      {csv.filename}
                    </Button>
                  ))}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => downloadAllCsvs(result.csvFiles!)}
                  >
                    <Download className="h-3.5 w-3.5" />
                    下載全部 CSV
                  </Button>
                </div>
              </div>
            )}

            {/* Excel 下載 */}
            {result.excel && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-[var(--text-secondary)]">Excel（含圖表）</p>
                <Button size="sm" onClick={() => downloadExcel(result.excel!)}>
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  {result.excel.filename}
                </Button>
              </div>
            )}
          </div>

          {/* 圖表 */}
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="card-surface rounded-[var(--radius-lg)] px-5 py-4">
              <p className="mb-3 text-sm font-medium">出貨樞紐 — 組數分布</p>
              {result.pivotData && result.pivotData.length > 0
                ? <PivotBarChart data={result.pivotData} />
                : <p className="py-8 text-center text-xs text-[var(--text-tertiary)]">此月份無資料</p>
              }
            </div>
            <div className="card-surface rounded-[var(--radius-lg)] px-5 py-4">
              <p className="mb-3 text-sm font-medium">來客管道分析</p>
              <SourceDonutChart data={result.sourceData ?? []} />
            </div>
          </div>

          <p className="text-xs text-[var(--text-tertiary)]">
            Excel 包含 3 個工作表：出貨明細 · 樞紐分析 · 來客分析
          </p>
        </div>
      )}
    </div>
  );
}
