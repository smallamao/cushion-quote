"use client";

import { ChevronDown, ChevronRight, Copy, Edit, Eye, FileCheck2, FilePlus2, Loader2, ReceiptText, RefreshCw, Slash, Trash2, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

import type { QuoteVersionRecord, VersionStatus } from "@/lib/types";
import { createQuoteLoadRequest, writeQuoteLoadRequest } from "@/lib/quote-draft-session";
import { formatCurrency } from "@/lib/utils";
import { useIsMobile } from "@/hooks/useIsMobile";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SignedContractArchive } from "@/components/quote-editor/SignedContractArchive";
import { CreateARDialog } from "@/components/ar/CreateARDialog";
import { useReceivables } from "@/hooks/useReceivables";

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
  const [contractDialogVersion, setContractDialogVersion] = useState<VersionRow | null>(null);
  const [contractDraft, setContractDraft] = useState({
    signedBack: false,
    signedBackDate: "",
    signedContractUrls: [] as string[],
    signedNotes: "",
  });
  const [contractSaving, setContractSaving] = useState(false);
  const [createARVersion, setCreateARVersion] = useState<QuoteVersionRecord | null>(null);
  const { ars, createAR } = useReceivables();
  const arByVersionId = useMemo(() => {
    const m = new Map<string, typeof ars[number]>();
    for (const ar of ars) {
      if (ar.arStatus === "cancelled") continue;
      m.set(ar.versionId, ar);
    }
    return m;
  }, [ars]);
  const [expandedQuoteIds, setExpandedQuoteIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    setPage(1);
  }, [searchText, filterStatus, filterDateFrom, filterDateTo, showSuperseded]);

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

  function openContractDialog(version: VersionRow) {
    setContractDialogVersion(version);
    setContractDraft({
      signedBack: version.signedBack ?? false,
      signedBackDate: version.signedBackDate ?? "",
      signedContractUrls: version.signedContractUrls ?? [],
      signedNotes: version.signedNotes ?? "",
    });
  }

  async function handleContractSave() {
    if (!contractDialogVersion) return;
    setContractSaving(true);
    try {
      const res = await fetch(
        `/api/sheets/versions/${encodeURIComponent(contractDialogVersion.versionId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(contractDraft),
        },
      );
      if (!res.ok) throw new Error("儲存失敗");
      // Optimistic local update
      setVersions((current) =>
        current.map((v) =>
          v.versionId === contractDialogVersion.versionId
            ? {
                ...v,
                signedBack: contractDraft.signedBack,
                signedBackDate: contractDraft.signedBackDate,
                signedContractUrls: contractDraft.signedContractUrls,
                signedNotes: contractDraft.signedNotes,
              }
            : v,
        ),
      );
      setContractDialogVersion(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "儲存失敗");
    } finally {
      setContractSaving(false);
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

  const totalPages = Math.max(1, Math.ceil(groups.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pagedGroups = useMemo(
    () => groups.slice(pageStart, pageStart + pageSize),
    [groups, pageStart, pageSize],
  );

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
    const existingAr = arByVersionId.get(version.versionId);
    const canCreateAR = version.versionStatus === "accepted" && !existingAr;
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
          onClick={(e) => { e.stopPropagation(); openContractDialog(version); }}
          className={[
            "transition-colors",
            version.signedBack
              ? "text-green-600 hover:text-green-700"
              : "text-[var(--text-tertiary)] hover:text-blue-500",
          ].join(" ")}
          title={version.signedBack ? "合約已歸檔（點擊檢視/編輯）" : "合約歸檔（回簽存證）"}
          disabled={isBusy}
        >
          <FileCheck2 className="h-4 w-4" />
        </button>
        {canCreateAR && (
          <button
            onClick={(e) => { e.stopPropagation(); setCreateARVersion(version); }}
            className="text-amber-600 hover:text-amber-700 transition-colors"
            title="建立應收帳款"
            disabled={isBusy}
          >
            <Wallet className="h-4 w-4" />
          </button>
        )}
        {version.versionStatus === "accepted" && (
          <button
            onClick={(e) => { e.stopPropagation(); router.push(`/einvoices?versionId=${encodeURIComponent(version.versionId)}`); }}
            className="text-sky-600 hover:text-sky-700 transition-colors"
            title="前往電子發票開立"
            disabled={isBusy}
          >
            <ReceiptText className="h-4 w-4" />
          </button>
        )}
        <button
          onClick={async (e) => {
            e.stopPropagation();
            if (!confirm("確定設定此報價單「不開發票」？")) return;
            const res = await fetch("/api/sheets/einvoices/opt-out", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ versionId: version.versionId, action: "add" }),
            });
            const data = await res.json();
            if (data.ok) {
              void load();
            }
          }}
          className="text-red-400 hover:text-red-600 transition-colors"
          title="設定不開發票"
        >
          <Slash className="h-4 w-4" />
        </button>
        {existingAr && (
          <button
            onClick={(e) => { e.stopPropagation(); router.push(`/receivables/${existingAr.arId}`); }}
            className="text-green-600 hover:text-green-700 transition-colors"
            title={`已有應收帳款 ${existingAr.arId}（點擊檢視）`}
            disabled={isBusy}
          >
            <Wallet className="h-4 w-4" />
          </button>
        )}
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
            {pagedGroups.map((group) => {
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
                      <button onClick={() => toggleExpand(group.quoteId)} className="text-[var(--text-tertiary)]">
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                      <span className="font-mono text-xs text-[var(--accent)]">{latest.quoteId}</span>
                      <span className="text-[11px] text-[var(--text-tertiary)]">V{latest.versionNo}</span>
                      <button onClick={() => toggleExpand(group.quoteId)} className="ml-1 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]" title="展開預覽">
                        <Eye className="h-3.5 w-3.5" />
                      </button>
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
                  {isExpanded && (
                    <div className="mt-3 space-y-2 border-t border-[var(--border)] pt-3">
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        <div>
                          <span className="text-[var(--text-tertiary)]">案件名稱：</span>
                          <span className="text-[var(--text-primary)]">{latest.projectNameSnapshot || "—"}</span>
                        </div>
                        <div>
                          <span className="text-[var(--text-tertiary)]">案件地址：</span>
                          <span className="text-[var(--text-primary)]">{latest.projectAddressSnapshot || "—"}</span>
                        </div>
                        <div>
                          <span className="text-[var(--text-tertiary)]">通路：</span>
                          <span className="text-[var(--text-primary)]">{latest.channelSnapshot || "—"}</span>
                        </div>
                        <div>
                          <span className="text-[var(--text-tertiary)]">報價日期：</span>
                          <span className="text-[var(--text-primary)]">{latest.quoteDate || "—"}</span>
                        </div>
                        <div>
                          <span className="text-[var(--text-tertiary)]">未稅金額：</span>
                          <span className="text-[var(--text-primary)]">{formatCurrency(latest.subtotalBeforeTax)}</span>
                        </div>
                        <div>
                          <span className="text-[var(--text-tertiary)]">折扣：</span>
                          <span className="text-[var(--text-primary)]">{formatCurrency(latest.discountAmount)}</span>
                        </div>
                        <div>
                          <span className="text-[var(--text-tertiary)]">稅額：</span>
                          <span className="text-[var(--text-primary)]">{formatCurrency(latest.taxAmount)}</span>
                        </div>
                        <div>
                          <span className="text-[var(--text-tertiary)]">含稅金額：</span>
                          <span className="text-[var(--text-primary)] font-semibold">{formatCurrency(latest.totalAmount)}</span>
                        </div>
                      </div>
                      {latest.internalNotes && (
                        <div className="mt-2 rounded bg-[var(--surface-muted)] px-2 py-1.5 text-xs">
                          <span className="text-[var(--text-tertiary)]">內部備註：</span>
                          <span className="text-[var(--text-secondary)]">{latest.internalNotes}</span>
                        </div>
                      )}
                    </div>
                  )}
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
                {pagedGroups.map((group) => {
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

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={groups.length}
        pageStart={pageStart}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
        isMobile={isMobile}
      />

      <Dialog
        open={contractDialogVersion !== null}
        onOpenChange={(open) => {
          if (!open) setContractDialogVersion(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              合約歸檔 — {contractDialogVersion?.quoteId} V{contractDialogVersion?.versionNo}
            </DialogTitle>
          </DialogHeader>
          {contractDialogVersion && (
            <SignedContractArchive
              versionId={contractDialogVersion.versionId}
              signedBack={contractDraft.signedBack}
              signedBackDate={contractDraft.signedBackDate}
              signedContractUrls={contractDraft.signedContractUrls}
              signedNotes={contractDraft.signedNotes}
              onChange={setContractDraft}
            />
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setContractDialogVersion(null)}
              disabled={contractSaving}
            >
              取消
            </Button>
            <Button onClick={() => void handleContractSave()} disabled={contractSaving}>
              {contractSaving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  儲存中…
                </>
              ) : (
                "儲存"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CreateARDialog
        open={createARVersion !== null}
        onOpenChange={(open) => {
          if (!open) setCreateARVersion(null);
        }}
        version={createARVersion}
        onCreate={async (payload) => {
          const result = await createAR(payload);
          if (result?.ar) {
            router.push(`/receivables/${result.ar.arId}`);
          }
        }}
      />
    </div>
  );
}
