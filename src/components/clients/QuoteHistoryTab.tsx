"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface VersionRecord {
  versionId: string;
  quoteDate: string;
  projectNameSnapshot: string;
  versionStatus: string;
  totalAmount: number;
}

const STATUS_LABELS: Record<string, string> = {
  draft: "草稿",
  sent: "已送出",
  following_up: "追蹤中",
  negotiating: "議價中",
  accepted: "已接受",
  rejected: "已拒絕",
  superseded: "已取代",
};

interface QuoteHistoryTabProps {
  companyId: string;
  companyName: string;
}

export function QuoteHistoryTab({
  companyId,
  companyName: _companyName,
}: QuoteHistoryTabProps) {
  const router = useRouter();
  const [versions, setVersions] = useState<VersionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/sheets/versions?clientId=${encodeURIComponent(companyId)}`)
      .then((r) => r.json())
      .then((data: { versions: VersionRecord[] }) => {
        if (cancelled) return;
        const filtered = (data.versions ?? [])
          .filter((v) => v.versionStatus !== "superseded")
          .sort(
            (a, b) =>
              new Date(b.quoteDate).getTime() - new Date(a.quoteDate).getTime(),
          );
        setVersions(filtered);
      })
      .catch(() => {
        if (!cancelled) setVersions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const total = versions.reduce((sum, v) => sum + (v.totalAmount ?? 0), 0);

  function handleLoadVersion(versionId: string) {
    sessionStorage.setItem(
      "quoteLoadRequest",
      JSON.stringify({ type: "load-version", versionId, source: "client-history" }),
    );
    router.push("/");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-[var(--text-secondary)]">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header stats */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-[var(--text-secondary)]">
          共 <span className="font-medium text-[var(--text-primary)]">{versions.length}</span> 筆報價
        </span>
        <span className="text-[var(--text-secondary)]">
          累計{" "}
          <span className="font-mono font-medium text-[var(--text-primary)]">
            ${total.toLocaleString()}
          </span>
        </span>
      </div>

      {versions.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--text-secondary)]">
          尚無報價紀錄
        </p>
      ) : (
        <div className="data-table overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left">版本編號</th>
                <th className="text-left">日期</th>
                <th className="text-left">專案名稱</th>
                <th className="text-left">狀態</th>
                <th className="text-right">金額</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.versionId}>
                  <td>
                    <button
                      className="font-mono text-[var(--accent)] hover:underline"
                      onClick={() => handleLoadVersion(v.versionId)}
                    >
                      {v.versionId}
                    </button>
                  </td>
                  <td className="text-[var(--text-secondary)]">
                    {v.quoteDate}
                  </td>
                  <td>{v.projectNameSnapshot}</td>
                  <td>
                    <span className="rounded-full bg-[var(--bg-secondary)] px-2 py-0.5 text-xs">
                      {STATUS_LABELS[v.versionStatus] ?? v.versionStatus}
                    </span>
                  </td>
                  <td className="text-right font-mono">
                    ${(v.totalAmount ?? 0).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
