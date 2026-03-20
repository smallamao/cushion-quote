"use client";

import { Copy, Edit, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { QuoteVersionRecord, VersionStatus } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type VersionRow = QuoteVersionRecord & { lines?: unknown[] };

const VERSION_STATUS_MAP: Record<QuoteVersionRecord["versionStatus"], { label: string; className: string }> = {
  draft: { label: "草稿", className: "badge-draft" },
  sent: { label: "已發送", className: "badge-sent" },
  following_up: { label: "追蹤中", className: "badge-sent" },
  negotiating: { label: "議價中", className: "badge-sent" },
  accepted: { label: "已接受", className: "badge-accepted" },
  rejected: { label: "已拒絕", className: "badge-rejected" },
  superseded: { label: "已取代", className: "badge-expired" },
};

const STATUS_FILTER_OPTIONS: Array<{ value: VersionStatus | "all"; label: string }> = [
  { value: "all", label: "全部" },
  { value: "draft", label: "草稿" },
  { value: "sent", label: "已發送" },
  { value: "following_up", label: "追蹤中" },
  { value: "negotiating", label: "議價中" },
  { value: "accepted", label: "已接受" },
  { value: "rejected", label: "已拒絕" },
];

const STATUS_CHANGE_OPTIONS: VersionStatus[] = [
  "draft",
  "sent",
  "following_up",
  "negotiating",
  "accepted",
  "rejected",
];

function compareDateTextDesc(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return b.localeCompare(a);
}

export function QuotesClient() {
  const router = useRouter();
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [filterStatus, setFilterStatus] = useState<VersionStatus | "all">("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [showSuperseded, setShowSuperseded] = useState(false);
  const [busyVersionId, setBusyVersionId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/sheets/versions", { cache: "no-store" });
      if (!response.ok) throw new Error("load");
      const payload = (await response.json()) as { versions: VersionRow[] };
      setVersions(payload.versions);
    } catch {
      setVersions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openVersion(versionId: string, caseId: string, quoteId: string) {
    sessionStorage.setItem("quote-to-load", JSON.stringify({ caseId, quoteId, versionId }));
    router.push("/");
  }

  async function patchVersionStatus(versionId: string, versionStatus: VersionStatus): Promise<void> {
    const payload = { versionId, versionStatus };
    const directResponse = await fetch(`/api/sheets/versions/${encodeURIComponent(versionId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (directResponse.ok) return;

    const fallbackResponse = await fetch("/api/sheets/versions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!fallbackResponse.ok) throw new Error("更新狀態失敗");
  }

  async function handleStatusChange(versionId: string, versionStatus: VersionStatus) {
    const prev = versions;
    setBusyVersionId(versionId);
    setVersions((current) =>
      current.map((item) =>
        item.versionId === versionId ? { ...item, versionStatus } : item,
      ),
    );
    try {
      await patchVersionStatus(versionId, versionStatus);
    } catch (err) {
      setVersions(prev);
      alert(err instanceof Error ? err.message : "更新狀態失敗");
    } finally {
      setBusyVersionId("");
    }
  }

  async function handleDuplicate(version: VersionRow) {
    setBusyVersionId(version.versionId);
    try {
      const response = await fetch("/api/sheets/versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "use_as_template",
          sourceVersionId: version.versionId,
          caseDraft: {
            caseName: `${version.projectNameSnapshot || "新案件"}（複製）`,
          },
        }),
      });
      if (!response.ok) throw new Error("複製失敗");
      const payload = (await response.json()) as {
        caseId?: string;
        quoteId?: string;
        versionId?: string;
      };

      if (!payload.caseId || !payload.quoteId || !payload.versionId) {
        throw new Error("複製結果不完整");
      }

      openVersion(payload.versionId, payload.caseId, payload.quoteId);
    } catch (err) {
      alert(err instanceof Error ? err.message : "複製失敗");
    } finally {
      setBusyVersionId("");
    }
  }

  async function handleDelete(version: VersionRow) {
    if (!confirm(`確定要刪除版本 ${version.versionId}？`)) return;
    await handleStatusChange(version.versionId, "superseded");
  }

  const filtered = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    return versions.filter((item) => {
      if (!showSuperseded && item.versionStatus === "superseded") return false;
      if (filterStatus !== "all" && item.versionStatus !== filterStatus) return false;
      if (filterDateFrom && item.quoteDate < filterDateFrom) return false;
      if (filterDateTo && item.quoteDate > filterDateTo) return false;

      if (!query) return true;
      return [
        item.clientNameSnapshot,
        item.projectNameSnapshot,
        item.versionId,
        item.quoteId,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [filterDateFrom, filterDateTo, filterStatus, searchText, showSuperseded, versions]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const byQuoteDate = compareDateTextDesc(a.quoteDate, b.quoteDate);
      if (byQuoteDate !== 0) return byQuoteDate;
      return compareDateTextDesc(a.createdAt, b.createdAt);
    });
  }, [filtered]);

  const nonSupersededAll = useMemo(
    () => versions.filter((item) => item.versionStatus !== "superseded"),
    [versions],
  );
  const totalCount = nonSupersededAll.length;
  const acceptedCount = nonSupersededAll.filter((item) => item.versionStatus === "accepted").length;
  const totalAmount = nonSupersededAll.reduce((sum, item) => sum + item.totalAmount, 0);
  const hasFilters =
    searchText.trim() !== "" ||
    filterStatus !== "all" ||
    filterDateFrom !== "" ||
    filterDateTo !== "" ||
    showSuperseded;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">報價紀錄</h1>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            {loading
              ? "載入中..."
              : `${hasFilters ? `顯示 ${sorted.length} 筆` : `${totalCount} 筆報價`} · 已成交 ${acceptedCount} 筆 · 報價總額 ${formatCurrency(totalAmount)}`}
          </p>
        </div>
        <Button variant="outline" size="sm" disabled={loading} onClick={() => void load()}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          重新載入
        </Button>
      </div>

      <div className="card-surface rounded-[var(--radius-lg)] px-4 py-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <Input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="搜尋客戶、案場、版本編號、報價編號..."
            className="lg:max-w-sm"
          />
          <Select value={filterStatus} onValueChange={(value) => setFilterStatus(value as VersionStatus | "all")}>
            <SelectTrigger className="w-full lg:w-44">
              <SelectValue placeholder="全部狀態" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTER_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={filterDateFrom}
            onChange={(e) => setFilterDateFrom(e.target.value)}
            className="w-full lg:w-44"
          />
          <span className="hidden text-sm text-[var(--text-tertiary)] lg:inline">~</span>
          <Input
            type="date"
            value={filterDateTo}
            onChange={(e) => setFilterDateTo(e.target.value)}
            className="w-full lg:w-44"
          />
          <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <Checkbox
              checked={showSuperseded}
              onCheckedChange={(checked) => setShowSuperseded(checked === true)}
            />
            顯示已取代
          </label>
        </div>
      </div>

      <div className="card-surface overflow-hidden rounded-[var(--radius-lg)]">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-[var(--text-secondary)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            載入中...
          </div>
        ) : sorted.length === 0 ? (
          <div className="py-12 text-center text-sm text-[var(--text-secondary)]">尚無報價紀錄</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="px-4 py-2.5">報價單號</th>
                  <th className="px-4 py-2.5">日期</th>
                  <th className="px-4 py-2.5">客戶</th>
                  <th className="px-4 py-2.5">案場</th>
                  <th className="px-4 py-2.5 text-right">含稅總額</th>
                  <th className="w-36 px-4 py-2.5">狀態</th>
                  <th className="w-36 px-4 py-2.5">操作</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((version) => {
                  const statusInfo = VERSION_STATUS_MAP[version.versionStatus] ?? VERSION_STATUS_MAP.draft;
                  const contact = version.contactNameSnapshot?.trim();
                  const isBusy = busyVersionId === version.versionId;
                  return (
                    <tr key={version.versionId}>
                      <td className="px-4 py-2.5">
                        <div className="font-mono text-xs">{version.quoteId}</div>
                        <div className="mt-0.5 text-[11px] text-[var(--text-tertiary)]">V{version.versionNo}</div>
                      </td>
                      <td className="px-4 py-2.5 text-sm">{version.quoteDate || "—"}</td>
                      <td className="px-4 py-2.5">
                        <div className="text-sm font-medium">{version.clientNameSnapshot || contact || "—"}</div>
                        {version.clientNameSnapshot && contact && (
                          <div className="text-xs text-[var(--text-secondary)]">{contact}</div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-sm">{version.projectNameSnapshot || "—"}</td>
                      <td className="px-4 py-2.5 text-right text-sm font-medium">
                        {formatCurrency(version.totalAmount)}
                      </td>
                      <td className="px-4 py-2.5">
                        <Select
                          value={version.versionStatus}
                          disabled={isBusy}
                          onValueChange={(value) => void handleStatusChange(version.versionId, value as VersionStatus)}
                        >
                          <SelectTrigger className="h-7 whitespace-nowrap text-xs">
                            <SelectValue>
                              <span className={`badge ${statusInfo.className}`}>{statusInfo.label}</span>
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {STATUS_CHANGE_OPTIONS.map((status) => (
                              <SelectItem key={status} value={status}>
                                {VERSION_STATUS_MAP[status].label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            onClick={() => openVersion(version.versionId, version.caseId, version.quoteId)}
                            className="h-7 gap-1 whitespace-nowrap px-2 text-xs"
                            disabled={isBusy}
                          >
                            <Edit className="h-3 w-3" />
                            編輯
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void handleDuplicate(version)}
                            className="h-7 w-7 p-0"
                            title="複製為新案件"
                            disabled={isBusy}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void handleDelete(version)}
                            className="h-7 w-7 p-0 text-[var(--text-tertiary)] hover:text-[var(--error)]"
                            title="標記為已取代"
                            disabled={isBusy}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
