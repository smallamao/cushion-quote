"use client";

import { Download, Loader2, RefreshCw, Save } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

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

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-[var(--border)] bg-[var(--bg-subtle)] p-4 text-sm">
        <h3 className="mb-2 font-semibold">Google Sheet 定時備份</h3>
        <p className="mb-3 text-xs text-[var(--text-secondary)]">
          每日凌晨自動把所有工作表備份為 JSON,儲存到 Google Drive 的
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
