"use client";

import { CheckCircle2, Clock, Download, Loader2, RefreshCw, Save, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";

interface BackupFile {
  id: string;
  name: string;
  createdTime: string;
  sizeBytes: number;
  webViewLink: string;
}

function fmtBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("zh-TW", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return iso;
  }
}

function fmtRelative(iso: string): string {
  try {
    const then = new Date(iso).getTime();
    const now = Date.now();
    const diffMs = now - then;
    const diffSec = Math.max(0, Math.floor(diffMs / 1000));
    if (diffSec < 60) return "剛剛";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} 分鐘前`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr} 小時前`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 30) return `${diffDay} 天前`;
    return `${Math.floor(diffDay / 30)} 個月前`;
  } catch {
    return "";
  }
}

// Vercel Cron: "0 18 * * *" UTC = 02:00 Asia/Taipei next day
function nextScheduledBackup(): Date {
  const now = new Date();
  // Compute the next 18:00 UTC from now.
  const next = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      18,
      0,
      0,
      0,
    ),
  );
  if (next.getTime() <= now.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next;
}

export function BackupPanel() {
  const [files, setFiles] = useState<BackupFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [folderMissing, setFolderMissing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/backup/list", { cache: "no-store" });
      const json = (await res.json()) as {
        ok: boolean;
        files?: BackupFile[];
        folderExists?: boolean;
        error?: string;
      };
      if (!json.ok) {
        setMessage(json.error ?? "載入失敗");
        return;
      }
      setFolderMissing(json.folderExists === false);
      setFiles(json.files ?? []);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function runBackup() {
    if (
      !confirm(
        "即將把所有 Google Sheet 內容備份成 JSON 上傳到 Drive 的「營運系統-備份」資料夾。繼續嗎?",
      )
    ) {
      return;
    }
    setRunning(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/backup", { method: "POST" });
      const json = (await res.json()) as {
        ok: boolean;
        fileName?: string;
        sizeBytes?: number;
        sheetCount?: number;
        pruned?: number;
        error?: string;
      };
      if (!json.ok) {
        setMessage(`備份失敗: ${json.error ?? "unknown"}`);
        return;
      }
      setMessage(
        `✓ 已備份 ${json.sheetCount ?? 0} 個工作表 · ${json.fileName ?? ""} (${fmtBytes(json.sizeBytes ?? 0)})${json.pruned ? ` · 清除 ${json.pruned} 份舊檔` : ""}`,
      );
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "備份失敗");
    } finally {
      setRunning(false);
    }
  }

  const latest = files[0];
  const hoursSinceLatest = latest
    ? (Date.now() - new Date(latest.createdTime).getTime()) / (1000 * 60 * 60)
    : Infinity;
  // Alert if no backup in the last 48 hours (allows for missed cron + user forgetting).
  const overdue = !latest || hoursSinceLatest > 48;
  const statusColor = overdue
    ? "border-amber-300 bg-amber-50 text-amber-900"
    : "border-green-300 bg-green-50 text-green-900";
  const nextBackup = useMemo(() => nextScheduledBackup(), [files]);

  return (
    <div className="space-y-4">
      <div className={`flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3 text-sm ${statusColor}`}>
        <div className="flex items-center gap-2">
          {overdue ? (
            <TriangleAlert className="h-4 w-4 shrink-0" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          )}
          <div>
            <div className="font-semibold">
              {latest
                ? `最後備份: ${fmtDate(latest.createdTime)} (${fmtRelative(latest.createdTime)})`
                : "尚未有任何備份"}
            </div>
            <div className="text-xs opacity-80">
              <Clock className="mr-1 inline h-3 w-3" />
              下次自動備份: {fmtDate(nextBackup.toISOString())} (
              {fmtRelative(nextBackup.toISOString()).replace("前", "後")})
            </div>
          </div>
        </div>
        {latest && !overdue && (
          <span className="rounded-full bg-white/50 px-2 py-0.5 text-xs">
            {fmtBytes(latest.sizeBytes)}
          </span>
        )}
        {overdue && latest && (
          <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-medium">
            {Math.floor(hoursSinceLatest / 24)} 天未備份
          </span>
        )}
      </div>

      <div className="rounded-md border border-[var(--border)] bg-[var(--bg-subtle)] p-4 text-sm">
        <h3 className="mb-2 font-semibold">Google Sheet 定時備份</h3>
        <p className="mb-3 text-xs text-[var(--text-secondary)]">
          每日台北時間凌晨 02:00 自動把所有工作表備份為 JSON,儲存到 Google Drive 的
          「<strong>營運系統-備份</strong>」資料夾,保留最近 30 份。你也可以隨時手動
          執行一次。若資料被誤改,可從此處找到對應日期的備份檔還原。
        </p>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => void runBackup()} disabled={running}>
            {running ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            立即備份
          </Button>
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            重新整理
          </Button>
        </div>
      </div>

      {message && (
        <div className="rounded-md bg-[var(--bg-subtle)] px-3 py-2 text-sm">
          {message}
        </div>
      )}

      {folderMissing && !loading && (
        <p className="text-xs text-[var(--text-tertiary)]">
          備份資料夾尚未建立。第一次按「立即備份」時會自動建立。
        </p>
      )}

      {files.length > 0 && (
        <div className="overflow-hidden rounded-md border border-[var(--border)]">
          <div className="bg-[var(--bg-subtle)] px-3 py-2 text-xs font-medium">
            歷史備份 ({files.length})
          </div>
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-[var(--bg-subtle)]">
                <tr>
                  <th className="px-3 py-2 text-left">建立時間</th>
                  <th className="px-3 py-2 text-left">檔名</th>
                  <th className="px-3 py-2 text-right">大小</th>
                  <th className="w-20 px-3 py-2 text-center">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {files.map((f) => (
                  <tr key={f.id} className="hover:bg-[var(--bg-subtle)]">
                    <td className="px-3 py-1.5 font-mono text-[var(--text-secondary)]">
                      {fmtDate(f.createdTime)}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-[11px]">{f.name}</td>
                    <td className="px-3 py-1.5 text-right font-mono">
                      {fmtBytes(f.sizeBytes)}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <a
                        href={f.webViewLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline"
                      >
                        <Download className="h-3 w-3" />
                        開啟
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
