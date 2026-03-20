"use client";

import { History, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { QuoteVersionRecord, VersionStatus } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

const STATUS_MAP: Record<VersionStatus, { label: string; className: string }> = {
  draft: { label: "草稿", className: "badge-draft" },
  sent: { label: "已發送", className: "badge-sent" },
  following_up: { label: "追蹤中", className: "badge-sent" },
  negotiating: { label: "議價中", className: "badge-sent" },
  accepted: { label: "已接受", className: "badge-accepted" },
  rejected: { label: "已拒絕", className: "badge-rejected" },
  superseded: { label: "已取代", className: "badge-expired" },
};

export function ClientQuoteHistoryDialog({
  clientId,
  clientName,
}: {
  clientId: string;
  clientName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [jumpingVersionId, setJumpingVersionId] = useState("");
  const [error, setError] = useState("");
  const [versions, setVersions] = useState<QuoteVersionRecord[]>([]);

  const loadClientQuotes = useCallback(async () => {
    if (!clientId) {
      setVersions([]);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/sheets/versions?clientId=${encodeURIComponent(clientId)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("讀取客戶歷史失敗");
      const payload = (await response.json()) as { versions: QuoteVersionRecord[] };
      const sorted = payload.versions
        .filter((v) => v.versionStatus !== "superseded")
        .sort((a, b) => b.quoteDate.localeCompare(a.quoteDate));
      setVersions(sorted);
    } catch (err) {
      setError(err instanceof Error ? err.message : "讀取客戶歷史失敗");
      setVersions([]);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    if (!open) return;
    void loadClientQuotes();
  }, [loadClientQuotes, open]);

  const totalAmount = useMemo(
    () => versions.reduce((sum, v) => sum + v.totalAmount, 0),
    [versions],
  );

  function handleGoToVersion(version: QuoteVersionRecord) {
    setJumpingVersionId(version.versionId);
    sessionStorage.setItem("quote-to-load", JSON.stringify({
      caseId: version.caseId,
      quoteId: version.quoteId,
      versionId: version.versionId,
    }));
    router.push("/");
    setOpen(false);
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs"
        onClick={() => setOpen(true)}
      >
        <History className="h-3.5 w-3.5" />
        客戶歷史
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[80vh] max-w-4xl overflow-hidden p-0">
          <DialogHeader>
            <DialogTitle>{clientName} · 客戶歷史</DialogTitle>
            <DialogDescription>
              共 {versions.length} 筆報價，總額 {formatCurrency(totalAmount)}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[58vh] overflow-y-auto px-6 pb-6">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-[var(--text-secondary)]">
                <Loader2 className="h-4 w-4 animate-spin" />
                讀取客戶歷史中...
              </div>
            ) : error ? (
              <div className="rounded-[var(--radius-md)] border border-[var(--error)]/20 bg-[var(--error)]/5 px-4 py-3 text-sm text-[var(--error)]">
                {error}
              </div>
            ) : versions.length === 0 ? (
              <div className="py-12 text-center text-sm text-[var(--text-secondary)]">
                尚無客戶歷史報價
              </div>
            ) : (
              <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--border)]">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th className="px-4 py-2.5">版本</th>
                      <th className="px-4 py-2.5">日期</th>
                      <th className="px-4 py-2.5">案場名稱</th>
                      <th className="px-4 py-2.5">狀態</th>
                      <th className="px-4 py-2.5 text-right">含稅合計</th>
                    </tr>
                  </thead>
                  <tbody>
                    {versions.map((version) => {
                      const statusInfo = STATUS_MAP[version.versionStatus] ?? STATUS_MAP.draft;

                      return (
                        <tr key={version.versionId}>
                          <td className="px-4 py-2.5 font-mono text-xs">
                            <button
                              type="button"
                              onClick={() => handleGoToVersion(version)}
                              disabled={jumpingVersionId === version.versionId}
                              className="text-[var(--text-primary)] underline-offset-2 transition-colors hover:text-[var(--accent)] hover:underline disabled:opacity-50"
                            >
                              {jumpingVersionId === version.versionId ? "載入中..." : version.versionId}
                            </button>
                          </td>
                          <td className="px-4 py-2.5 text-sm">{version.quoteDate || "—"}</td>
                          <td className="px-4 py-2.5 text-sm">{version.projectNameSnapshot || "—"}</td>
                          <td className="px-4 py-2.5">
                            <span className={`badge ${statusInfo.className}`}>
                              {statusInfo.label}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right text-sm font-medium">
                            {formatCurrency(version.totalAmount)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
