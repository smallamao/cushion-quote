"use client";

import { Briefcase, ChevronDown, ChevronRight, Copy, ExternalLink, Loader2, Plus, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

import { useClients } from "@/hooks/useClients";
import { LEAD_SOURCE_LABELS, LEAD_SOURCE_OPTIONS } from "@/lib/constants";
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
  const { clients, loading: clientsLoading } = useClients();

  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [expandedCaseIds, setExpandedCaseIds] = useState<Set<string>>(new Set());
  const [details, setDetails] = useState<Record<string, CaseDetailPayload>>({});
  const [loadingDetails, setLoadingDetails] = useState<Record<string, boolean>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [newCaseName, setNewCaseName] = useState("");
  const [newCaseClientId, setNewCaseClientId] = useState("none");
  const [newCaseLeadSource, setNewCaseLeadSource] = useState<LeadSource>("unknown");
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

  async function loadCaseDetails(caseId: string) {
    if (details[caseId] || loadingDetails[caseId]) return;
    setLoadingDetails((prev) => ({ ...prev, [caseId]: true }));
    try {
      const response = await fetch(`/api/sheets/cases/${encodeURIComponent(caseId)}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("讀取案件失敗");
      const payload = (await response.json()) as CaseDetailPayload;
      setDetails((prev) => ({ ...prev, [caseId]: payload }));
    } catch {
      setDetails((prev) => ({
        ...prev,
        [caseId]: {
          case:
            cases.find((item) => item.caseId === caseId) ??
            cases[0] ?? {
              caseId,
              caseName: "",
              clientId: "",
              clientNameSnapshot: "",
              contactNameSnapshot: "",
              phoneSnapshot: "",
              projectAddress: "",
              channelSnapshot: "retail",
              leadSource: "unknown",
              leadSourceContact: "",
              leadSourceNotes: "",
              caseStatus: "new",
              inquiryDate: "",
              latestQuoteId: "",
              latestVersionId: "",
              latestSentAt: "",
              nextFollowUpDate: "",
              lastFollowUpAt: "",
              wonVersionId: "",
              lostReason: "",
              internalNotes: "",
              createdAt: "",
              updatedAt: "",
            },
          quotes: [],
        },
      }));
    } finally {
      setLoadingDetails((prev) => ({ ...prev, [caseId]: false }));
    }
  }

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
          leadSourceContact: newCaseLeadSourceContact.trim(),
          leadSourceNotes: newCaseLeadSourceNotes.trim(),
        }),
      });
      if (!response.ok) throw new Error("新增案件失敗");
      setCreateOpen(false);
      setNewCaseName("");
      setNewCaseClientId("none");
      setNewCaseLeadSource("unknown");
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
    sessionStorage.setItem("quote-to-load", JSON.stringify({ caseId, quoteId, versionId }));
    router.push("/");
  }

  function openCopyDialog(sourceVersionId: string, caseId: string, quoteId: string, caseName: string) {
    setCopyDialog({ open: true, sourceVersionId, caseId, quoteId, caseName });
  }

  async function handleCopy(action: "new_version" | "use_as_template") {
    if (!copyDialog.sourceVersionId) return;
    setCopying(true);
    try {
      const response = await fetch("/api/sheets/versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "new_version"
            ? { action: "new_version", basedOnVersionId: copyDialog.sourceVersionId }
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
        sessionStorage.setItem(
          "quote-to-load",
          JSON.stringify({
            caseId: copyDialog.caseId,
            quoteId: copyDialog.quoteId,
            versionId: payload.versionId,
          }),
        );
        router.push("/");
        return;
      }

      if (action === "use_as_template" && payload.caseId && payload.quoteId && payload.versionId) {
        sessionStorage.setItem(
          "quote-to-load",
          JSON.stringify({
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

  const filtered = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return cases;
    return cases.filter((item) => {
      return [
        item.caseName,
        item.clientNameSnapshot,
        item.caseId,
        LEAD_SOURCE_LABELS[item.leadSource ?? "unknown"]?.label ?? "",
        item.leadSourceContact ?? "",
        item.leadSourceNotes ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [cases, searchText]);

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
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">案件管理</h1>
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
                      </tr>

                      {isExpanded && (
                        <tr>
                          <td colSpan={8} className="bg-[var(--bg-subtle)] px-4 py-3">
                            {detailLoading ? (
                              <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                讀取方案與版本中...
                              </div>
                            ) : !detail || detail.quotes.length === 0 ? (
                              <div className="text-sm text-[var(--text-secondary)]">此案件尚無報價方案</div>
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
                                {detail.quotes.map(({ quote, versions }) => (
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
              <Select value={newCaseLeadSource} onValueChange={(value) => setNewCaseLeadSource(value as LeadSource)}>
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
              選擇要建立同案新版本，或以此版本建立新的案件報價。
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
              onClick={() => void handleCopy("use_as_template")}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              套用為新報價（新案子）
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
