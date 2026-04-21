"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

interface MatchChange {
  caseId: string;
  caseName: string;
  oldClientId: string;
  newClientId: string;
  matchedBy: "companyName" | "shortName" | "phone";
  companyName: string;
  clientNameSnapshot: string;
}

interface Unmatched {
  caseId: string;
  caseName: string;
  oldClientId: string;
  clientNameSnapshot: string;
  phoneSnapshot: string;
  reason: "no-snapshot" | "no-company-match" | "ambiguous";
  candidates?: Array<{ id: string; companyName: string; shortName: string }>;
}

interface Summary {
  totalCases: number;
  totalCompanies: number;
  toMigrate: number;
  unmatched: number;
  skipped: number;
}

interface PreviewResponse {
  ok: boolean;
  error?: string;
  summary?: Summary;
  changes?: MatchChange[];
  unmatched?: Unmatched[];
}

const REASON_LABEL: Record<Unmatched["reason"], string> = {
  "no-snapshot": "案件無客戶名稱快照",
  "no-company-match": "找不到同名公司",
  ambiguous: "多個同名公司,無法判斷",
};

const MATCH_BY_LABEL: Record<MatchChange["matchedBy"], string> = {
  companyName: "公司全名",
  shortName: "公司簡稱",
  phone: "電話比對",
};

export function CaseClientIdMigrationPanel() {
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [changes, setChanges] = useState<MatchChange[]>([]);
  const [unmatched, setUnmatched] = useState<Unmatched[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);

  async function runPreview() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/sheets/migrate-case-client-ids", {
        cache: "no-store",
      });
      const json = (await res.json()) as PreviewResponse;
      if (!json.ok) {
        setMessage(json.error ?? "預覽失敗");
        return;
      }
      setSummary(json.summary ?? null);
      setChanges(json.changes ?? []);
      setUnmatched(json.unmatched ?? []);
      // Default: select all proposed changes
      setSelected(new Set((json.changes ?? []).map((c) => c.caseId)));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "預覽失敗");
    } finally {
      setLoading(false);
    }
  }

  async function applySelected() {
    if (selected.size === 0) {
      setMessage("請勾選至少一筆要套用的變更");
      return;
    }
    if (!confirm(`確定要更新 ${selected.size} 筆案件的 clientId?`)) return;

    setApplying(true);
    setMessage(null);
    try {
      const payload = changes
        .filter((c) => selected.has(c.caseId))
        .map((c) => ({ caseId: c.caseId, newClientId: c.newClientId }));
      const res = await fetch("/api/sheets/migrate-case-client-ids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes: payload }),
      });
      const json = (await res.json()) as { ok: boolean; applied?: number; error?: string };
      if (!json.ok) {
        setMessage(json.error ?? "套用失敗");
        return;
      }
      setMessage(`✓ 已更新 ${json.applied ?? 0} 筆案件`);
      // Remove applied from the list
      const remaining = changes.filter((c) => !selected.has(c.caseId));
      setChanges(remaining);
      setSelected(new Set());
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "套用失敗");
    } finally {
      setApplying(false);
    }
  }

  function toggleAll() {
    if (selected.size === changes.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(changes.map((c) => c.caseId)));
    }
  }

  function toggleOne(caseId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(caseId)) next.delete(caseId);
      else next.add(caseId);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-[var(--border)] bg-[var(--bg-subtle)] p-4 text-sm">
        <h3 className="mb-2 font-semibold">案件客戶 ID 遷移</h3>
        <p className="mb-3 text-xs text-[var(--text-secondary)]">
          舊案件的 clientId 可能為空或是舊版 ID,導致客戶主檔的「報價歷史」顯示 0 筆。
          此工具會比對案件的客戶名稱快照與新客戶主檔,建議對應並更新。先預覽,確認後再套用。
        </p>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => void runPreview()} disabled={loading || applying}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {summary ? "重新預覽" : "預覽對應"}
          </Button>
          {changes.length > 0 && (
            <Button
              size="sm"
              variant="default"
              onClick={() => void applySelected()}
              disabled={applying || selected.size === 0}
            >
              {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              套用已勾選 ({selected.size})
            </Button>
          )}
        </div>
      </div>

      {message && (
        <div className="rounded-md bg-[var(--bg-subtle)] px-3 py-2 text-sm">
          {message}
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-2 gap-2 rounded-md border border-[var(--border)] bg-white p-3 text-xs sm:grid-cols-4">
          <div>
            <div className="text-[var(--text-tertiary)]">總案件數</div>
            <div className="font-mono text-lg">{summary.totalCases}</div>
          </div>
          <div>
            <div className="text-[var(--text-tertiary)]">已正確</div>
            <div className="font-mono text-lg text-green-600">{summary.skipped}</div>
          </div>
          <div>
            <div className="text-[var(--text-tertiary)]">可遷移</div>
            <div className="font-mono text-lg text-blue-600">{summary.toMigrate}</div>
          </div>
          <div>
            <div className="text-[var(--text-tertiary)]">無法對應</div>
            <div className="font-mono text-lg text-amber-600">{summary.unmatched}</div>
          </div>
        </div>
      )}

      {changes.length > 0 && (
        <div className="overflow-hidden rounded-md border border-[var(--border)]">
          <div className="bg-[var(--bg-subtle)] px-3 py-2 text-xs font-medium">
            建議遷移 ({changes.length})
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[var(--bg-subtle)]">
                <tr>
                  <th className="w-10 px-2 py-2 text-center">
                    <Checkbox
                      checked={selected.size === changes.length}
                      onCheckedChange={() => toggleAll()}
                    />
                  </th>
                  <th className="px-2 py-2 text-left">案件</th>
                  <th className="px-2 py-2 text-left">客戶快照</th>
                  <th className="px-2 py-2 text-left">→ 對應公司</th>
                  <th className="px-2 py-2 text-left">依據</th>
                  <th className="px-2 py-2 text-left">舊 ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {changes.map((c) => (
                  <tr key={c.caseId} className="hover:bg-[var(--bg-subtle)]">
                    <td className="px-2 py-1.5 text-center">
                      <Checkbox
                        checked={selected.has(c.caseId)}
                        onCheckedChange={() => toggleOne(c.caseId)}
                      />
                    </td>
                    <td className="px-2 py-1.5 font-mono">
                      <div>{c.caseId}</div>
                      <div className="text-[var(--text-tertiary)]">{c.caseName}</div>
                    </td>
                    <td className="px-2 py-1.5">{c.clientNameSnapshot || "—"}</td>
                    <td className="px-2 py-1.5">
                      <div>{c.companyName}</div>
                      <div className="font-mono text-[var(--text-tertiary)]">{c.newClientId}</div>
                    </td>
                    <td className="px-2 py-1.5">{MATCH_BY_LABEL[c.matchedBy]}</td>
                    <td className="px-2 py-1.5 font-mono text-[var(--text-tertiary)]">
                      {c.oldClientId || "(空)"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {unmatched.length > 0 && (
        <div className="overflow-hidden rounded-md border border-amber-200">
          <div className="bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
            無法自動對應 ({unmatched.length}) — 需手動到案件編輯頁修正
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-amber-50">
                <tr>
                  <th className="px-2 py-2 text-left">案件</th>
                  <th className="px-2 py-2 text-left">客戶快照</th>
                  <th className="px-2 py-2 text-left">電話</th>
                  <th className="px-2 py-2 text-left">原因</th>
                  <th className="px-2 py-2 text-left">候選</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {unmatched.map((u) => (
                  <tr key={u.caseId}>
                    <td className="px-2 py-1.5 font-mono">
                      <div>{u.caseId}</div>
                      <div className="text-[var(--text-tertiary)]">{u.caseName}</div>
                    </td>
                    <td className="px-2 py-1.5">{u.clientNameSnapshot || "—"}</td>
                    <td className="px-2 py-1.5">{u.phoneSnapshot || "—"}</td>
                    <td className="px-2 py-1.5">{REASON_LABEL[u.reason]}</td>
                    <td className="px-2 py-1.5">
                      {u.candidates && u.candidates.length > 0
                        ? u.candidates.map((c) => c.companyName).join(", ")
                        : "—"}
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
