"use client";

import { Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useIsMobile } from "@/hooks/useIsMobile";

import type { CommissionSettlement, SettlementStatus } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type FilterStatus = SettlementStatus | "all";

interface VersionLite {
  quoteId: string;
  versionNo: number;
  commissionRate: number;
}

const STATUS_META: Record<SettlementStatus, { label: string; className: string }> = {
  pending: { label: "待付", className: "badge-draft" },
  paid: { label: "已付", className: "badge-accepted" },
  cancelled: { label: "已沖銷", className: "badge-rejected" },
};

const ROLE_LABELS: Record<CommissionSettlement["partnerRole"], string> = {
  designer: "設計",
  installer: "工班",
  referrer: "介紹人",
  other: "其他",
};

const MONTH_SCALE_BASE = 220;

function monthKey(dateText: string): string {
  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function displayDate(dateText: string): string {
  if (!dateText) return "—";
  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) return dateText;
  return date.toISOString().slice(0, 10);
}

function nowMonthKey(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function quarterStart(date = new Date()): Date {
  const quarterMonth = Math.floor(date.getMonth() / 3) * 3;
  return new Date(date.getFullYear(), quarterMonth, 1);
}

function getLast6MonthKeys(): string[] {
  const result: string[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
  }
  return result;
}

export function CommissionsClient() {
  const isMobile = useIsMobile();
  const [settlements, setSettlements] = useState<CommissionSettlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");

  const [editing, setEditing] = useState<CommissionSettlement | null>(null);
  const [editingStatus, setEditingStatus] = useState<SettlementStatus>("pending");
  const [editingPaidAt, setEditingPaidAt] = useState("");
  const [editingPaymentMethod, setEditingPaymentMethod] = useState("");
  const [editingReceiptNotes, setEditingReceiptNotes] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingEdit, setDeletingEdit] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [savingCreate, setSavingCreate] = useState(false);
  const [draftQuoteId, setDraftQuoteId] = useState("");
  const [draftVersionId, setDraftVersionId] = useState("");
  const [draftCaseId, setDraftCaseId] = useState("");
  const [draftPartnerName, setDraftPartnerName] = useState("");
  const [draftPartnerId, setDraftPartnerId] = useState("");
  const [draftPartnerRole, setDraftPartnerRole] = useState<CommissionSettlement["partnerRole"]>("other");
  const [draftMode, setDraftMode] = useState<CommissionSettlement["commissionMode"]>("none");
  const [draftRate, setDraftRate] = useState(0);
  const [draftAmount, setDraftAmount] = useState(0);

  const [versions, setVersions] = useState<VersionLite[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [settlementRes, versionRes] = await Promise.all([
        fetch("/api/sheets/settlements", { cache: "no-store" }),
        fetch("/api/sheets/versions", { cache: "no-store" }),
      ]);

      if (!settlementRes.ok) throw new Error("載入結算失敗");
      const settlementPayload = (await settlementRes.json()) as { settlements: CommissionSettlement[] };
      setSettlements(settlementPayload.settlements);

      if (versionRes.ok) {
        const versionPayload = (await versionRes.json()) as {
          versions: Array<{ quoteId: string; versionNo: number; commissionRate: number }>;
        };
        setVersions(versionPayload.versions.map((item) => ({
          quoteId: item.quoteId,
          versionNo: item.versionNo,
          commissionRate: Number(item.commissionRate ?? 0),
        })));
      } else {
        setVersions([]);
      }
    } catch {
      setSettlements([]);
      setVersions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    return settlements.filter((item) => {
      if (filterStatus !== "all" && item.settlementStatus !== filterStatus) return false;
      if (!query) return true;
      return [item.partnerName, item.quoteId].join(" ").toLowerCase().includes(query);
    });
  }, [filterStatus, searchText, settlements]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [filtered]);

  const pendingTotal = useMemo(
    () => settlements.filter((item) => item.settlementStatus === "pending").reduce((sum, item) => sum + item.commissionAmount, 0),
    [settlements],
  );

  const monthPaidTotal = useMemo(() => {
    const month = nowMonthKey();
    return settlements
      .filter((item) => item.settlementStatus === "paid" && monthKey(item.paidAt || item.updatedAt) === month)
      .reduce((sum, item) => sum + item.commissionAmount, 0);
  }, [settlements]);

  const quarterPaidTotal = useMemo(() => {
    const start = quarterStart();
    return settlements
      .filter((item) => {
        if (item.settlementStatus !== "paid") return false;
        const paidDate = new Date(item.paidAt || item.updatedAt);
        if (Number.isNaN(paidDate.getTime())) return false;
        return paidDate >= start;
      })
      .reduce((sum, item) => sum + item.commissionAmount, 0);
  }, [settlements]);

  const avgCommissionRate = useMemo(() => {
    if (versions.length === 0) return 0;
    const latestMap = new Map<string, VersionLite>();
    versions.forEach((item) => {
      const current = latestMap.get(item.quoteId);
      if (!current || item.versionNo > current.versionNo) {
        latestMap.set(item.quoteId, item);
      }
    });
    const latest = [...latestMap.values()];
    if (latest.length === 0) return 0;
    return latest.reduce((sum, item) => sum + item.commissionRate, 0) / latest.length;
  }, [versions]);

  const byPartner = useMemo(() => {
    const map = new Map<string, {
      name: string;
      quoteIds: Set<string>;
      total: number;
      pending: number;
      paid: number;
    }>();

    settlements.forEach((item) => {
      const key = item.partnerId || item.partnerName || "未填合作方";
      const current = map.get(key) ?? {
        name: item.partnerName || "未填合作方",
        quoteIds: new Set<string>(),
        total: 0,
        pending: 0,
        paid: 0,
      };
      current.quoteIds.add(item.quoteId);
      current.total += item.commissionAmount;
      if (item.settlementStatus === "pending") current.pending += item.commissionAmount;
      if (item.settlementStatus === "paid") current.paid += item.commissionAmount;
      map.set(key, current);
    });

    return [...map.values()]
      .map((item) => ({
        name: item.name,
        quoteCount: item.quoteIds.size,
        total: item.total,
        pending: item.pending,
        paid: item.paid,
      }))
      .sort((a, b) => b.total - a.total);
  }, [settlements]);

  const byMonth = useMemo(() => {
    const keys = getLast6MonthKeys();
    const rows = keys.map((key) => ({
      month: key,
      total: 0,
      paid: 0,
      pending: 0,
    }));
    const rowMap = new Map(rows.map((row) => [row.month, row]));

    settlements.forEach((item) => {
      const key = monthKey(item.createdAt || item.updatedAt);
      const target = rowMap.get(key);
      if (!target) return;
      target.total += item.commissionAmount;
      if (item.settlementStatus === "paid") target.paid += item.commissionAmount;
      if (item.settlementStatus === "pending") target.pending += item.commissionAmount;
    });

    const maxValue = rows.reduce((max, row) => Math.max(max, row.total), 0);
    return rows.map((row) => ({
      ...row,
      barWidth: maxValue === 0 ? 0 : Math.round((row.total / maxValue) * MONTH_SCALE_BASE),
    }));
  }, [settlements]);

  function openEdit(item: CommissionSettlement) {
    setEditing(item);
    setEditingStatus(item.settlementStatus);
    setEditingPaidAt(item.paidAt || "");
    setEditingPaymentMethod(item.paymentMethod || "");
    setEditingReceiptNotes(item.receiptNotes || "");
  }

  async function deleteSettlement() {
    if (!editing) return;
    if (!confirm(`確定刪除這筆結算紀錄（${editing.partnerName}・${formatCurrency(editing.commissionAmount)}）？`)) return;
    setDeletingEdit(true);
    try {
      const response = await fetch(`/api/sheets/settlements?settlementId=${encodeURIComponent(editing.settlementId)}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("刪除失敗");
      setEditing(null);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "刪除失敗");
    } finally {
      setDeletingEdit(false);
    }
  }

  async function submitEdit() {
    if (!editing) return;
    setSavingEdit(true);
    try {
      const response = await fetch("/api/sheets/settlements", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settlementId: editing.settlementId,
          settlementStatus: editingStatus,
          paidAt: editingStatus === "paid" ? editingPaidAt : "",
          paymentMethod: editingPaymentMethod,
          receiptNotes: editingReceiptNotes,
        }),
      });
      if (!response.ok) throw new Error("更新結算失敗");
      setEditing(null);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "更新結算失敗");
    } finally {
      setSavingEdit(false);
    }
  }

  async function submitCreate() {
    if (!draftQuoteId.trim()) {
      alert("請輸入報價單號");
      return;
    }
    if (!draftPartnerName.trim()) {
      alert("請輸入合作方名稱");
      return;
    }
    if (draftAmount < 0) {
      alert("佣金金額不可小於 0");
      return;
    }

    setSavingCreate(true);
    try {
      const response = await fetch("/api/sheets/settlements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteId: draftQuoteId.trim(),
          versionId: draftVersionId.trim(),
          caseId: draftCaseId.trim(),
          partnerName: draftPartnerName.trim(),
          partnerId: draftPartnerId.trim(),
          partnerRole: draftPartnerRole,
          commissionMode: draftMode,
          commissionRate: draftRate,
          commissionAmount: draftAmount,
          settlementStatus: "pending",
        } satisfies Partial<CommissionSettlement>),
      });
      if (!response.ok) throw new Error("新增結算失敗");

      setCreateOpen(false);
      setDraftQuoteId("");
      setDraftVersionId("");
      setDraftCaseId("");
      setDraftPartnerName("");
      setDraftPartnerId("");
      setDraftPartnerRole("other");
      setDraftMode("none");
      setDraftRate(0);
      setDraftAmount(0);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "新增結算失敗");
    } finally {
      setSavingCreate(false);
    }
  }

  return (
    <Tabs defaultValue="settlements" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">佣金結算</h1>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            {loading ? "載入中..." : `${settlements.length} 筆結算紀錄`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <TabsList>
            <TabsTrigger value="settlements">結算</TabsTrigger>
            <TabsTrigger value="reports">統計</TabsTrigger>
          </TabsList>
          <Button variant="outline" size="sm" disabled={loading} onClick={() => void load()}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            重新載入
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            新增結算
          </Button>
        </div>
      </div>

      <TabsContent value="settlements" className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="card-surface rounded-[var(--radius-lg)] px-5 py-4">
            <div className="text-xs font-medium text-[var(--text-secondary)]">待付總額</div>
            <div className="mt-3 text-2xl font-semibold tracking-tight text-[var(--accent)]">
              {loading ? "..." : formatCurrency(pendingTotal)}
            </div>
          </div>
          <div className="card-surface rounded-[var(--radius-lg)] px-5 py-4">
            <div className="text-xs font-medium text-[var(--text-secondary)]">本月已付總額</div>
            <div className="mt-3 text-2xl font-semibold tracking-tight text-[var(--accent)]">
              {loading ? "..." : formatCurrency(monthPaidTotal)}
            </div>
          </div>
        </div>

        <div className="card-surface rounded-[var(--radius-lg)] px-4 py-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <Input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="搜尋合作方名稱 / 報價單號"
              className="lg:max-w-sm"
            />
            <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as FilterStatus)}>
              <SelectTrigger className="w-full lg:w-48">
                <SelectValue placeholder="全部狀態" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                <SelectItem value="pending">待付</SelectItem>
                <SelectItem value="paid">已付</SelectItem>
                <SelectItem value="cancelled">已沖銷</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="card-surface overflow-hidden rounded-[var(--radius-lg)]">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-[var(--text-secondary)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              載入中...
            </div>
          ) : sorted.length === 0 ? (
            <div className="py-12 text-center text-sm text-[var(--text-secondary)]">尚無結算資料</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="px-4 py-2.5">報價單號</th>
                    <th className="px-4 py-2.5">合作方</th>
                    {!isMobile && <th className="px-4 py-2.5">身份</th>}
                    <th className="px-4 py-2.5 text-right">佣金金額</th>
                    <th className="px-4 py-2.5">狀態</th>
                    {!isMobile && <th className="px-4 py-2.5">付款日期</th>}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((item) => {
                    const statusMeta = STATUS_META[item.settlementStatus] ?? STATUS_META.pending;
                    return (
                      <tr key={item.settlementId} className="cursor-pointer" onClick={() => openEdit(item)}>
                        <td className="px-4 py-2.5 font-mono text-xs">{item.quoteId || "—"}</td>
                        <td className="px-4 py-2.5">
                          <div className="text-sm font-medium text-[var(--text-primary)]">{item.partnerName || "—"}</div>
                          {item.partnerId && <div className="text-xs text-[var(--text-secondary)]">{item.partnerId}</div>}
                        </td>
                        {!isMobile && <td className="px-4 py-2.5 text-sm">{ROLE_LABELS[item.partnerRole] ?? "其他"}</td>}
                        <td className="px-4 py-2.5 text-right text-sm font-medium">{formatCurrency(item.commissionAmount)}</td>
                        <td className="px-4 py-2.5">
                          <span className={`badge ${statusMeta.className}`}>{statusMeta.label}</span>
                        </td>
                        {!isMobile && <td className="px-4 py-2.5 text-sm">{displayDate(item.paidAt)}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </TabsContent>

      <TabsContent value="reports" className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="card-surface rounded-[var(--radius-lg)] px-5 py-4">
            <div className="text-xs font-medium text-[var(--text-secondary)]">待結算佣金總額</div>
            <div className="mt-3 text-2xl font-semibold tracking-tight text-[var(--accent)]">{formatCurrency(pendingTotal)}</div>
          </div>
          <div className="card-surface rounded-[var(--radius-lg)] px-5 py-4">
            <div className="text-xs font-medium text-[var(--text-secondary)]">本月已付佣金</div>
            <div className="mt-3 text-2xl font-semibold tracking-tight text-[var(--accent)]">{formatCurrency(monthPaidTotal)}</div>
          </div>
          <div className="card-surface rounded-[var(--radius-lg)] px-5 py-4">
            <div className="text-xs font-medium text-[var(--text-secondary)]">本季已付佣金</div>
            <div className="mt-3 text-2xl font-semibold tracking-tight text-[var(--accent)]">{formatCurrency(quarterPaidTotal)}</div>
          </div>
          <div className="card-surface rounded-[var(--radius-lg)] px-5 py-4">
            <div className="text-xs font-medium text-[var(--text-secondary)]">平均佣金率</div>
            <div className="mt-3 text-2xl font-semibold tracking-tight text-[var(--accent)]">{avgCommissionRate.toFixed(2)}%</div>
          </div>
        </div>

        <div className="card-surface rounded-[var(--radius-lg)] px-5 py-5">
          <div className="section-title">合作方統計</div>
          <div className="section-subtitle">依合作方彙整報價與結算狀態</div>
          <div className="mt-4 overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>合作方名稱</th>
                  <th className="text-right">總報價數</th>
                  <th className="text-right">總佣金金額</th>
                  {!isMobile && <th className="text-right">待付金額</th>}
                  {!isMobile && <th className="text-right">已付金額</th>}
                </tr>
              </thead>
              <tbody>
                {byPartner.map((row) => (
                  <tr key={row.name}>
                    <td className="text-sm font-medium">{row.name}</td>
                    <td className="text-right text-sm">{row.quoteCount}</td>
                    <td className="text-right text-sm font-medium">{formatCurrency(row.total)}</td>
                    {!isMobile && <td className="text-right text-sm">{formatCurrency(row.pending)}</td>}
                    {!isMobile && <td className="text-right text-sm">{formatCurrency(row.paid)}</td>}
                  </tr>
                ))}
                {byPartner.length === 0 && (
                  <tr>
                    <td colSpan={isMobile ? 3 : 5} className="px-4 py-8 text-center text-sm text-[var(--text-secondary)]">
                      尚無合作方統計
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card-surface rounded-[var(--radius-lg)] px-5 py-5">
          <div className="section-title">近六個月佣金趨勢</div>
          <div className="section-subtitle">每月顯示佣金總額、已付與待付</div>
          <div className="mt-4 space-y-3">
            {byMonth.map((row) => (
              <div key={row.month} className="rounded-[var(--radius-md)] bg-[var(--bg-subtle)] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-[var(--text-primary)]">{row.month}</div>
                  <div className="text-xs text-[var(--text-secondary)]">
                    總額 {formatCurrency(row.total)} · 已付 {formatCurrency(row.paid)} · 待付 {formatCurrency(row.pending)}
                  </div>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[var(--bg-elevated)]">
                  <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${row.barWidth}px` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </TabsContent>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-md p-0">
          <DialogHeader>
            <DialogTitle>編輯結算狀態</DialogTitle>
            <DialogDescription>
              {editing ? `${editing.quoteId} · ${editing.partnerName || "未填合作方"}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 px-6 py-4">
            <div>
              <Label>結算狀態</Label>
              <Select value={editingStatus} onValueChange={(v) => setEditingStatus(v as SettlementStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">待付</SelectItem>
                  <SelectItem value="paid">已付</SelectItem>
                  <SelectItem value="cancelled">已沖銷</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>付款日期</Label>
              <Input type="date" value={editingPaidAt} onChange={(e) => setEditingPaidAt(e.target.value)} disabled={editingStatus !== "paid"} />
            </div>
            <div>
              <Label>付款方式</Label>
              <Input value={editingPaymentMethod} onChange={(e) => setEditingPaymentMethod(e.target.value)} placeholder="例如：匯款 / 現金" />
            </div>
            <div>
              <Label>憑證備註</Label>
              <Input value={editingReceiptNotes} onChange={(e) => setEditingReceiptNotes(e.target.value)} placeholder="例如：轉帳後五碼 12345" />
            </div>
          </div>
          <DialogFooter className="flex-row items-center justify-between sm:justify-between">
            <Button
              variant="ghost"
              className="text-[var(--error)] hover:text-[var(--error)]"
              disabled={deletingEdit || savingEdit}
              onClick={() => void deleteSettlement()}
            >
              {deletingEdit ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              刪除
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditing(null)}>
                取消
              </Button>
              <Button disabled={savingEdit || deletingEdit} onClick={() => void submitEdit()}>
                {savingEdit ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                儲存
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg p-0">
          <DialogHeader>
            <DialogTitle>新增結算</DialogTitle>
            <DialogDescription>手動新增一筆佣金結算紀錄</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 px-6 py-4 sm:grid-cols-2">
            <div>
              <Label>報價單號 *</Label>
              <Input value={draftQuoteId} onChange={(e) => setDraftQuoteId(e.target.value)} />
            </div>
            <div>
              <Label>版本 ID</Label>
              <Input value={draftVersionId} onChange={(e) => setDraftVersionId(e.target.value)} />
            </div>
            <div>
              <Label>案件 ID</Label>
              <Input value={draftCaseId} onChange={(e) => setDraftCaseId(e.target.value)} />
            </div>
            <div>
              <Label>合作方名稱 *</Label>
              <Input value={draftPartnerName} onChange={(e) => setDraftPartnerName(e.target.value)} />
            </div>
            <div>
              <Label>合作方 ID</Label>
              <Input value={draftPartnerId} onChange={(e) => setDraftPartnerId(e.target.value)} />
            </div>
            <div>
              <Label>合作身份</Label>
              <Select value={draftPartnerRole} onValueChange={(v) => setDraftPartnerRole(v as CommissionSettlement["partnerRole"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="designer">設計</SelectItem>
                  <SelectItem value="installer">工班</SelectItem>
                  <SelectItem value="referrer">介紹人</SelectItem>
                  <SelectItem value="other">其他</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>佣金模式</Label>
              <Select value={draftMode} onValueChange={(v) => setDraftMode(v as CommissionSettlement["commissionMode"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="price_gap">賺價差</SelectItem>
                  <SelectItem value="rebate">返佣</SelectItem>
                  <SelectItem value="fixed">固定金額</SelectItem>
                  <SelectItem value="none">無佣金</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>佣金比例 (%)</Label>
              <Input type="number" step="0.1" min={0} value={draftRate} onChange={(e) => setDraftRate(Number(e.target.value) || 0)} />
            </div>
            <div className="sm:col-span-2">
              <Label>佣金金額</Label>
              <Input type="number" min={0} value={draftAmount} onChange={(e) => setDraftAmount(Math.max(0, Number(e.target.value) || 0))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>取消</Button>
            <Button disabled={savingCreate} onClick={() => void submitCreate()}>
              {savingCreate ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              建立
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Tabs>
  );
}
