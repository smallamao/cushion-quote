"use client";

import { Briefcase, ChevronDown, ChevronRight, Copy, ExternalLink, Loader2, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useClients } from "@/hooks/useClients";
import { LEAD_SOURCE_DETAIL_ENABLED, LEAD_SOURCE_LABELS, LEAD_SOURCE_OPTIONS } from "@/lib/constants";
import { createQuoteLoadRequest, writeQuoteLoadRequest } from "@/lib/quote-draft-session";
import type { CaseRecord, LeadSource, QuotePlanRecord, QuoteVersionRecord } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CASE_STATUS_MAP: Record<CaseRecord["caseStatus"], { label: string; className: string }> = {
  new: { label: "新詢問", className: "badge-draft" },
  quoting: { label: "報價中", className: "badge-sent" },
  following_up: { label: "追蹤中", className: "badge-sent" },
  won: { label: "已成交", className: "badge-accepted" },
  lost: { label: "未成交", className: "badge-rejected" },
  on_hold: { label: "暫停", className: "badge-expired" },
  closed: { label: "結案", className: "badge-deleted" },
};

const VERSION_STATUS_MAP: Record<QuoteVersionRecord["versionStatus"], { label: string; className: string }> = {
  draft: { label: "草稿", className: "badge-draft" },
  sent: { label: "已發送", className: "badge-sent" },
  following_up: { label: "追蹤中", className: "badge-sent" },
  negotiating: { label: "議價中", className: "badge-sent" },
  accepted: { label: "已接受", className: "badge-accepted" },
  rejected: { label: "已拒絕", className: "badge-rejected" },
  superseded: { label: "已取代", className: "badge-expired" },
};

interface CaseDetailPayload {
  case: CaseRecord;
  quotes: Array<{
    quote: QuotePlanRecord;
    versions: QuoteVersionRecord[];
  }>;
  purchaseSummary: {
    orderCount: number;
    itemCount: number;
    totalItemAmount: number;
    totalOrderAmount: number;
  };
  purchases: Array<{
    order: {
      orderId: string;
      orderDate: string;
      totalAmount: number;
      status: string;
    };
    items: Array<{
      itemId: string;
      quantity: number;
      amount: number;
      productSnapshot: {
        productCode: string;
        productName: string;
        specification: string;
        unit: string;
      };
    }>;
    supplierName: string;
    itemSubtotal: number;
  }>;
}

interface CopyDialogState {
  open: boolean;
  sourceVersionId: string;
  caseId: string;
  quoteId: string;
  caseName: string;
}

export function CasesClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { clients, loading: clientsLoading } = useClients();

  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [expandedCaseIds, setExpandedCaseIds] = useState<Set<string>>(new Set());
  const [details, setDetails] = useState<Record<string, CaseDetailPayload>>({});
  const [loadingDetails, setLoadingDetails] = useState<Record<string, boolean>>({});
  const handledSearchCaseIdRef = useRef<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newCaseName, setNewCaseName] = useState("");
  const [newCaseClientId, setNewCaseClientId] = useState("none");
  const [newCaseLeadSource, setNewCaseLeadSource] = useState<LeadSource>("unknown");
  const [newCaseLeadSourceDetail, setNewCaseLeadSourceDetail] = useState("");
  const [newCaseLeadSourceContact, setNewCaseLeadSourceContact] = useState("");
  const [newCaseLeadSourceNotes, setNewCaseLeadSourceNotes] = useState("");
  const [creating, setCreating] = useState(false);
  const [leadSourceFilter, setLeadSourceFilter] = useState<"all" | LeadSource>("all");
  const [copyDialog, setCopyDialog] = useState<CopyDialogState>({
    open: false,
    sourceVersionId: "",
    caseId: "",
    quoteId: "",
    caseName: "",
  });
  const [copying, setCopying] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; caseId: string; caseName: string }>({
    open: false,
    caseId: "",
    caseName: "",
  });
  const [deleting, setDeleting] = useState(false);
  const [editDialog, setEditDialog] = useState<{
    open: boolean;
    caseId: string;
    caseName: string;
    projectAddress: string;
    leadSource: LeadSource;
    leadSourceDetail: string;
    leadSourceContact: string;
    leadSourceNotes: string;
  }>({
    open: false,
    caseId: "",
    caseName: "",
    projectAddress: "",
    leadSource: "unknown",
    leadSourceDetail: "",
    leadSourceContact: "",
    leadSourceNotes: "",
  });

  const shouldShowLeadSourceDetail = useCallback(
    (source: LeadSource) => LEAD_SOURCE_DETAIL_ENABLED.includes(source),
    [],
  );
  const [editing, setEditing] = useState(false);

  const loadCases = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/sheets/cases", { cache: "no-store" });
      if (!response.ok) throw new Error("load");
      const payload = (await response.json()) as { cases: CaseRecord[] };
      setCases(payload.cases);
    } catch {
      setCases([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCases();
  }, [loadCases]);

  const loadCaseDetails = useCallback(async (caseId: string) => {
    if (loadingDetails[caseId] || details[caseId]) return;
    setLoadingDetails((prev) => ({ ...prev, [caseId]: true }));
    try {
      const response = await fetch(`/api/sheets/cases/${encodeURIComponent(caseId)}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("讀取案件失敗");
      const payload = (await response.json()) as CaseDetailPayload;
      setDetails((prev) => ({ ...prev, [caseId]: payload }));
    } catch {
      setDetails((prev) => {
        const next = { ...prev };
        delete next[caseId];
        return next;
      });
    } finally {
      setLoadingDetails((prev) => ({ ...prev, [caseId]: false }));
    }
  }, [details, loadingDetails]);

  useEffect(() => {
    const targetCaseId = searchParams.get("caseId");
    if (!targetCaseId || loading || cases.length === 0) return;
    if (handledSearchCaseIdRef.current === targetCaseId) return;

    const matchedCase = cases.find((item) => item.caseId === targetCaseId);
    if (!matchedCase) return;
    handledSearchCaseIdRef.current = targetCaseId;

    setExpandedCaseIds((prev) => {
      if (prev.has(targetCaseId)) return prev;
      const next = new Set(prev);
      next.add(targetCaseId);
      return next;
    });
    void loadCaseDetails(targetCaseId);

    requestAnimationFrame(() => {
      document.getElementById(`case-row-${targetCaseId}`)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, [cases, loading, loadCaseDetails, searchParams]);

  function toggleCase(caseId: string) {
    setExpandedCaseIds((prev) => {
      const next = new Set(prev);
      if (next.has(caseId)) {
        next.delete(caseId);
      } else {
        next.add(caseId);
        void loadCaseDetails(caseId);
      }
      return next;
    });
  }

  async function handleCreateCase() {
    if (!newCaseName.trim()) {
      alert("請輸入案件名稱");
      return;
    }

    setCreating(true);
    try {
      const picked = clients.find((client) => client.id === newCaseClientId);
      const response = await fetch("/api/sheets/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseName: newCaseName.trim(),
          clientId: picked?.id ?? "",
          clientNameSnapshot: picked?.companyName ?? "",
          contactNameSnapshot: picked?.contactName ?? "",
          phoneSnapshot: picked?.phone ?? "",
          projectAddress: picked?.address ?? "",
          channelSnapshot: picked?.channel ?? "retail",
          leadSource: newCaseLeadSource,
          leadSourceDetail: shouldShowLeadSourceDetail(newCaseLeadSource) ? newCaseLeadSourceDetail.trim() : "",
          leadSourceContact: newCaseLeadSourceContact.trim(),
          leadSourceNotes: newCaseLeadSourceNotes.trim(),
        }),
      });
      if (!response.ok) throw new Error("新增案件失敗");
      setCreateOpen(false);
      setNewCaseName("");
      setNewCaseClientId("none");
      setNewCaseLeadSource("unknown");
      setNewCaseLeadSourceDetail("");
      setNewCaseLeadSourceContact("");
      setNewCaseLeadSourceNotes("");
      await loadCases();
    } catch (err) {
      alert(err instanceof Error ? err.message : "新增案件失敗");
    } finally {
      setCreating(false);
    }
  }

  function openVersion(versionId: string, caseId: string, quoteId: string) {
    writeQuoteLoadRequest(
      window.sessionStorage,
      createQuoteLoadRequest({ source: "cases-list", caseId, quoteId, versionId }),
    );
    router.push("/");
  }

  function openCopyDialog(sourceVersionId: string, caseId: string, quoteId: string, caseName: string) {
    setCopyDialog({ open: true, sourceVersionId, caseId, quoteId, caseName });
  }

  async function handleCopy(action: "new_version" | "use_as_template" | "new_quote_same_case") {
    if (!copyDialog.sourceVersionId) return;
    setCopying(true);
    try {
      const response = await fetch("/api/sheets/versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "new_version"
            ? { action: "new_version", basedOnVersionId: copyDialog.sourceVersionId }
            : action === "new_quote_same_case"
              ? {
                  action: "new_quote_same_case",
                  sourceVersionId: copyDialog.sourceVersionId,
                  targetCaseId: copyDialog.caseId,
                  quoteName: "新方案",
                }
              : {
                  action: "use_as_template",
                  sourceVersionId: copyDialog.sourceVersionId,
                  caseDraft: {
                    caseName: `${copyDialog.caseName || "新案件"}（複製）`,
                  },
                },
        ),
      });
      if (!response.ok) throw new Error("複製失敗");

      const payload = (await response.json()) as {
        versionId?: string;
        caseId?: string;
        quoteId?: string;
      };

      setCopyDialog({ open: false, sourceVersionId: "", caseId: "", quoteId: "", caseName: "" });

      if (action === "new_version" && payload.versionId) {
        writeQuoteLoadRequest(
          window.sessionStorage,
          createQuoteLoadRequest({
            source: "cases-list",
            caseId: copyDialog.caseId,
            quoteId: copyDialog.quoteId,
            versionId: payload.versionId,
          }),
        );
        router.push("/");
        return;
      }

      if ((action === "use_as_template" || action === "new_quote_same_case") && payload.caseId && payload.quoteId && payload.versionId) {
        writeQuoteLoadRequest(
          window.sessionStorage,
          createQuoteLoadRequest({
            source: "cases-list",
            caseId: payload.caseId,
            quoteId: payload.quoteId,
            versionId: payload.versionId,
          }),
        );
        router.push("/");
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "複製失敗");
    } finally {
      setCopying(false);
    }
  }

  function openEditDialog(caseRecord: CaseRecord) {
    setEditDialog({
      open: true,
      caseId: caseRecord.caseId,
      caseName: caseRecord.caseName,
      projectAddress: caseRecord.projectAddress,
      leadSource: caseRecord.leadSource,
      leadSourceDetail: caseRecord.leadSourceDetail,
      leadSourceContact: caseRecord.leadSourceContact,
      leadSourceNotes: caseRecord.leadSourceNotes,
    });
  }

  async function handleEdit() {
    if (!editDialog.caseId) return;
    setEditing(true);
    try {
      const response = await fetch("/api/sheets/cases", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId: editDialog.caseId,
          caseName: editDialog.caseName.trim(),
          projectAddress: editDialog.projectAddress.trim(),
          leadSource: editDialog.leadSource,
          leadSourceDetail: shouldShowLeadSourceDetail(editDialog.leadSource) ? editDialog.leadSourceDetail.trim() : "",
          leadSourceContact: editDialog.leadSourceContact.trim(),
          leadSourceNotes: editDialog.leadSourceNotes.trim(),
        }),
      });

      if (!response.ok) throw new Error("更新失敗");

      const caseId = editDialog.caseId;

      // Close dialog and reload cases
      setEditDialog({
        open: false,
        caseId: "",
        caseName: "",
        projectAddress: "",
        leadSource: "unknown",
        leadSourceDetail: "",
        leadSourceContact: "",
        leadSourceNotes: "",
      });

      // Clear cached details for this case to force reload
      setDetails((prev) => {
        const next = { ...prev };
        delete next[caseId];
        return next;
      });

      await loadCases();

      // If the case is expanded, reload its details
      if (expandedCaseIds.has(caseId)) {
        await loadCaseDetails(caseId);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "更新失敗");
    } finally {
      setEditing(false);
    }
  }

  function openDeleteDialog(caseId: string, caseName: string) {
    setDeleteDialog({ open: true, caseId, caseName });
  }

  async function handleDelete() {
    if (!deleteDialog.caseId) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/sheets/cases?caseId=${encodeURIComponent(deleteDialog.caseId)}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("刪除失敗");

      const result = await response.json();
      alert(
        `已刪除案件及相關資料：\n` +
        `- 案件：1 筆\n` +
        `- 報價方案：${result.deleted?.quotes ?? 0} 筆\n` +
        `- 報價版本：${result.deleted?.versions ?? 0} 筆\n` +
        `- 明細項目：${result.deleted?.lines ?? 0} 筆`
      );

      setDeleteDialog({ open: false, caseId: "", caseName: "" });
      await loadCases();
    } catch (err) {
      alert(err instanceof Error ? err.message : "刪除失敗");
    } finally {
      setDeleting(false);
    }
  }

  const casesWithNames = useMemo(() => {
    return cases.filter((item) => item.caseName?.trim());
  }, [cases]);

  const filtered = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return casesWithNames;
    return casesWithNames.filter((item) => {
      return [
        item.caseName,
        item.clientNameSnapshot,
        item.contactNameSnapshot,
        item.caseId,
        LEAD_SOURCE_LABELS[item.leadSource ?? "unknown"]?.label ?? "",
        item.leadSourceDetail ?? "",
        item.leadSourceContact ?? "",
        item.leadSourceNotes ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [casesWithNames, searchText]);

  const filteredBySource = useMemo(() => {
    if (leadSourceFilter === "all") return filtered;
    return filtered.filter((item) => (item.leadSource ?? "unknown") === leadSourceFilter);
  }, [filtered, leadSourceFilter]);

  const sorted = useMemo(() => {
    return [...filteredBySource].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [filteredBySource]);

  const sourceBreakdown = useMemo(() => {
    const total = sorted.length;
    return LEAD_SOURCE_OPTIONS.map((source) => {
      const count = sorted.filter((item) => (item.leadSource ?? "unknown") === source).length;
      return {
        source,
        count,
        ratio: total === 0 ? 0 : count / total,
      };
    }).filter((entry) => entry.count > 0);
  }, [sorted]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">案件紀錄</h1>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            {loading ? "載入中..." : `${sorted.length} 筆案件`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={loading} onClick={() => void loadCases()}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            重新載入
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            新增案件
          </Button>
        </div>
      </div>

      <div className="card-surface rounded-[var(--radius-lg)] px-4 py-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="w-full max-w-md">
            <Label>搜尋</Label>
            <Input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="搜尋案件名稱 / 客戶 / 案件編號"
            />
          </div>
          <div className="w-full max-w-xs">
            <Label>案件來源</Label>
            <Select value={leadSourceFilter} onValueChange={(value) => setLeadSourceFilter(value as "all" | LeadSource)}>
              <SelectTrigger>
                <SelectValue placeholder="全部來源" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部來源</SelectItem>
                {LEAD_SOURCE_OPTIONS.map((source) => (
                  <SelectItem key={source} value={source}>
                    {LEAD_SOURCE_LABELS[source].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {!loading && sorted.length > 0 && (
        <div className="card-surface rounded-[var(--radius-lg)] px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-[var(--text-primary)]">案件來源分布</div>
              <div className="mt-0.5 text-xs text-[var(--text-secondary)]">依目前列表即時彙整</div>
            </div>
            <div className="text-xs text-[var(--text-secondary)]">{sorted.length} 筆案件</div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {sourceBreakdown.map((entry) => (
              <div
                key={entry.source}
                className="rounded-full border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-1.5 text-xs text-[var(--text-primary)]"
              >
                {LEAD_SOURCE_LABELS[entry.source].label} {entry.count} 筆 ({Math.round(entry.ratio * 100)}%)
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card-surface overflow-hidden rounded-[var(--radius-lg)]">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-[var(--text-secondary)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            載入中...
          </div>
        ) : sorted.length === 0 ? (
          <div className="py-12 text-center text-sm text-[var(--text-secondary)]">尚無案件資料</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="w-12 px-4 py-2.5" />
                  <th className="px-4 py-2.5">案件名稱</th>
                  <th className="px-4 py-2.5">客戶</th>
                  <th className="px-4 py-2.5">來源</th>
                  <th className="w-28 px-4 py-2.5">狀態</th>
                  <th className="px-4 py-2.5">最近送出</th>
                  <th className="px-4 py-2.5">下次追蹤</th>
                  <th className="px-4 py-2.5">建立日期</th>
                  <th className="w-16 px-4 py-2.5 text-center">操作</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((item) => {
                  const status = CASE_STATUS_MAP[item.caseStatus] ?? CASE_STATUS_MAP.new;
                  const isExpanded = expandedCaseIds.has(item.caseId);
                  const detail = details[item.caseId];
                  const detailLoading = loadingDetails[item.caseId];

                  return (
                    <Fragment key={item.caseId}>
                      <tr
                        id={`case-row-${item.caseId}`}
                        className="cursor-pointer"
                        onClick={() => toggleCase(item.caseId)}
                      >
                        <td className="px-4 py-2.5 text-center text-[var(--text-tertiary)]">
                          {isExpanded ? <ChevronDown className="mx-auto h-4 w-4" /> : <ChevronRight className="mx-auto h-4 w-4" />}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-[var(--text-primary)]">{item.caseName || "—"}</div>
                          <div className="mt-0.5 text-xs text-[var(--text-secondary)]">{item.caseId}</div>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="text-sm text-[var(--text-primary)]">{item.clientNameSnapshot || "—"}</div>
                          {item.contactNameSnapshot && (
                            <div className="text-xs text-[var(--text-secondary)]">{item.contactNameSnapshot}</div>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-[var(--text-primary)]">
                          <div>{LEAD_SOURCE_LABELS[item.leadSource ?? "unknown"]?.label ?? "未分類"}</div>
                          {item.leadSourceDetail && (
                            <div className="mt-0.5 text-xs text-[var(--text-secondary)]">
                              {item.leadSourceDetail}
                            </div>
                          )}
                          {item.leadSourceContact && (
                            <div className="mt-0.5 text-xs text-[var(--text-secondary)]">
                              {item.leadSourceContact}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`badge ${status.className}`}>{status.label}</span>
                        </td>
                        <td className="px-4 py-2.5 text-sm">{item.latestSentAt || "—"}</td>
                        <td className="px-4 py-2.5 text-sm">{item.nextFollowUpDate || "—"}</td>
                        <td className="px-4 py-2.5 text-sm">{item.createdAt ? item.createdAt.slice(0, 10) : "—"}</td>
                        <td className="px-4 py-2.5 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditDialog(item);
                              }}
                              className="text-[var(--text-tertiary)] hover:text-blue-500 transition-colors"
                              title="編輯案件"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openDeleteDialog(item.caseId, item.caseName);
                              }}
                              className="text-[var(--text-tertiary)] hover:text-red-500 transition-colors"
                              title="刪除案件"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr>
                          <td colSpan={9} className="bg-[var(--bg-subtle)] px-4 py-3">
                            {detailLoading ? (
                              <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                讀取方案與版本中...
                              </div>
                            ) : !detail ? (
                              <div className="text-sm text-[var(--text-secondary)]">讀取案件詳情失敗，請再試一次</div>
                            ) : (
                              <div className="space-y-3">
                                <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-sm">
                                  <div className="flex flex-wrap gap-x-6 gap-y-2">
                                    <div>
                                      <div className="text-xs text-[var(--text-secondary)]">案件來源</div>
                                      <div className="font-medium text-[var(--text-primary)]">
                                        {LEAD_SOURCE_LABELS[detail.case.leadSource ?? "unknown"]?.label ?? "未分類"}
                                      </div>
                                    </div>
                                    <div>
                                      <div className="text-xs text-[var(--text-secondary)]">來源細項</div>
                                      <div className="font-medium text-[var(--text-primary)]">
                                        {detail.case.leadSourceDetail || "—"}
                                      </div>
                                    </div>
                                    <div>
                                      <div className="text-xs text-[var(--text-secondary)]">來源人 / 介紹人</div>
                                      <div className="font-medium text-[var(--text-primary)]">
                                        {detail.case.leadSourceContact || "—"}
                                      </div>
                                    </div>
                                  </div>
                                  {detail.case.leadSourceNotes && (
                                    <div className="mt-3">
                                      <div className="text-xs text-[var(--text-secondary)]">來源備註</div>
                                      <div className="mt-1 whitespace-pre-wrap text-sm text-[var(--text-primary)]">
                                        {detail.case.leadSourceNotes}
                                      </div>
                                    </div>
                                  )}
                                </div>
                                <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-sm">
                                  {(() => {
                                    // Find best version for comparison: accepted > sent > latest
                                    const allVersions = detail.quotes.flatMap(q => q.versions);
                                    const compareVersion =
                                      allVersions.find(v => v.versionStatus === "accepted") ??
                                      allVersions.find(v => v.versionStatus === "sent") ??
                                      allVersions[0];

                                    const actualCost = detail.purchaseSummary.totalOrderAmount;
                                    const hasComparison = compareVersion && actualCost > 0;
                                    const estimatedCost = compareVersion?.estimatedCostTotal ?? 0;
                                    const quotedPrice = compareVersion?.totalAmount ?? 0;
                                    const costDiff = actualCost - estimatedCost;
                                    const actualMargin = quotedPrice - actualCost;
                                    const estimatedMargin = quotedPrice - estimatedCost;
                                    const marginDiff = actualMargin - estimatedMargin;

                                    return hasComparison ? (
                                      <div className="mb-3 rounded-[var(--radius-sm)] bg-blue-50 border border-blue-200 p-3">
                                        <div className="text-xs font-semibold text-blue-900 mb-2">
                                          成本對比 <span className="font-normal text-blue-700">（vs {compareVersion.versionId}）</span>
                                        </div>
                                        <div className="grid grid-cols-3 gap-2 text-xs">
                                          <div>
                                            <div className="text-blue-700">預估成本</div>
                                            <div className="font-mono font-semibold text-blue-900">${estimatedCost.toLocaleString()}</div>
                                          </div>
                                          <div>
                                            <div className="text-blue-700">實際成本</div>
                                            <div className="font-mono font-semibold text-blue-900">${actualCost.toLocaleString()}</div>
                                          </div>
                                          <div>
                                            <div className="text-blue-700">差異</div>
                                            <div className={`font-mono font-semibold ${costDiff > 0 ? "text-red-600" : costDiff < 0 ? "text-green-600" : "text-blue-900"}`}>
                                              {costDiff > 0 ? "+" : ""}{costDiff.toLocaleString()}
                                            </div>
                                          </div>
                                        </div>
                                        <div className="mt-2 pt-2 border-t border-blue-200 grid grid-cols-3 gap-2 text-xs">
                                          <div>
                                            <div className="text-blue-700">預估毛利</div>
                                            <div className="font-mono font-semibold text-green-700">${estimatedMargin.toLocaleString()}</div>
                                          </div>
                                          <div>
                                            <div className="text-blue-700">實際毛利</div>
                                            <div className="font-mono font-semibold text-green-700">${actualMargin.toLocaleString()}</div>
                                          </div>
                                          <div>
                                            <div className="text-blue-700">毛利差</div>
                                            <div className={`font-mono font-semibold ${marginDiff >= 0 ? "text-green-600" : "text-red-600"}`}>
                                              {marginDiff > 0 ? "+" : ""}{marginDiff.toLocaleString()}
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    ) : null;
                                  })()}
                                  <div className="flex items-center justify-between gap-3">
                                    <div>
                                      <div className="text-sm font-semibold text-[var(--text-primary)]">採購成本</div>
                                      <div className="mt-0.5 text-xs text-[var(--text-secondary)]">依關聯採購單彙整</div>
                                    </div>
                                    <div className="text-right">
                                      <div className="text-xs text-[var(--text-secondary)]">採購總額</div>
                                      <div className="text-base font-semibold text-[var(--text-primary)]">
                                        {detail.purchaseSummary.totalOrderAmount.toLocaleString()}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                                    <div className="rounded-[var(--radius-sm)] bg-[var(--bg-subtle)] px-3 py-2">
                                      <div className="text-xs text-[var(--text-secondary)]">採購單數</div>
                                      <div className="mt-1 font-medium text-[var(--text-primary)]">{detail.purchaseSummary.orderCount}</div>
                                    </div>
                                    <div className="rounded-[var(--radius-sm)] bg-[var(--bg-subtle)] px-3 py-2">
                                      <div className="text-xs text-[var(--text-secondary)]">採購品項數</div>
                                      <div className="mt-1 font-medium text-[var(--text-primary)]">{detail.purchaseSummary.itemCount}</div>
                                    </div>
                                    <div className="rounded-[var(--radius-sm)] bg-[var(--bg-subtle)] px-3 py-2">
                                      <div className="text-xs text-[var(--text-secondary)]">材料小計</div>
                                      <div className="mt-1 font-medium text-[var(--text-primary)]">
                                        {detail.purchaseSummary.totalItemAmount.toLocaleString()}
                                      </div>
                                    </div>
                                  </div>

                                  {detail.purchases.length > 0 ? (
                                    <div className="mt-3 overflow-x-auto">
                                      <table className="w-full border-collapse text-sm">
                                        <thead>
                                          <tr className="border-b border-[var(--border)] text-xs text-[var(--text-secondary)]">
                                            <th className="px-2 py-2 text-left">採購單</th>
                                            <th className="px-2 py-2 text-left">廠商</th>
                                            <th className="px-2 py-2 text-left">狀態</th>
                                            <th className="px-2 py-2 text-right">材料小計</th>
                                            <th className="px-2 py-2 text-right">採購總額</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {detail.purchases.map((purchase) => (
                                            <tr key={purchase.order.orderId} className="border-b border-[var(--border)] last:border-b-0">
                                              <td className="px-2 py-2">
                                                <div className="font-medium text-[var(--text-primary)]">{purchase.order.orderId}</div>
                                                <div className="mt-0.5 text-xs text-[var(--text-secondary)]">
                                                  {purchase.order.orderDate || "—"}
                                                </div>
                                              </td>
                                              <td className="px-2 py-2 text-[var(--text-primary)]">{purchase.supplierName || "—"}</td>
                                              <td className="px-2 py-2 text-[var(--text-primary)]">{purchase.order.status || "—"}</td>
                                              <td className="px-2 py-2 text-right font-medium text-[var(--text-primary)]">
                                                {purchase.itemSubtotal.toLocaleString()}
                                              </td>
                                              <td className="px-2 py-2 text-right font-medium text-[var(--text-primary)]">
                                                {purchase.order.totalAmount.toLocaleString()}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  ) : (
                                    <div className="mt-3 text-sm text-[var(--text-secondary)]">此案件尚無關聯採購單</div>
                                  )}
                                </div>
                                {detail.quotes.length === 0 ? (
                                  <div className="text-sm text-[var(--text-secondary)]">此案件尚無報價方案</div>
                                ) : detail.quotes.map(({ quote, versions }) => (
                                  <div key={quote.quoteId} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
                                    <div className="flex items-center justify-between gap-3">
                                      <div>
                                        <div className="text-sm font-semibold text-[var(--text-primary)]">
                                          {quote.quoteName || quote.quoteId}
                                        </div>
                                        <div className="mt-0.5 text-xs text-[var(--text-secondary)]">
                                          報價 ID: {quote.quoteId} · 目前版本: {quote.currentVersionId || "—"}
                                        </div>
                                      </div>
                                    </div>

                                    <div className="mt-3 overflow-x-auto">
                                      <table className="w-full border-collapse text-sm">
                                        <thead>
                                          <tr className="border-b border-[var(--border)] text-xs text-[var(--text-secondary)]">
                                            <th className="px-2 py-2 text-left">版本</th>
                                            <th className="px-2 py-2 text-left">日期</th>
                                            <th className="px-2 py-2 text-left">狀態</th>
                                            <th className="px-2 py-2 text-right">金額</th>
                                            <th className="w-16 px-2 py-2 text-center">操作</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {versions
                                            .slice()
                                            .sort((a, b) => b.versionNo - a.versionNo)
                                            .map((version) => {
                                              const versionStatus =
                                                VERSION_STATUS_MAP[version.versionStatus] ?? VERSION_STATUS_MAP.draft;
                                              return (
                                                <tr
                                                  key={version.versionId}
                                                  className="cursor-pointer border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--bg-subtle)]"
                                                  onClick={() => openVersion(version.versionId, item.caseId, quote.quoteId)}
                                                >
                                                  <td className="px-2 py-2 font-medium text-[var(--accent)]">
                                                    V{version.versionNo} {version.versionLabel}
                                                  </td>
                                                  <td className="px-2 py-2 text-[var(--text-secondary)]">{version.quoteDate || "—"}</td>
                                                  <td className="px-2 py-2">
                                                    <span className={`badge ${versionStatus.className}`}>{versionStatus.label}</span>
                                                  </td>
                                                  <td className="px-2 py-2 text-right font-medium text-[var(--text-primary)]">
                                                    {version.totalAmount.toLocaleString()}
                                                  </td>
                                                  <td className="px-2 py-2 text-center">
                                                    <Button
                                                      variant="ghost"
                                                      size="sm"
                                                      className="h-7 w-7 p-0"
                                                      title="複製版本"
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        openCopyDialog(
                                                          version.versionId,
                                                          item.caseId,
                                                          quote.quoteId,
                                                          item.caseName,
                                                        );
                                                      }}
                                                    >
                                                      <Copy className="h-3.5 w-3.5" />
                                                    </Button>
                                                  </td>
                                                </tr>
                                              );
                                            })}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
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

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg p-0">
          <DialogHeader>
            <DialogTitle>建立新案件</DialogTitle>
            <DialogDescription>先建立案件，再到報價編輯器建立第一個版本。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 px-6 py-4">
            <div>
              <Label>案件名稱</Label>
              <Input
                value={newCaseName}
                onChange={(e) => setNewCaseName(e.target.value)}
                placeholder="例如：林宅客廳坐墊更換"
              />
            </div>
            <div>
              <Label>客戶（選填）</Label>
              <Select value={newCaseClientId} onValueChange={setNewCaseClientId}>
                <SelectTrigger>
                  <SelectValue placeholder={clientsLoading ? "載入中..." : "選擇客戶"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">不指定客戶</SelectItem>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.companyName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>案件來源</Label>
              <Select
                value={newCaseLeadSource}
                onValueChange={(value) => {
                  const nextSource = value as LeadSource;
                  setNewCaseLeadSource(nextSource);
                  if (!shouldShowLeadSourceDetail(nextSource)) {
                    setNewCaseLeadSourceDetail("");
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="選擇案件來源" />
                </SelectTrigger>
                <SelectContent>
                  {LEAD_SOURCE_OPTIONS.map((source) => (
                    <SelectItem key={source} value={source}>
                      {LEAD_SOURCE_LABELS[source].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {shouldShowLeadSourceDetail(newCaseLeadSource) && (
              <div>
                <Label>來源細項</Label>
                <Input
                  value={newCaseLeadSourceDetail}
                  onChange={(e) => setNewCaseLeadSourceDetail(e.target.value)}
                  placeholder="例如：BNI、扶輪社、綠裝修協會"
                />
              </div>
            )}
            <div>
              <Label>來源人 / 介紹人</Label>
              <Input
                value={newCaseLeadSourceContact}
                onChange={(e) => setNewCaseLeadSourceContact(e.target.value)}
                placeholder="例如：王設計師 / 李先生 / Google 地圖"
              />
            </div>
            <div>
              <Label>來源備註</Label>
              <Input
                value={newCaseLeadSourceNotes}
                onChange={(e) => setNewCaseLeadSourceNotes(e.target.value)}
                placeholder="例如：舊客設計師轉介紹屋主爸爸翻修案"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button disabled={creating} onClick={() => void handleCreateCase()}>
              {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Briefcase className="h-3.5 w-3.5" />}
              {creating ? "建立中..." : "建立案件"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={copyDialog.open}
        onOpenChange={(open) => {
          if (!copying) {
            setCopyDialog((prev) => ({ ...prev, open }));
          }
        }}
      >
        <DialogContent className="max-w-md p-0">
          <DialogHeader>
            <DialogTitle>複製版本</DialogTitle>
            <DialogDescription>
              選擇要建立新版本、新報價方案，或建立新案件。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 px-6 py-4">
            <Button className="w-full justify-start" disabled={copying} onClick={() => void handleCopy("new_version")}>
              <Copy className="h-3.5 w-3.5" />
              建立新版本（議價調整）
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              disabled={copying}
              onClick={() => void handleCopy("new_quote_same_case")}
            >
              <Plus className="h-3.5 w-3.5" />
              新增報價方案（同案件，例如：客廳/臥室）
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              disabled={copying}
              onClick={() => void handleCopy("use_as_template")}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              套用為新報價（新案子）
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editDialog.open}
        onOpenChange={(open) => {
          if (!editing) {
            setEditDialog((prev) => ({ ...prev, open }));
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>編輯案件資訊</DialogTitle>
            <DialogDescription>
              修改案件名稱、地址和來源資訊
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>案件名稱 *</Label>
              <Input
                value={editDialog.caseName}
                onChange={(e) => setEditDialog((prev) => ({ ...prev, caseName: e.target.value }))}
                placeholder="請輸入案件名稱"
              />
            </div>
            <div>
              <Label>專案地址</Label>
              <Input
                value={editDialog.projectAddress}
                onChange={(e) => setEditDialog((prev) => ({ ...prev, projectAddress: e.target.value }))}
                placeholder="請輸入專案地址"
              />
            </div>
            <div>
              <Label>案件來源</Label>
              <Select
                value={editDialog.leadSource}
                onValueChange={(value) =>
                  setEditDialog((prev) => ({
                    ...prev,
                    leadSource: value as LeadSource,
                    leadSourceDetail: shouldShowLeadSourceDetail(value as LeadSource) ? prev.leadSourceDetail : "",
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="請選擇案件來源" />
                </SelectTrigger>
                <SelectContent>
                  {LEAD_SOURCE_OPTIONS.map((source) => (
                    <SelectItem key={source} value={source}>
                      {LEAD_SOURCE_LABELS[source].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {shouldShowLeadSourceDetail(editDialog.leadSource) && (
              <div>
                <Label>來源細項</Label>
                <Input
                  value={editDialog.leadSourceDetail}
                  onChange={(e) => setEditDialog((prev) => ({ ...prev, leadSourceDetail: e.target.value }))}
                  placeholder="例如：BNI、扶輪社、綠裝修協會"
                />
              </div>
            )}
            <div>
              <Label>來源人 / 介紹人</Label>
              <Input
                value={editDialog.leadSourceContact}
                onChange={(e) => setEditDialog((prev) => ({ ...prev, leadSourceContact: e.target.value }))}
                placeholder="例如：張小姐、李設計師"
              />
            </div>
            <div>
              <Label>來源備註</Label>
              <Input
                value={editDialog.leadSourceNotes}
                onChange={(e) => setEditDialog((prev) => ({ ...prev, leadSourceNotes: e.target.value }))}
                placeholder="例如：透過 FB 私訊詢問"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                setEditDialog({
                  open: false,
                  caseId: "",
                   caseName: "",
                   projectAddress: "",
                   leadSource: "unknown",
                   leadSourceDetail: "",
                   leadSourceContact: "",
                   leadSourceNotes: "",
                 })
              }
              disabled={editing}
            >
              取消
            </Button>
            <Button onClick={() => void handleEdit()} disabled={editing || !editDialog.caseName.trim()}>
              {editing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pencil className="h-3.5 w-3.5" />}
              {editing ? "儲存中..." : "儲存變更"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteDialog.open}
        onOpenChange={(open) => {
          if (!deleting) {
            setDeleteDialog((prev) => ({ ...prev, open }));
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>確認刪除案件</DialogTitle>
            <DialogDescription>
              確定要刪除案件「{deleteDialog.caseName}」嗎？
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-300">
              <p className="font-semibold">⚠️ 警告：此操作無法復原</p>
              <p className="mt-1">刪除案件將會同時刪除：</p>
              <ul className="mt-2 ml-4 list-disc space-y-1">
                <li>所有報價方案</li>
                <li>所有報價版本</li>
                <li>所有報價明細</li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog({ open: false, caseId: "", caseName: "" })} disabled={deleting}>
              取消
            </Button>
            <Button variant="destructive" onClick={() => void handleDelete()} disabled={deleting}>
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              {deleting ? "刪除中..." : "確定刪除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
