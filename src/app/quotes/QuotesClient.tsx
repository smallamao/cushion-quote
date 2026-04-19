"use client";

import { ChevronDown, ChevronRight, Copy, Edit, FilePlus2, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

import type { QuoteVersionRecord, VersionStatus } from "@/lib/types";
import { createQuoteLoadRequest, writeQuoteLoadRequest } from "@/lib/quote-draft-session";
import { formatCurrency } from "@/lib/utils";
import { useIsMobile } from "@/hooks/useIsMobile";
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

interface QuoteGroup {
  quoteId: string;
  caseId: string;
  latest: VersionRow;
  olderVersions: VersionRow[];
}

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
  const isMobile = useIsMobile();
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [filterStatus, setFilterStatus] = useState<VersionStatus | "all">("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [showSuperseded, setShowSuperseded] = useState(false);
  const [busyVersionId, setBusyVersionId] = useState("");
  const [expandedQuoteIds, setExpandedQuoteIds] = useState<Set<string>>(new Set());

  const load = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    try {
      const response = await fetch("/api/sheets/versions?includeLines=false", { cache: "no-store" });
      if (!response.ok) throw new Error("load");
      const payload = (await response.json()) as { versions: VersionRow[] };
      setVersions(payload.versions);
    } catch {
      if (!background) setVersions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Re-fetch in background when navigating back via browser back button (bfcache restore)
  useEffect(() => {
    function handlePageShow(e: PageTransitionEvent) {
      if (e.persisted) void load(true);
    }
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, [load]);

  function toggleExpand(quoteId: string) {
    setExpandedQuoteIds((prev) => {
      const next = new Set(prev);
      if (next.has(quoteId)) {
        next.delete(quoteId);
      } else {
        next.add(quoteId);
      }
      return next;
    });
  }

  function openVersion(versionId: string, caseId: string, quoteId: string) {
    writeQuoteLoadRequest(
      window.sessionStorage,
      createQuoteLoadRequest({ source: "quotes-list", caseId, quoteId, versionId }),
    );
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

  async function handleNewVersion(version: VersionRow) {
    setBusyVersionId(version.versionId);
    try {
      const response = await fetch("/api/sheets/versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "new_version",
          basedOnVersionId: version.versionId,
        }),
      });
      if (!response.ok) throw new Error("建立新版本失敗");
      const payload = (await response.json()) as { versionId?: string };
      if (!payload.versionId) throw new Error("建立新版本結果不完整");
      openVersion(payload.versionId, version.caseId, version.quoteId);
    } catch (err) {
      alert(err instanceof Error ? err.message : "建立新版本失敗");
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
        item.contactNameSnapshot,
        item.projectNameSnapshot,
        item.quoteNameSnapshot,
        item.versionId,
        item.quoteId,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [filterDateFrom, filterDateTo, filterStatus, searchText, showSuperseded, versions]);

  const groups = useMemo(() => {
    // Build a map of ALL versions per quoteId (for grouping)
    const allMap = new Map<string, VersionRow[]>();
    for (const v of versions) {
      const list = allMap.get(v.quoteId) ?? [];
      list.push(v);
      allMap.set(v.quoteId, list);
    }

    // Determine which quoteIds have at least one version matching current filters
    const filteredQuoteIds = new Set(filtered.map((v) => v.quoteId));

    const result: QuoteGroup[] = [];
    for (const quoteId of filteredQuoteIds) {
      const allVersions = allMap.get(quoteId) ?? [];
      const sorted = [...allVersions].sort((a, b) => b.versionNo - a.versionNo);
      // Latest = highest versionNo that is NOT superseded, fallback to highest overall
      const latest = sorted.find((v) => v.versionStatus !== "superseded") ?? sorted[0];
      const olderVersions = sorted.filter((v) => v.versionId !== latest.versionId);
      result.push({
        quoteId,
        caseId: latest.caseId,
        latest,
        olderVersions,
      });
    }

    result.sort((a, b) => {
      const byDate = compareDateTextDesc(a.latest.quoteDate, b.latest.quoteDate);
      if (byDate !== 0) return byDate;
      return compareDateTextDesc(a.latest.createdAt, b.latest.createdAt);
    });

    return result;
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

  function renderActionButtons(version: VersionRow) {
    const isBusy = busyVersionId === version.versionId;
    return (
      <div className="flex items-center justify-center gap-1">
        <button
          onClick={(e) => { e.stopPropagation(); openVersion(version.versionId, version.caseId, version.quoteId); }}
          className="text-[var(--text-tertiary)] hover:text-blue-500 transition-colors"
          title="編輯"
          disabled={isBusy}
        >
          <Edit className="h-4 w-4" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); void handleNewVersion(version); }}
          className="text-[var(--text-tertiary)] hover:text-blue-500 transition-colors"
          title="建立新版本"
          disabled={isBusy}
        >
          <FilePlus2 className="h-4 w-4" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); void handleDuplicate(version); }}
          className="text-[var(--text-tertiary)] hover:text-blue-500 transition-colors"
          title="複製為新案件"
          disabled={isBusy}
        >
          <Copy className="h-4 w-4" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); void handleDelete(version); }}
          className="text-[var(--text-tertiary)] hover:text-red-500 transition-colors"
          title="標記為已取代"
          disabled={isBusy}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    );
  }

  function renderStatusSelect(version: VersionRow) {
    const statusInfo = VERSION_STATUS_MAP[version.versionStatus] ?? VERSION_STATUS_MAP.draft;
    const isBusy = busyVersionId === version.versionId;
    return (
      <Select
        value={version.versionStatus}
        disabled={isBusy}
        onValueChange={(value) => void handleStatusChange(version.versionId, value as VersionStatus)}
      >
        <SelectTrigger className="h-7 whitespace-nowrap text-xs" onClick={(e) => e.stopPropagation()}>
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
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">報價紀錄</h1>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            {loading
              ? "載入中..."
              : `${hasFilters ? `顯示 ${filtered.length} 筆` : `${totalCount} 筆報價`} · 已成交 ${acceptedCount} 筆 · 報價總額 ${formatCurrency(totalAmount)}`}
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
            placeholder="搜尋客戶、方案名稱、案場、版本編號、報價編號..."
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
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <Input
              type="date"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
              className="w-full lg:w-44"
            />
            <span className="hidden text-sm text-[var(--text-tertiary)] md:inline">~</span>
            <Input
              type="date"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
              className="w-full lg:w-44"
            />
          </div>
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
        ) : groups.length === 0 ? (
          <div className="py-12 text-center text-sm text-[var(--text-secondary)]">尚無報價紀錄</div>
        ) : isMobile ? (
          <div className="space-y-3 p-3">
            {groups.map((group) => {
              const { latest } = group;
              const statusInfo = VERSION_STATUS_MAP[latest.versionStatus] ?? VERSION_STATUS_MAP.draft;
              const isBusy = busyVersionId === latest.versionId;
              const contact = latest.contactNameSnapshot?.trim();
              const isExpanded = expandedQuoteIds.has(group.quoteId);
              const hasOlder = group.olderVersions.length > 0;
              return (
                <div
                  key={group.quoteId}
                  className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {hasOlder && (
                        <button onClick={() => toggleExpand(group.quoteId)} className="text-[var(--text-tertiary)]">
                          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                      )}
                      <span className="font-mono text-xs text-[var(--accent)]">{latest.quoteId}</span>
                      <span className="text-[11px] text-[var(--text-tertiary)]">V{latest.versionNo}</span>
                    </div>
                    <span className={`badge ${statusInfo.className}`}>{statusInfo.label}</span>
                  </div>
                  <div className="mt-2">
                    <div className="text-sm font-semibold text-[var(--text-primary)]">
                      {latest.clientNameSnapshot || contact || "—"}
                      {latest.clientNameSnapshot && contact && (
                        <span className="ml-1 font-normal text-xs text-[var(--text-secondary)]">
                          {contact}
                        </span>
                      )}
                    </div>
                    {latest.quoteNameSnapshot && (
                      <div className="mt-0.5 text-sm font-medium text-[var(--text-primary)]">
                        {latest.quoteNameSnapshot}
                      </div>
                    )}
                  </div>
                  <div className="mt-1.5 text-xs text-[var(--text-tertiary)]">
                    {latest.quoteDate || latest.createdAt || "—"}
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-sm font-semibold text-[var(--text-primary)]">
                      {formatCurrency(latest.totalAmount)}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        onClick={() => openVersion(latest.versionId, latest.caseId, latest.quoteId)}
                        className="h-7 gap-1 whitespace-nowrap px-2 text-xs"
                        disabled={isBusy}
                      >
                        <Edit className="h-3 w-3" />
                        編輯
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleDuplicate(latest)}
                        className="h-7 w-7 p-0"
                        title="複製為新案件"
                        disabled={isBusy}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  {isExpanded && group.olderVersions.length > 0 && (
                    <div className="mt-3 space-y-2 border-t border-[var(--border)] pt-3">
                      <div className="text-xs font-medium text-[var(--text-secondary)]">歷史版本</div>
                      {group.olderVersions.map((v) => {
                        const vStatus = VERSION_STATUS_MAP[v.versionStatus] ?? VERSION_STATUS_MAP.draft;
                        return (
                          <div
                            key={v.versionId}
                            className="flex items-center justify-between rounded-[var(--radius-sm)] bg-[var(--bg-subtle)] px-3 py-2 cursor-pointer"
                            onClick={() => openVersion(v.versionId, v.caseId, v.quoteId)}
                          >
                            <div>
                              <span className="text-xs font-medium text-[var(--accent)]">V{v.versionNo}</span>
                              <span className="ml-2 text-xs text-[var(--text-secondary)]">{v.quoteDate || "—"}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`badge ${vStatus.className}`}>{vStatus.label}</span>
                              <span className="text-xs font-medium">{formatCurrency(v.totalAmount)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="w-8 px-2 py-2.5" />
                  <th className="px-4 py-2.5">報價單號</th>
                  <th className="px-4 py-2.5">日期</th>
                  <th className="px-4 py-2.5">客戶</th>
                  <th className="px-4 py-2.5">方案名稱</th>
                  <th className="px-4 py-2.5">案場</th>
                  <th className="px-4 py-2.5 text-right">含稅總額</th>
                  <th className="w-28 px-4 py-2.5">狀態</th>
                  <th className="w-28 px-4 py-2.5 text-center">操作</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => {
                  const { latest } = group;
                  const contact = latest.contactNameSnapshot?.trim();
                  const hasOlder = group.olderVersions.length > 0;
                  const isExpanded = expandedQuoteIds.has(group.quoteId);

                  return (
                    <Fragment key={group.quoteId}>
                      <tr
                        className={hasOlder ? "cursor-pointer" : undefined}
                        onClick={hasOlder ? () => toggleExpand(group.quoteId) : undefined}
                      >
                        <td className="px-2 py-2.5 text-center text-[var(--text-tertiary)]">
                          {hasOlder ? (
                            isExpanded ? <ChevronDown className="mx-auto h-4 w-4" /> : <ChevronRight className="mx-auto h-4 w-4" />
                          ) : null}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="font-mono text-xs">{latest.quoteId}</div>
                          <div className="mt-0.5 text-[11px] text-[var(--text-tertiary)]">
                            V{latest.versionNo}
                            {hasOlder && (
                              <span className="ml-1 text-[var(--text-tertiary)]">
                                ({group.olderVersions.length + 1} 個版本)
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-sm">{latest.quoteDate || "—"}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="text-sm font-medium">
                            {latest.clientNameSnapshot || contact || "—"}
                          </div>
                          {latest.clientNameSnapshot && contact && (
                            <div className="text-xs text-[var(--text-secondary)]">{contact}</div>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-sm">{latest.quoteNameSnapshot || "—"}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-sm">{latest.projectNameSnapshot || "—"}</span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <span className="text-sm font-medium">{formatCurrency(latest.totalAmount)}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          {renderStatusSelect(latest)}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {renderActionButtons(latest)}
                        </td>
                      </tr>

                      {isExpanded && group.olderVersions.length > 0 && (
                        <tr>
                          <td colSpan={9} className="bg-[var(--bg-subtle)] px-4 py-3">
                            <div className="ml-6">
                              <div className="text-xs font-medium text-[var(--text-secondary)] mb-2">歷史版本</div>
                              <table className="w-full border-collapse text-sm">
                                <thead>
                                  <tr className="border-b border-[var(--border)] text-xs text-[var(--text-secondary)]">
                                    <th className="px-2 py-2 text-left">版本</th>
                                    <th className="px-2 py-2 text-left">日期</th>
                                    <th className="px-2 py-2 text-left">狀態</th>
                                    <th className="px-2 py-2 text-right">金額</th>
                                    <th className="w-28 px-2 py-2 text-center">操作</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {group.olderVersions.map((version) => {
                                    const versionStatus =
                                      VERSION_STATUS_MAP[version.versionStatus] ?? VERSION_STATUS_MAP.draft;
                                    return (
                                      <tr
                                        key={version.versionId}
                                        className="cursor-pointer border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--bg-subtle)]"
                                        onClick={() => openVersion(version.versionId, version.caseId, version.quoteId)}
                                      >
                                        <td className="px-2 py-2 font-medium text-[var(--accent)]">
                                          V{version.versionNo} {version.versionLabel}
                                        </td>
                                        <td className="px-2 py-2 text-[var(--text-secondary)]">{version.quoteDate || "—"}</td>
                                        <td className="px-2 py-2">
                                          <span className={`badge ${versionStatus.className}`}>{versionStatus.label}</span>
                                        </td>
                                        <td className="px-2 py-2 text-right font-medium text-[var(--text-primary)]">
                                          {formatCurrency(version.totalAmount)}
                                        </td>
                                        <td className="px-2 py-2 text-center">
                                          {renderActionButtons(version)}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
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
