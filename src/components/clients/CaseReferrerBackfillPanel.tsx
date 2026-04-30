"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

interface BackfillResult {
  caseId: string;
  contactName: string;
  status: "updated" | "skipped" | "failed";
  matchedCompanyId?: string;
  matchedCompanyName?: string;
  reason?: string;
}

interface Summary {
  scanned: number;
  eligible: number;
  updated: number;
  skipped: number;
  failed: number;
}

export function CaseReferrerBackfillPanel() {
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [results, setResults] = useState<BackfillResult[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    if (!confirm("此工具會掃描所有「介紹來源」案件,嘗試把『來源人/介紹人』姓名對應到公司,並寫入「介紹公司」。確定執行?")) {
      return;
    }
    setRunning(true);
    setMessage(null);
    try {
      const res = await fetch("/api/sheets/cases/backfill-referrer", {
        method: "POST",
      });
      const json = (await res.json()) as {
        ok: boolean;
        error?: string;
        summary?: Summary;
        results?: BackfillResult[];
      };
      if (!json.ok) {
        setMessage(json.error ?? "執行失敗");
        return;
      }
      setSummary(json.summary ?? null);
      setResults(json.results ?? []);
      setMessage(`✓ 完成,已更新 ${json.summary?.updated ?? 0} 筆`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "執行失敗");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-[var(--border)] bg-[var(--bg-subtle)] p-4 text-sm">
        <h3 className="mb-2 font-semibold">案件介紹公司 Backfill</h3>
        <p className="mb-3 text-xs text-[var(--text-secondary)]">
          舊案件的「介紹人」是純文字姓名。此工具會比對聯絡人 sheet 找出對應公司,
          自動填入「介紹公司ID」。同名聯絡人有多筆時會跳過,需手動處理。
        </p>
        <Button size="sm" onClick={() => void run()} disabled={running}>
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          執行 Backfill
        </Button>
      </div>

      {message && (
        <div className="rounded-md bg-[var(--bg-subtle)] px-3 py-2 text-sm">{message}</div>
      )}

      {summary && (
        <div className="grid grid-cols-2 gap-2 rounded-md border border-[var(--border)] bg-white p-3 text-xs sm:grid-cols-5">
          <div>
            <div className="text-[var(--text-tertiary)]">總案件</div>
            <div className="font-mono text-lg">{summary.scanned}</div>
          </div>
          <div>
            <div className="text-[var(--text-tertiary)]">符合條件</div>
            <div className="font-mono text-lg">{summary.eligible}</div>
          </div>
          <div>
            <div className="text-[var(--text-tertiary)]">已更新</div>
            <div className="font-mono text-lg text-green-600">{summary.updated}</div>
          </div>
          <div>
            <div className="text-[var(--text-tertiary)]">跳過</div>
            <div className="font-mono text-lg text-amber-600">{summary.skipped}</div>
          </div>
          <div>
            <div className="text-[var(--text-tertiary)]">失敗</div>
            <div className="font-mono text-lg text-red-600">{summary.failed}</div>
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div className="overflow-hidden rounded-md border border-[var(--border)]">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[var(--bg-subtle)]">
                <tr>
                  <th className="px-2 py-2 text-left">案件</th>
                  <th className="px-2 py-2 text-left">介紹人</th>
                  <th className="px-2 py-2 text-left">→ 對應公司</th>
                  <th className="px-2 py-2 text-left">狀態</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {results.map((r) => (
                  <tr key={r.caseId}>
                    <td className="px-2 py-1.5 font-mono">{r.caseId}</td>
                    <td className="px-2 py-1.5">{r.contactName}</td>
                    <td className="px-2 py-1.5">
                      {r.matchedCompanyName ? (
                        <div>
                          <div>{r.matchedCompanyName}</div>
                          <div className="font-mono text-[10px] text-[var(--text-tertiary)]">
                            {r.matchedCompanyId}
                          </div>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      {r.status === "updated" ? (
                        <span className="text-green-600">✓ 已更新</span>
                      ) : r.status === "failed" ? (
                        <span className="text-red-600">✗ {r.reason}</span>
                      ) : (
                        <span className="text-amber-600">— {r.reason}</span>
                      )}
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
