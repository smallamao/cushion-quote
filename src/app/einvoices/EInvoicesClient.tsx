"use client";

import { Download, FileText, Loader2, ReceiptText, RefreshCw, RotateCcw, SendHorizonal, XCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { EInvoiceCandidate, EInvoiceRecord } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface DraftOverride {
  buyerType: "b2b" | "b2c";
  buyerName: string;
  buyerTaxId: string;
  buyerAddress: string;
  email: string;
  carrierType: "none" | "mobile_barcode" | "member_code";
  carrierValue: string;
  donationCode: string;
  content: string;
  totalAmount?: number;
  taxRate?: number;
}

interface NoticeState {
  tone: "info" | "success" | "error";
  title: string;
  detail?: string;
}

interface BatchIssueItemResult {
  candidateId: string;
  displayName: string;
  success: boolean;
  stage: "create_draft" | "issue";
  detail: string;
  invoiceId?: string;
  providerInvoiceNo?: string;
  invoiceRecord?: EInvoiceRecord;
}

interface BatchIssueReport {
  total: number;
  successCount: number;
  failedCount: number;
  finishedAt: string;
  items: BatchIssueItemResult[];
}

interface LoadOptions {
  preserveFeedback?: boolean;
}

interface SnackbarState {
  message: string;
  invoiceId?: string;
}

interface CandidateDraftSnapshot {
  candidate: EInvoiceCandidate;
  draft: DraftOverride;
}

const INVOICE_STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  issuing: "開立中",
  issued: "已開立",
  failed: "失敗",
  cancelled: "已作廢",
  needs_review: "待確認",
};

const INVOICE_STATUS_CLASS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  issuing: "bg-blue-100 text-blue-700",
  issued: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-500",
  needs_review: "bg-amber-100 text-amber-700",
};

function extractErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;
  const current = payload as Record<string, unknown>;
  if (typeof current.error === "string" && current.error.trim()) return current.error.trim();
  if (typeof current.message === "string" && current.message.trim()) return current.message.trim();
  if (current.provider && typeof current.provider === "object") {
    const provider = current.provider as Record<string, unknown>;
    if (typeof provider.msg === "string" && provider.msg.trim()) return provider.msg.trim();
  }
  return fallback;
}

function buildUnknownErrorDetail(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;
  const message = extractErrorMessage(payload, "");
  if (message) return message;
  try {
    return JSON.stringify(payload);
  } catch {
    return fallback;
  }
}

function noticeClassName(tone: NoticeState["tone"]): string {
  switch (tone) {
    case "success":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
    case "error":
      return "border-red-200 bg-red-50 text-red-900";
    default:
      return "border-[var(--border)] bg-white text-[var(--text-primary)]";
  }
}

function buildDefaultDraft(candidate: EInvoiceCandidate): DraftOverride {
  const buyerName = candidate.clientName || candidate.contactName || candidate.projectName || "匿名客戶";
  return {
    buyerType: candidate.clientTaxId ? "b2b" : "b2c",
    buyerName,
    buyerTaxId: candidate.clientTaxId,
    buyerAddress: candidate.clientAddress,
    email: candidate.clientEmail,
    carrierType: "none",
    carrierValue: "",
    donationCode: "",
    content: candidate.projectName || candidate.clientName,
  };
}

export function EInvoicesClient() {
  const searchParams = useSearchParams();
  const versionId = searchParams.get("versionId")?.trim() ?? "";

  const [candidates, setCandidates] = useState<EInvoiceCandidate[]>([]);
  const [invoices, setInvoices] = useState<EInvoiceRecord[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DraftOverride>>({});
  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState(false);
  const [syncingInvoiceId, setSyncingInvoiceId] = useState("");
  const [reissueDate, setReissueDate] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [batchReport, setBatchReport] = useState<BatchIssueReport | null>(null);
  const [pasteData, setPasteData] = useState("");
  const [parsedRows, setParsedRows] = useState<Array<{ buyerName: string; buyerUbn: string; email: string; itemName: string; quantity: number; unitPrice: number; totalAmount: number }>>([]);
  const [historySelectedIds, setHistorySelectedIds] = useState<Set<string>>(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [batchDownloading, setBatchDownloading] = useState(false);
  const [historyLimit, setHistoryLimit] = useState(20);
  const [historySearch, setHistorySearch] = useState("");
  const [historyStatusFilter, setHistoryStatusFilter] = useState<string>("all");
  const [confirmReviewTarget, setConfirmReviewTarget] = useState<EInvoiceRecord | null>(null);
  const [confirmReviewForm, setConfirmReviewForm] = useState<{ taxType: 0 | 1 | 2 | 4; notes: string }>({
    taxType: 0,
    notes: "",
  });
  const [cancelTarget, setCancelTarget] = useState<EInvoiceRecord | null>(null);
  const [cancelRemark, setCancelRemark] = useState("");
  const [maintenanceOpen, setMaintenanceOpen] = useState(false);
  const [confirmDeleteBatch, setConfirmDeleteBatch] = useState(false);
  const [confirmDeleteFailed, setConfirmDeleteFailed] = useState(false);
  const [expandedCandidateIds, setExpandedCandidateIds] = useState<Set<string>>(new Set());
  const [batchIssueConfirm, setBatchIssueConfirm] = useState<{ candidates: EInvoiceCandidate[] } | null>(null);

  const [snackbar, setSnackbar] = useState<SnackbarState | null>(null);
  const [highlightedInvoiceId, setHighlightedInvoiceId] = useState<string | null>(null);
  const invoiceRowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickCreateForm, setQuickCreateForm] = useState({
    buyerName: "",
    buyerTaxId: "",
    totalAmount: "",
    content: "",
    invoiceDate: new Date().toISOString().slice(0, 10),
  });
  const [quickCreating, setQuickCreating] = useState(false);

  const load = useCallback(async (options: LoadOptions = {}) => {
    setLoading(true);
    try {
      const [candidateResponse, invoiceResponse] = await Promise.all([
        fetch(`/api/sheets/einvoices/candidates${versionId ? `?versionId=${encodeURIComponent(versionId)}` : ""}`, { cache: "no-store" }),
        fetch("/api/sheets/einvoices", { cache: "no-store" }),
      ]);
      if (!candidateResponse.ok || !invoiceResponse.ok) {
        throw new Error("讀取電子發票資料失敗");
      }
      const candidatePayload = (await candidateResponse.json()) as { candidates: EInvoiceCandidate[] };
      const invoicePayload = (await invoiceResponse.json()) as { invoices: EInvoiceRecord[] };
      setCandidates(candidatePayload.candidates);
      setInvoices(invoicePayload.invoices);
      setDrafts((current) => {
        const next = { ...current };
        for (const candidate of candidatePayload.candidates) {
          if (!next[candidate.candidateId]) {
            next[candidate.candidateId] = buildDefaultDraft(candidate);
          }
        }
        return next;
      });
      setSelectedIds((current) => {
        if (versionId) {
          return candidatePayload.candidates
            .filter((candidate) => !candidate.existingInvoiceId)
            .map((candidate) => candidate.candidateId);
        }
        return current.filter((id) => candidatePayload.candidates.some((candidate) => candidate.candidateId === id));
      });
    } catch (err) {
      if (!options.preserveFeedback) {
        setNotice({
          tone: "error",
          title: "讀取電子發票資料失敗",
          detail: err instanceof Error ? err.message : "讀取失敗",
        });
      }
      setCandidates([]);
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, [versionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedCandidates = useMemo(
    () => candidates.filter((candidate) => selectedIds.includes(candidate.candidateId)),
    [candidates, selectedIds],
  );

  const filteredInvoices = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    return invoices.filter((inv) => {
      if (historyStatusFilter !== "all" && inv.status !== historyStatusFilter) return false;
      if (!q) return true;
      return (
        inv.invoiceId.toLowerCase().includes(q) ||
        inv.buyerName.toLowerCase().includes(q) ||
        (inv.providerInvoiceNo ?? "").toLowerCase().includes(q) ||
        (inv.buyerTaxId ?? "").includes(q)
      );
    });
  }, [invoices, historySearch, historyStatusFilter]);

  function updateDraft(candidateId: string, patch: Partial<DraftOverride>) {
    setDrafts((current) => ({
      ...current,
      [candidateId]: { ...(current[candidateId] ?? buildDefaultDraft(candidates.find((item) => item.candidateId === candidateId) as EInvoiceCandidate)), ...patch },
    }));
  }

  function toggleCandidate(candidateId: string, checked: boolean) {
    setSelectedIds((current) => checked ? [...new Set([...current, candidateId])] : current.filter((id) => id !== candidateId));
  }

  async function removeCandidate(candidateId: string) {
    const candidate = candidates.find((c) => c.candidateId === candidateId);
    setCandidates((current) => current.filter((c) => c.candidateId !== candidateId));
    setSelectedIds((current) => current.filter((id) => id !== candidateId));
    setDrafts((current) => {
      const next = { ...current };
      delete next[candidateId];
      return next;
    });
    if (candidate?.versionId) {
      await fetch("/api/sheets/einvoices/opt-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: candidate.versionId, action: "add" }),
      }).catch(() => undefined);
    }
  }

  function parsePasteData() {
    if (!pasteData.trim()) {
      setParsedRows([]);
      return;
    }
    const lines = pasteData.trim().split("\n");
    const separator = lines[0].includes("\t") ? "\t" : ",";
    const rows: Array<{ buyerName: string; buyerUbn: string; email: string; itemName: string; quantity: number; unitPrice: number; totalAmount: number }> = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      const rawCols = line.split(separator).map((c) => c.trim());
      // Strip trailing empty columns (common from Excel copy-paste)
      while (rawCols.length > 0 && rawCols[rawCols.length - 1] === "") rawCols.pop();
      const cols = rawCols;
      if (cols.length < 2) continue;

      // Try to map by header names if first row looks like headers
      if (i === 0 && (cols[0].includes("買方") || cols[0].includes("統編") || cols[0].includes("客戶"))) {
        const headerMap: Record<string, number> = {};
        cols.forEach((col, idx) => {
          if (col.includes("買方名稱") || col.includes("客戶名稱")) headerMap.buyerName = idx;
          else if (col.includes("統編") || col.includes("稅編")) headerMap.buyerUbn = idx;
          else if (col.includes("Email") || col.includes("email") || col.includes("電子郵件")) headerMap.email = idx;
          else if (col.includes("品項") || col.includes("商品名稱")) headerMap.itemName = idx;
          else if (col.includes("數量")) headerMap.quantity = idx;
          else if (col.includes("單價")) headerMap.unitPrice = idx;
          else if (col.includes("總金額") || col.includes("含稅")) headerMap.totalAmount = idx;
        });
        if (headerMap.buyerName !== undefined && headerMap.totalAmount !== undefined) {
          for (let j = i + 1; j < lines.length; j++) {
            const dataLine = lines[j];
            if (!dataLine.trim()) continue;
            const dataCols = dataLine.split(separator).map((c) => c.trim());
            if (dataCols.length < 2) continue;
            rows.push({
              buyerName: headerMap.buyerName !== undefined ? (dataCols[headerMap.buyerName] || "") : dataCols[0] || "",
              buyerUbn: headerMap.buyerUbn !== undefined ? (dataCols[headerMap.buyerUbn] || "") : "",
              email: headerMap.email !== undefined ? (dataCols[headerMap.email] || "") : "",
              itemName: headerMap.itemName !== undefined ? (dataCols[headerMap.itemName] || "一般品項") : dataCols[1] || "一般品項",
              quantity: headerMap.quantity !== undefined ? Number(dataCols[headerMap.quantity]?.replace(/[$,]/g, "")) || 1 : 1,
              unitPrice: headerMap.unitPrice !== undefined ? Number(dataCols[headerMap.unitPrice]?.replace(/[$,]/g, "")) || 0 : 0,
              totalAmount: headerMap.totalAmount !== undefined ? Number(dataCols[headerMap.totalAmount]?.replace(/[$,]/g, "")) || 0 : Number(dataCols[dataCols.length - 1]?.replace(/[$,]/g, "")) || 0,
            });
          }
          setParsedRows(rows);
          return;
        }
      }

      // No headers or couldn't parse headers - try simple column mapping
      // Assume format: 買方名稱, (統編, Email, 品項, 數量, 單價, 總金額)
      // Last column is always total amount
      const total = Number(cols[cols.length - 1]?.replace(/[$,]/g, "")) || 0;
      rows.push({
        buyerName: cols[0] || "",
        buyerUbn: cols[1]?.match(/^\d{8}$/) ? cols[1] : "", // Only accept if exactly 8 digits (Taiwan UBN)
        email: cols[1]?.includes("@") ? cols[1] : cols[2] || "",
        itemName: cols[3] || cols[1] || "一般品項",
        quantity: Number(cols[4]?.replace(/[$,]/g, "")) || 1,
        unitPrice: Number(cols[5]?.replace(/[$,]/g, "")) || 0,
        totalAmount: total,
      });
    }
    setParsedRows(rows);
  }

  function handleBatchImport() {
    if (parsedRows.length === 0) return;
    const now = Date.now();
    const today = new Date().toISOString().slice(0, 10);
    const newCandidates: EInvoiceCandidate[] = parsedRows.map((row, idx) => {
      const sourceId = `MANUAL-${now}-${idx}`;
      const total = row.totalAmount;
      const untaxed = Math.round(total / 1.05);
      return {
        candidateId: `manual:${sourceId}`,
        sourceType: "manual",
        sourceId,
        sourceSubId: "",
        quoteId: "",
        versionId: "",
        caseId: "",
        clientId: "",
        clientName: row.buyerName,
        contactName: "",
        clientPhone: "",
        clientEmail: row.email,
        clientTaxId: row.buyerUbn,
        clientAddress: "",
        projectName: row.buyerName,
        amount: total,
        untaxedAmount: untaxed,
        taxAmount: total - untaxed,
        totalAmount: total,
        taxRate: 5,
        invoiceDate: today,
        lineItems: [{ name: row.itemName, quantity: row.quantity, unitPrice: row.unitPrice, amount: total, remark: "", taxType: 0 as const }],
        existingInvoiceId: "",
        existingInvoiceStatus: "",
      };
    });

    setCandidates((prev) => [...prev, ...newCandidates]);
    setDrafts((prev) => {
      const next = { ...prev };
      for (const c of newCandidates) {
        next[c.candidateId] = {
          buyerType: c.clientTaxId ? "b2b" : "b2c",
          buyerName: c.clientName,
          buyerTaxId: c.clientTaxId,
          buyerAddress: c.clientAddress,
          email: c.clientEmail,
          carrierType: "none",
          carrierValue: "",
          donationCode: "",
          content: c.projectName,
        };
      }
      return next;
    });
    setSelectedIds((prev) => [...prev, ...newCandidates.map((c) => c.candidateId)]);
    setPasteData("");
    setParsedRows([]);
    setNotice({ tone: "success", title: `已加入 ${newCandidates.length} 筆到待開立候選，請確認資料後點「批次開立」` });
  }

  async function createAndIssue(snapshot: CandidateDraftSnapshot): Promise<BatchIssueItemResult> {
    const { candidate, draft } = snapshot;
    const displayName = candidate.projectName || candidate.clientName || candidate.candidateId;
    try {
      const effectiveTotal = draft.totalAmount ?? candidate.totalAmount;
      const effectiveTaxRate = draft.taxRate ?? candidate.taxRate;
      const effectiveRateRatio = effectiveTaxRate / 100;
      const effectiveUntaxed = effectiveRateRatio > 0 ? Math.round(effectiveTotal / (1 + effectiveRateRatio)) : effectiveTotal;
      const effectiveTax = effectiveTotal - effectiveUntaxed;

      const createResponse = await fetch("/api/sheets/einvoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceType: candidate.sourceType,
          sourceId: candidate.sourceId,
          sourceSubId: candidate.sourceSubId,
          quoteId: candidate.quoteId,
          versionId: candidate.versionId,
          caseId: candidate.caseId,
          clientId: candidate.clientId,
          buyerType: draft.buyerType,
          buyerName: draft.buyerName,
          buyerTaxId: draft.buyerTaxId,
          buyerAddress: draft.buyerAddress,
          email: draft.email,
          carrierType: draft.carrierType,
          carrierValue: draft.carrierValue,
          donationCode: draft.donationCode,
          invoiceDate: candidate.invoiceDate,
          taxType: 0,
          totalAmount: effectiveTotal,
          taxRate: effectiveTaxRate,
          untaxedAmount: effectiveUntaxed,
          taxAmount: effectiveTax,
          items: candidate.lineItems,
          content: draft.content,
        }),
      });

      const createPayload = (await createResponse.json().catch(() => ({}))) as { invoice?: EInvoiceRecord; error?: string };
      if (!createResponse.ok || !createPayload.invoice) {
        return {
          candidateId: candidate.candidateId,
          displayName,
          success: false,
          stage: "create_draft",
          detail: extractErrorMessage(createPayload, `${displayName} 建立草稿失敗`),
        };
      }

      try {
        const issueResponse = await fetch(`/api/sheets/einvoices/${encodeURIComponent(createPayload.invoice.invoiceId)}/issue`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invoiceRecord: createPayload.invoice }),
        });
        const issuePayload = (await issueResponse.json().catch(() => ({}))) as { invoice?: EInvoiceRecord; error?: string; provider?: { msg?: string } };
        if (!issueResponse.ok) {
          return {
            candidateId: candidate.candidateId,
            displayName,
            success: false,
            stage: "issue",
            invoiceId: createPayload.invoice.invoiceId,
            detail: buildUnknownErrorDetail(issuePayload, `${displayName} 開立失敗`),
          };
        }

        const finalInvoiceNo = issuePayload.invoice?.providerInvoiceNo ?? "";
        const finalRecord: EInvoiceRecord = issuePayload.invoice ?? {
          ...createPayload.invoice,
          status: "issued",
          providerInvoiceNo: finalInvoiceNo,
          updatedAt: new Date().toISOString(),
        };
        return {
          candidateId: candidate.candidateId,
          displayName,
          success: true,
          stage: "issue",
          invoiceId: finalRecord.invoiceId,
          providerInvoiceNo: finalInvoiceNo,
          invoiceRecord: finalRecord,
          detail: finalInvoiceNo ? `已成功送出，發票號碼 ${finalInvoiceNo}` : "已成功送出 Giveme",
        };
      } catch (err) {
        return {
          candidateId: candidate.candidateId,
          displayName,
          success: false,
          stage: "issue",
          invoiceId: createPayload.invoice.invoiceId,
          detail: err instanceof Error ? err.message : `${displayName} 開立失敗`,
        };
      }
    } catch (err) {
      return {
        candidateId: candidate.candidateId,
        displayName,
        success: false,
        stage: "create_draft",
        detail: err instanceof Error ? err.message : `${displayName} 建立草稿失敗`,
      };
    }
  }

  async function handleQuickCreate() {
    const total = Number(quickCreateForm.totalAmount.replace(/[,$]/g, ""));
    if (!quickCreateForm.buyerName.trim()) return;
    if (!total || total <= 0) return;
    setQuickCreating(true);
    try {
      const untaxed = Math.round(total / 1.05);
      const tax = total - untaxed;
      const content = quickCreateForm.content.trim() || quickCreateForm.buyerName.trim();
      const now = Date.now();
      const createRes = await fetch("/api/sheets/einvoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceType: "manual",
          sourceId: `QUICK-${now}`,
          buyerType: quickCreateForm.buyerTaxId.trim() ? "b2b" : "b2c",
          buyerName: quickCreateForm.buyerName.trim(),
          buyerTaxId: quickCreateForm.buyerTaxId.trim(),
          invoiceDate: quickCreateForm.invoiceDate,
          taxType: 0,
          taxRate: 5,
          untaxedAmount: untaxed,
          taxAmount: tax,
          totalAmount: total,
          content,
          items: [{ name: content, quantity: 1, unitPrice: untaxed, amount: untaxed, remark: "", taxType: 0 }],
        }),
      });
      const createPayload = (await createRes.json().catch(() => ({}))) as { ok?: boolean; invoice?: EInvoiceRecord; error?: string };
      if (!createRes.ok || !createPayload.invoice) {
        throw new Error(createPayload.error ?? "建立草稿失敗");
      }
      const invoiceId = createPayload.invoice.invoiceId;
      const issueRes = await fetch(`/api/sheets/einvoices/${encodeURIComponent(invoiceId)}/issue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceDate: quickCreateForm.invoiceDate }),
      });
      const issuePayload = (await issueRes.json().catch(() => ({}))) as { ok?: boolean; invoice?: EInvoiceRecord; error?: string; provider?: { msg?: string } };
      if (!issueRes.ok) {
        throw new Error(buildUnknownErrorDetail(issuePayload, "送出開立失敗"));
      }
      const no = issuePayload.invoice?.providerInvoiceNo ?? "";
      setNotice({ tone: "success", title: no ? `開立成功，發票號碼 ${no}` : "已送出 Giveme" });
      setSnackbar({ message: "電子發票已開立", invoiceId });
      setTimeout(() => setSnackbar(null), 3000);
      setQuickCreateOpen(false);
      setQuickCreateForm({ buyerName: "", buyerTaxId: "", totalAmount: "", content: "", invoiceDate: new Date().toISOString().slice(0, 10) });
      await load({ preserveFeedback: true });
    } catch (err) {
      setNotice({ tone: "error", title: "快速開立失敗", detail: err instanceof Error ? err.message : "未知錯誤" });
      setQuickCreateOpen(false);
    } finally {
      setQuickCreating(false);
    }
  }

  function handleBatchIssue() {
    if (selectedCandidates.length === 0) {
      setNotice({ tone: "info", title: "請至少勾選一筆待開資料" });
      return;
    }
    setBatchIssueConfirm({ candidates: selectedCandidates });
  }

  async function executeBatchIssue(candidatesToIssue: EInvoiceCandidate[]) {
    setBatchIssueConfirm(null);
    setIssuing(true);
    setBatchReport(null);
    setNotice({ tone: "info", title: `正在批次開立 ${candidatesToIssue.length} 筆電子發票...` });
    const snapshots: CandidateDraftSnapshot[] = candidatesToIssue.map((candidate) => ({
      candidate,
      draft: { ...(drafts[candidate.candidateId] ?? buildDefaultDraft(candidate)) },
    }));
    try {
      const results: BatchIssueItemResult[] = [];
      for (const snapshot of snapshots) {
        results.push(await createAndIssue(snapshot));
      }
      const successCount = results.filter((item) => item.success).length;
      const failedCount = results.length - successCount;
      setBatchReport({
        total: results.length,
        successCount,
        failedCount,
        finishedAt: new Date().toLocaleString("zh-TW"),
        items: results,
      });
      setNotice(
        failedCount === 0
          ? {
              tone: "success",
              title: `批次開立完成：${successCount}/${results.length} 筆成功`,
              detail: "所有勾選資料都已完成建立草稿並送出到 Giveme。",
            }
          : {
              tone: "error",
              title: `批次開立完成：成功 ${successCount} 筆，失敗 ${failedCount} 筆`,
              detail: "請看下方批次開立結果，失敗項目已列出具體階段與錯誤原因。",
            },
      );
      if (successCount > 0) {
        const firstSuccessId = results.find((r) => r.success)?.invoiceId;
        setSnackbar({ message: `電子發票已開立（${successCount} 筆）`, invoiceId: firstSuccessId });
        setTimeout(() => setSnackbar(null), 3000);
      }
      const newInvoiceRecords = results.flatMap((r) => (r.invoiceRecord ? [r.invoiceRecord] : []));

      const mergeNewInvoices = (prev: EInvoiceRecord[]) => {
        if (newInvoiceRecords.length === 0) return prev;
        const existingIds = new Set(prev.map((inv) => inv.invoiceId));
        const toAdd = newInvoiceRecords.filter((inv) => !existingIds.has(inv.invoiceId));
        return toAdd.length > 0 ? [...toAdd, ...prev] : prev;
      };

      // Immediately show new records before Sheets propagates
      setInvoices(mergeNewInvoices);
      await load({ preserveFeedback: true });
      // Re-merge after load in case Sheets still hadn't propagated
      setInvoices(mergeNewInvoices);
    } finally {
      setIssuing(false);
    }
  }

  async function handleSync(invoiceId: string) {
    setSyncingInvoiceId(invoiceId);
    try {
      const response = await fetch(`/api/sheets/einvoices/${encodeURIComponent(invoiceId)}/sync`, { method: "POST" });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; invoice?: EInvoiceRecord; provider?: { status?: string; msg?: string } };
      if (!response.ok) {
        throw new Error(payload.error ?? "同步失敗");
      }
      const newStatus = payload.invoice?.status;
      const providerMsg = payload.provider?.msg ?? "";
      const title = newStatus === "cancelled"
        ? `已同步：${invoiceId} 已標記為作廢`
        : `已同步：${invoiceId} 在 giveme 仍有效${providerMsg ? `（${providerMsg}）` : ""}`;
      setNotice({ tone: newStatus === "cancelled" ? "error" : "success", title });
      await load();
    } catch (err) {
      setNotice({ tone: "error", title: "同步失敗", detail: err instanceof Error ? err.message : "同步失敗" });
    } finally {
      setSyncingInvoiceId("");
    }
  }

  async function handleIssue(invoiceId: string, dateOverride?: string) {
    setSyncingInvoiceId(invoiceId);
    try {
      const body = dateOverride ? { invoiceDate: dateOverride } : {};
      const response = await fetch(`/api/sheets/einvoices/${encodeURIComponent(invoiceId)}/issue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as { invoice?: EInvoiceRecord; error?: string; provider?: { msg?: string } };
      if (!response.ok) {
        throw new Error(buildUnknownErrorDetail(payload, "開立失敗"));
      }
      const no = (payload.invoice as EInvoiceRecord | undefined)?.providerInvoiceNo;
      setNotice({ tone: "success", title: no ? `開立成功，發票號碼 ${no}` : `${invoiceId} 已送出 Giveme` });
      const issuedInvoiceId = (payload.invoice as EInvoiceRecord | undefined)?.invoiceId ?? invoiceId;
      setSnackbar({ message: "電子發票已開立", invoiceId: issuedInvoiceId });
      setTimeout(() => setSnackbar(null), 3000);
      await load({ preserveFeedback: true });
    } catch (err) {
      setNotice({ tone: "error", title: "開立失敗", detail: err instanceof Error ? err.message : "開立失敗" });
    } finally {
      setSyncingInvoiceId("");
    }
  }

  async function handleDownloadPicture(invoice: EInvoiceRecord) {
    setSyncingInvoiceId(invoice.invoiceId);
    try {
      // B2B → A4 (type=2)；B2C → 電子發票 (type=1)
      // Also check buyerTaxId as fallback — stubs from reconcile may have incorrect buyerType
      const pictureType = (invoice.buyerType === "b2b" || Boolean(invoice.buyerTaxId?.trim())) ? 2 : 1;
      const url = `/api/sheets/einvoices/${encodeURIComponent(invoice.invoiceId)}/picture?type=${pictureType}${invoice.providerInvoiceNo ? `&code=${encodeURIComponent(invoice.providerInvoiceNo)}` : ""}`;
      const res = await fetch(url);
      if (res.status === 410) {
        const data = (await res.json().catch(() => ({}))) as { error?: string; delRemark?: string };
        setInvoices((prev) =>
          prev.map((inv) =>
            inv.invoiceId === invoice.invoiceId ? { ...inv, status: "cancelled" as const } : inv,
          ),
        );
        setNotice({
          tone: "error",
          title: "此發票已在 giveme 作廢，系統狀態已同步",
          detail: data.delRemark ? `作廢原因：${data.delRemark}` : undefined,
        });
        return;
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "下載失敗");
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      const safeNo = (invoice.providerInvoiceNo ?? invoice.invoiceId).replace(/[/\\?%*:|"<>]/g, "-");
      const safeName = invoice.buyerName.replace(/[/\\?%*:|"<>（）]/g, "").trim();
      a.download = `${safeNo} ${safeName}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      setNotice({ tone: "error", title: err instanceof Error ? err.message : "下載失敗" });
    } finally {
      setSyncingInvoiceId("");
    }
  }

  function toggleHistorySelect(invoiceId: string) {
    setHistorySelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(invoiceId)) next.delete(invoiceId);
      else next.add(invoiceId);
      return next;
    });
  }

  function toggleHistorySelectAll(visibleInvoices: EInvoiceRecord[]) {
    setHistorySelectedIds((prev) => {
      const allSelected = visibleInvoices.every((inv) => prev.has(inv.invoiceId));
      if (allSelected) return new Set();
      return new Set(visibleInvoices.map((inv) => inv.invoiceId));
    });
  }

  async function handleBatchDelete() {
    if (historySelectedIds.size === 0) return;
    setConfirmDeleteBatch(true);
  }

  async function submitBatchDelete() {
    setConfirmDeleteBatch(false);
    setBatchDeleting(true);
    try {
      const res = await fetch("/api/sheets/einvoices/batch-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceIds: Array.from(historySelectedIds) }),
      });
      const data = (await res.json()) as { ok: boolean; deleted?: number; message?: string; error?: string };
      if (data.ok) {
        setNotice({ tone: "success", title: data.message ?? "刪除完成" });
        setHistorySelectedIds(new Set());
        void load({ preserveFeedback: true });
      } else {
        setNotice({ tone: "error", title: "刪除失敗", detail: data.error });
      }
    } catch (err) {
      setNotice({ tone: "error", title: err instanceof Error ? err.message : "刪除失敗" });
    } finally {
      setBatchDeleting(false);
    }
  }

  async function handleBatchDownload(visibleInvoices: EInvoiceRecord[]) {
    const targets = visibleInvoices.filter(
      (inv) => historySelectedIds.has(inv.invoiceId) && inv.status === "issued",
    );
    if (targets.length === 0) {
      setNotice({ tone: "info", title: "選取的記錄中沒有已開立的發票可下載" });
      return;
    }
    setBatchDownloading(true);
    try {
      const res = await fetch("/api/sheets/einvoices/batch-download-zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceIds: targets.map((inv) => inv.invoiceId) }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "批次下載失敗");
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `invoices-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
      setNotice({ tone: "success", title: `已下載 ${targets.length} 張發票 ZIP` });
    } catch (err) {
      setNotice({ tone: "error", title: err instanceof Error ? err.message : "批次下載失敗" });
    } finally {
      setBatchDownloading(false);
    }
  }

  function handleCancel(invoice: EInvoiceRecord) {
    setCancelRemark(invoice.cancelReason || "客戶要求作廢");
    setCancelTarget(invoice);
  }

  async function submitCancel(invoice: EInvoiceRecord, remark: string) {
    setCancelTarget(null);
    setSyncingInvoiceId(invoice.invoiceId);
    try {
      const response = await fetch(`/api/sheets/einvoices/${encodeURIComponent(invoice.invoiceId)}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remark }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "作廢失敗");
      }
      setNotice({ tone: "success", title: `已作廢 ${invoice.invoiceId}`, detail: `原因：${remark}` });
      await load();
    } catch (err) {
      setNotice({ tone: "error", title: "作廢失敗", detail: err instanceof Error ? err.message : "作廢失敗" });
    } finally {
      setSyncingInvoiceId("");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-[var(--text-secondary)]">
        <Loader2 className="h-4 w-4 animate-spin" />
        載入電子發票工作台中...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">電子發票工作台</h1>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            先建立草稿，再逐筆送出到 Giveme。{versionId ? `目前為報價版本 ${versionId} 的直接開票模式。` : "可從應收帳款與月結待出快速批次開立。"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" />
            重新整理
          </Button>
          <Button variant="outline" onClick={() => setQuickCreateOpen(true)}>
            <ReceiptText className="h-4 w-4" />
            快速開立
          </Button>
          <Button onClick={() => handleBatchIssue()} disabled={issuing || selectedCandidates.length === 0}>
            {issuing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ReceiptText className="h-4 w-4" />}
            {issuing ? "批次開立中..." : `批次開立 (${selectedCandidates.length})`}
          </Button>
        </div>
      </div>

      {notice ? (
        <div className={`rounded-md border px-4 py-3 text-sm ${noticeClassName(notice.tone)}`}>
          <div className="font-medium">{notice.title}</div>
          {notice.detail ? <div className="mt-1 whitespace-pre-wrap text-xs opacity-90">{notice.detail}</div> : null}
        </div>
      ) : null}

      {batchReport ? (
        <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-white p-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-sm font-medium">批次開立結果</h2>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">完成時間：{batchReport.finishedAt}</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">總計 {batchReport.total} 筆</span>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">成功 {batchReport.successCount} 筆</span>
              <span className="rounded-full bg-red-100 px-3 py-1 text-red-700">失敗 {batchReport.failedCount} 筆</span>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {batchReport.items.map((item) => (
              <div key={`${item.candidateId}-${item.stage}`} className="rounded-lg border border-[var(--border)] p-3">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="font-medium text-[var(--text-primary)]">{item.displayName}</div>
                    <div className="mt-1 text-xs text-[var(--text-secondary)]">
                      階段：{item.stage === "create_draft" ? "建立草稿" : "送出開立"}
                      {item.invoiceId ? ` / 草稿編號：${item.invoiceId}` : ""}
                      {item.providerInvoiceNo ? ` / 發票號碼：${item.providerInvoiceNo}` : ""}
                    </div>
                  </div>
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${item.success ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                    {item.success ? "成功" : "失敗"}
                  </span>
                </div>
                <div className={`mt-2 whitespace-pre-wrap text-xs ${item.success ? "text-emerald-800" : "text-red-700"}`}>
                  {item.detail}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <section className="space-y-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">待開立候選</h2>
            <span className="text-xs text-[var(--text-secondary)]">{candidates.length} 筆</span>
          </div>

          <div className="space-y-4">
            {candidates.filter((c) => !c.existingInvoiceId || c.existingInvoiceStatus === "cancelled").length === 0 ? (
              <div className="rounded-md bg-[var(--surface-muted)] px-4 py-6 text-sm text-[var(--text-secondary)]">目前沒有可開立的候選資料。</div>
            ) : (
              candidates
                .filter((c) => !c.existingInvoiceId || c.existingInvoiceStatus === "cancelled")
                .map((candidate) => {
                const draft = drafts[candidate.candidateId] ?? buildDefaultDraft(candidate);
                const disabled = issuing || Boolean(candidate.existingInvoiceId);
                const isExpanded = expandedCandidateIds.has(candidate.candidateId);
                return (
                  <div key={candidate.candidateId} className="rounded-lg border border-[var(--border)]">
                    {/* 摘要列 */}
                    <div className="flex items-center gap-2 p-3">
                      <Checkbox checked={selectedIds.includes(candidate.candidateId)} onCheckedChange={(checked) => toggleCandidate(candidate.candidateId, checked === true)} disabled={disabled} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-[var(--text-primary)]">{candidate.projectName || candidate.clientName}</div>
                        <div className="text-xs text-[var(--text-secondary)]">
                          {draft.buyerName}
                          {candidate.existingInvoiceId ? (
                            <span className="ml-1 text-emerald-700">· 已開立：{candidate.existingInvoiceId}</span>
                          ) : (
                            <span> · <span className="font-medium text-[var(--text-primary)]">{formatCurrency(draft.totalAmount ?? candidate.totalAmount)}</span></span>
                          )}
                        </div>
                      </div>
                      {!disabled && (
                        <>
                          <button
                            type="button"
                            className="shrink-0 rounded px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]"
                            onClick={() => setExpandedCandidateIds((prev) => {
                              const next = new Set(prev);
                              next.has(candidate.candidateId) ? next.delete(candidate.candidateId) : next.add(candidate.candidateId);
                              return next;
                            })}
                          >
                            {isExpanded ? "收起 ▲" : "編輯 ▼"}
                          </button>
                          <Button variant="ghost" size="sm" className="shrink-0 text-red-600 hover:text-red-700" onClick={() => void removeCandidate(candidate.candidateId)}>
                            移除
                          </Button>
                        </>
                      )}
                    </div>

                    {/* 可展開的輸入區 */}
                    {isExpanded && !disabled && (
                      <div className="border-t border-[var(--border)] p-4">
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <div>
                          <Label>買方類型</Label>
                          <Select value={draft.buyerType} onValueChange={(value) => updateDraft(candidate.candidateId, { buyerType: value as DraftOverride["buyerType"] })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="b2b">B2B</SelectItem>
                              <SelectItem value="b2c">B2C</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>買方名稱</Label>
                          <Input value={draft.buyerName} onChange={(e) => updateDraft(candidate.candidateId, { buyerName: e.target.value })} />
                        </div>
                        <div>
                          <Label>統編 / 載具</Label>
                          <Input value={draft.buyerType === "b2b" ? draft.buyerTaxId : draft.carrierValue} onChange={(e) => updateDraft(candidate.candidateId, draft.buyerType === "b2b" ? { buyerTaxId: e.target.value } : { carrierValue: e.target.value })} />
                        </div>
                        <div>
                          <Label>Email</Label>
                          <Input value={draft.email} onChange={(e) => updateDraft(candidate.candidateId, { email: e.target.value })} />
                        </div>
                        {draft.buyerType === "b2b" ? (
                          <div className="md:col-span-2 xl:col-span-4">
                            <Label>買方地址</Label>
                            <Input
                              value={draft.buyerAddress}
                              onChange={(e) => updateDraft(candidate.candidateId, { buyerAddress: e.target.value })}
                              placeholder="請輸入買方地址"
                            />
                          </div>
                        ) : null}
                        {draft.buyerType === "b2c" ? (
                          <>
                            <div>
                              <Label>載具類型</Label>
                              <Select value={draft.carrierType} onValueChange={(value) => updateDraft(candidate.candidateId, { carrierType: value as DraftOverride["carrierType"] })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">不指定</SelectItem>
                                  <SelectItem value="mobile_barcode">手機條碼</SelectItem>
                                  <SelectItem value="member_code">會員載具</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label>捐贈碼</Label>
                              <Input value={draft.donationCode} onChange={(e) => updateDraft(candidate.candidateId, { donationCode: e.target.value })} />
                            </div>
                          </>
                        ) : null}
                        <div className="md:col-span-2 xl:col-span-4">
                          <Label>開票備註</Label>
                          <Input value={draft.content} onChange={(e) => updateDraft(candidate.candidateId, { content: e.target.value })} />
                        </div>
                        <div>
                          <Label>總金額</Label>
                          <Input
                            type="number"
                            value={draft.totalAmount ?? candidate.totalAmount}
                            onChange={(e) => updateDraft(candidate.candidateId, { totalAmount: Number(e.target.value) })}
                          />
                        </div>
                        <div>
                          <Label>稅率 (%)</Label>
                          <Input
                            type="number"
                            step="0.1"
                            value={draft.taxRate ?? candidate.taxRate}
                            onChange={(e) => {
                              const rate = e.target.value === "" ? 5 : Number(e.target.value);
                              updateDraft(candidate.candidateId, { taxRate: rate });
                            }}
                          />
                        </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="space-y-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">批次匯入</h2>
          </div>
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between">
                <Label className="text-xs">貼上 Excel 資料（Tab 或逗號分隔）</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => {
                    const example = "買方名稱\t統編\tEmail\t品項\t數量\t單價\t總金額\n禾琪概念家居有限公司\t85164778\tsmallamao79@gmail.com\t沙發布 5M\t1\t34650\t34650\n禾琪概念家居有限公司\t85164778\tsmallamao79@gmail.com\t抱枕布 2M\t1\t8000\t8000";
                    void navigator.clipboard.writeText(example);
                    setNotice({ tone: "info", title: "範例已複製" });
                  }}
                >
                  複製範例
                </Button>
              </div>
              <textarea
                className="mt-1 w-full rounded border border-[var(--border)] bg-white px-3 py-2 text-xs font-mono"
                rows={5}
                placeholder="貼上或從 Excel 複製資料"
                value={pasteData}
                onChange={(e) => setPasteData(e.target.value)}
              />
            </div>
            {parsedRows.length > 0 && (
              <div className="overflow-x-auto rounded border border-[var(--border)]">
                <table className="w-full text-xs">
                  <thead className="bg-[var(--surface-muted)]">
                    <tr>
                      <th className="px-2 py-1 text-left">買方名稱</th>
                      <th className="px-2 py-1 text-left">統編</th>
                      <th className="px-2 py-1 text-left">Email</th>
                      <th className="px-2 py-1 text-left">品項</th>
                      <th className="px-2 py-1 text-right">數量</th>
                      <th className="px-2 py-1 text-right">單價</th>
                      <th className="px-2 py-1 text-right">總金額</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.map((row, idx) => (
                      <tr key={idx} className={idx % 2 === 0 ? "" : "bg-[var(--surface-muted)]"}>
                        <td className="px-2 py-1">{row.buyerName}</td>
                        <td className="px-2 py-1">{row.buyerUbn}</td>
                        <td className="px-2 py-1">{row.email}</td>
                        <td className="px-2 py-1">{row.itemName}</td>
                        <td className="px-2 py-1 text-right">{row.quantity}</td>
                        <td className="px-2 py-1 text-right">{row.unitPrice}</td>
                        <td className="px-2 py-1 text-right">{formatCurrency(row.totalAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => parsePasteData()}>
                預覽
              </Button>
              <Button size="sm" onClick={() => handleBatchImport()} disabled={parsedRows.length === 0}>
                匯入 ({parsedRows.length} 筆)
              </Button>
            </div>
          </div>
        </section>

        <section className="space-y-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-white p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={filteredInvoices.length > 0 && filteredInvoices.slice(0, historyLimit).every((inv) => historySelectedIds.has(inv.invoiceId))}
                onCheckedChange={() => toggleHistorySelectAll(filteredInvoices.slice(0, historyLimit))}
                disabled={filteredInvoices.length === 0}
              />
              <h2 className="text-sm font-medium">開票歷史</h2>
            </div>
            <span className="text-xs text-[var(--text-secondary)]">
              {filteredInvoices.length !== invoices.length ? `${filteredInvoices.length} / ` : ""}{invoices.length} 筆
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="搜尋客戶名稱、發票號碼、統編…"
              value={historySearch}
              onChange={(e) => { setHistorySearch(e.target.value); setHistoryLimit(20); }}
              className="h-8 max-w-xs text-xs"
            />
            <Select value={historyStatusFilter} onValueChange={(v) => { setHistoryStatusFilter(v); setHistoryLimit(20); }}>
              <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部狀態</SelectItem>
                {Object.entries(INVOICE_STATUS_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {historySelectedIds.size > 0 && (
            <div className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2">
              <span className="flex-1 text-xs text-[var(--text-secondary)]">已選 {historySelectedIds.size} 筆</span>
              <Button
                size="sm"
                variant="outline"
                disabled={batchDownloading || batchDeleting}
                onClick={() => void handleBatchDownload(filteredInvoices.slice(0, historyLimit))}
              >
                {batchDownloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                批次下載圖檔
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={batchDeleting || batchDownloading}
                onClick={() => void handleBatchDelete()}
              >
                {batchDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                刪除選取
              </Button>
              <button
                type="button"
                className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                onClick={() => setHistorySelectedIds(new Set())}
              >
                取消
              </button>
            </div>
          )}
          <div className="relative">
            <button
              type="button"
              className="flex items-center gap-1.5 rounded border border-[var(--border)] bg-white px-2.5 py-1.5 text-xs hover:bg-[var(--surface-muted)]"
              onClick={() => setMaintenanceOpen((v) => !v)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              維護工具
              <svg xmlns="http://www.w3.org/2000/svg" className={`h-3 w-3 transition-transform ${maintenanceOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {maintenanceOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMaintenanceOpen(false)} />
                <div className="absolute left-0 top-full z-20 mt-1 w-64 rounded-lg border border-[var(--border)] bg-white py-1 shadow-lg">
                  <button
                    type="button"
                    className="flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-[var(--surface-muted)]"
                    onClick={async () => {
                      setMaintenanceOpen(false);
                      const res = await fetch("/api/sheets/einvoices/reconcile", { method: "POST" });
                      const data = (await res.json()) as { ok: boolean; message?: string; error?: string; newRecords?: EInvoiceRecord[]; updatedRecords?: EInvoiceRecord[] };
                      if (data.ok) {
                        setNotice({ tone: "success", title: data.message ?? "修復完成" });
                        const recovered = [...(data.newRecords ?? []), ...(data.updatedRecords ?? [])];
                        if (recovered.length > 0) {
                          setInvoices((prev) => {
                            const existingIds = new Set(prev.map((inv) => inv.invoiceId));
                            const toAdd = recovered.filter((inv) => !existingIds.has(inv.invoiceId));
                            const updated = prev.map((inv) => {
                              const u = recovered.find((r) => r.invoiceId === inv.invoiceId);
                              return u ?? inv;
                            });
                            return toAdd.length > 0 ? [...toAdd, ...updated] : updated;
                          });
                        }
                        void load({ preserveFeedback: true });
                      } else {
                        setNotice({ tone: "error", title: "修復失敗", detail: data.error });
                      }
                    }}
                  >
                    <div className="mt-0.5 shrink-0 text-[var(--text-secondary)]">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-xs font-medium">修復遺失記錄</div>
                      <div className="text-xs text-[var(--text-secondary)]">從事件日誌重建卡在草稿的發票</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-[var(--surface-muted)]"
                    onClick={async () => {
                      setMaintenanceOpen(false);
                      const res = await fetch("/api/sheets/einvoices/batch-sync", { method: "POST" });
                      const data = (await res.json()) as {
                        ok: boolean;
                        message?: string;
                        error?: string;
                        cancelledRecords?: EInvoiceRecord[];
                        skippedDetails?: Array<{ invoiceId: string; reason: string }>;
                      };
                      if (data.ok) {
                        const skipped = data.skippedDetails ?? [];
                        const skippedDetail = skipped.length > 0
                          ? skipped.map((s) => `${s.invoiceId}：${s.reason}`).join("\n")
                          : undefined;
                        setNotice({
                          tone: (data.cancelledRecords ?? []).length > 0 ? "success" : "info",
                          title: data.message ?? "批次同步完成",
                          detail: skippedDetail,
                        });
                        if ((data.cancelledRecords ?? []).length > 0) {
                          setInvoices((prev) =>
                            prev.map((inv) => {
                              const updated = data.cancelledRecords!.find((r) => r.invoiceId === inv.invoiceId);
                              return updated ?? inv;
                            }),
                          );
                        }
                        void load({ preserveFeedback: true });
                      } else {
                        setNotice({ tone: "error", title: "批次同步失敗", detail: data.error });
                      }
                    }}
                  >
                    <div className="mt-0.5 shrink-0 text-[var(--text-secondary)]">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-xs font-medium">批次同步狀態</div>
                      <div className="text-xs text-[var(--text-secondary)]">向 Giveme 查詢已作廢發票並同步</div>
                    </div>
                  </button>
                  {invoices.some((inv) => inv.status === "failed") && (
                    <>
                      <div className="my-1 border-t border-[var(--border)]" />
                      <button
                        type="button"
                        className="flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-red-50"
                        onClick={() => { setMaintenanceOpen(false); setConfirmDeleteFailed(true); }}
                      >
                        <div className="mt-0.5 shrink-0 text-red-500">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-red-600">刪除失敗記錄</div>
                          <div className="text-xs text-red-400">清除所有失敗草稿，無法復原</div>
                        </div>
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="space-y-3">
            {filteredInvoices.some((inv) => inv.status === "needs_review") && (
              <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs">
                <svg xmlns="http://www.w3.org/2000/svg" className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div className="flex-1">
                  <span className="font-medium text-amber-900">
                    {filteredInvoices.filter((inv) => inv.status === "needs_review").length} 筆發票需人工確認稅型
                  </span>
                  <span className="ml-1 text-amber-700">請點擊各筆記錄旁的確認按鈕，核對稅率後標記為已開立。</span>
                </div>
                <button
                  type="button"
                  className="shrink-0 text-xs font-medium text-amber-800 underline hover:text-amber-900"
                  onClick={() => setHistoryStatusFilter("needs_review")}
                >
                  僅顯示
                </button>
              </div>
            )}
            {filteredInvoices.length === 0 ? (
              <div className="rounded-md bg-[var(--surface-muted)] px-4 py-6 text-sm text-[var(--text-secondary)]">
                {invoices.length === 0 ? "尚無開票紀錄。" : "沒有符合搜尋條件的記錄。"}
              </div>
            ) : (
              filteredInvoices.slice(0, historyLimit).map((invoice) => (
                <div
                  key={invoice.invoiceId}
                  id={`invoice-row-${invoice.invoiceId}`}
                  ref={(el) => { invoiceRowRefs.current[invoice.invoiceId] = el; }}
                  className={`rounded-lg border p-3 space-y-2 transition-shadow ${highlightedInvoiceId === invoice.invoiceId ? "ring-2 ring-blue-400" : ""} ${historySelectedIds.has(invoice.invoiceId) ? "border-[var(--accent)] bg-[var(--accent-muted)]/20" : "border-[var(--border)]"}`}
                >
                  {/* 第一行：checkbox + 發票號碼 + 狀態 badge */}
                  <div className="flex items-center gap-2">
                    <Checkbox
                      className="shrink-0"
                      checked={historySelectedIds.has(invoice.invoiceId)}
                      onCheckedChange={() => toggleHistorySelect(invoice.invoiceId)}
                    />
                    <span className="font-medium text-[var(--text-primary)]">{invoice.invoiceId}</span>
                    <span className={`ml-auto inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${INVOICE_STATUS_CLASS[invoice.status] ?? "bg-slate-100 text-slate-700"}`}>
                      {INVOICE_STATUS_LABEL[invoice.status] ?? invoice.status}
                    </span>
                  </div>
                  {/* 第二行：買方名稱 + buyerType 標籤 */}
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-[var(--text-primary)]">{invoice.buyerName}</span>
                    <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${invoice.buyerType === "b2b" || Boolean(invoice.buyerTaxId?.trim()) ? "bg-blue-50 text-blue-700" : "bg-slate-50 text-slate-600"}`}>
                      {invoice.buyerType === "b2b" || Boolean(invoice.buyerTaxId?.trim()) ? "B2B" : "B2C"}
                    </span>
                  </div>
                  {/* 第三行：金額 + 開票日期 */}
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-[var(--text-primary)]">{formatCurrency(invoice.totalAmount)}</span>
                    <span className="text-xs text-[var(--text-secondary)]">{invoice.invoiceDate ? invoice.invoiceDate.slice(0, 10) : ""}</span>
                  </div>
                  {/* 發票號碼（已開立才顯示）*/}
                  {invoice.providerInvoiceNo ? (
                    <div className="text-xs text-emerald-700">發票號碼：{invoice.providerInvoiceNo}</div>
                  ) : null}
                  {invoice.errorMessage ? (
                    <div className="text-xs text-red-600">{invoice.errorMessage}</div>
                  ) : null}
                  {/* 操作按鈕列 */}
                  <div className="flex items-center gap-1 pt-1">
                    {invoice.status === "needs_review" && (
                      <button
                        type="button"
                        title="確認稅率後標記為已開立"
                        className="rounded p-1 text-amber-600 hover:bg-amber-50"
                        onClick={() => {
                          setConfirmReviewForm({ taxType: invoice.taxType ?? 0, notes: "" });
                          setConfirmReviewTarget(invoice);
                        }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </button>
                    )}
                    {invoice.status === "draft" || invoice.status === "failed" ? (
                      <>
                        {invoice.status === "failed" && (
                          <input
                            type="date"
                            className="h-8 rounded border border-[var(--border)] px-1 text-xs"
                            value={reissueDate[invoice.invoiceId] ?? invoice.invoiceDate.slice(0, 10)}
                            onChange={(e) => setReissueDate((prev) => ({ ...prev, [invoice.invoiceId]: e.target.value }))}
                            title="修改發票日期後重新送出"
                          />
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          title="送出開立"
                          onClick={() => void handleIssue(invoice.invoiceId, invoice.status === "failed" ? (reissueDate[invoice.invoiceId] ?? invoice.invoiceDate.slice(0, 10)) : undefined)}
                          disabled={syncingInvoiceId === invoice.invoiceId}
                        >
                          {syncingInvoiceId === invoice.invoiceId ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizonal className="h-4 w-4 text-blue-600" />}
                        </Button>
                      </>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => void handleSync(invoice.invoiceId)} disabled={syncingInvoiceId === invoice.invoiceId}>
                        {syncingInvoiceId === invoice.invoiceId ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                      </Button>
                    )}
                    {invoice.status === "issued" ? (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          title="下載發票圖片"
                          disabled={syncingInvoiceId === invoice.invoiceId}
                          onClick={() => void handleDownloadPicture(invoice)}
                        >
                          {syncingInvoiceId === invoice.invoiceId ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4 text-emerald-600" />
                          )}
                        </Button>
                        {(invoice.buyerType === "b2b" || Boolean(invoice.buyerTaxId?.trim())) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            title="列印 A4 證明聯"
                            onClick={() => window.open(`/api/sheets/einvoices/${encodeURIComponent(invoice.invoiceId)}/print`, "_blank")}
                          >
                            <FileText className="h-4 w-4 text-blue-600" />
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => void handleCancel(invoice)} disabled={syncingInvoiceId === invoice.invoiceId}>
                          <XCircle className="h-4 w-4 text-red-600" />
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              ))
            )}
            {filteredInvoices.length > historyLimit && (
              <button
                type="button"
                className="w-full rounded-md border border-[var(--border)] py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]"
                onClick={() => setHistoryLimit((prev) => prev + 20)}
              >
                顯示更多（已顯示 {Math.min(historyLimit, filteredInvoices.length)} / {filteredInvoices.length} 筆）
              </button>
            )}
          </div>
        </section>
      </div>

      {/* 修改 1c：confirm-review modal */}
      {confirmReviewTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-1 text-sm font-semibold">確認稅型</h2>
            <p className="mb-3 text-xs text-[var(--text-secondary)]">
              {confirmReviewTarget.invoiceId} · {confirmReviewTarget.buyerName}
            </p>
            <div className="mb-3">
              <label className="mb-1 block text-xs font-medium">稅型</label>
              <select
                className="w-full rounded border border-[var(--border)] px-2 py-1.5 text-sm"
                value={confirmReviewForm.taxType}
                onChange={(e) => setConfirmReviewForm((f) => ({ ...f, taxType: Number(e.target.value) as 0 | 1 | 2 | 4 }))}
              >
                <option value={0}>應稅（5%）</option>
                <option value={1}>零稅率</option>
                <option value={2}>免稅</option>
                <option value={4}>特殊稅率</option>
              </select>
            </div>
            <div className="mb-4">
              <label className="mb-1 block text-xs font-medium">備註（選填）</label>
              <input
                className="w-full rounded border border-[var(--border)] px-2 py-1.5 text-sm"
                value={confirmReviewForm.notes}
                onChange={(e) => setConfirmReviewForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="說明確認依據..."
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--surface-muted)]"
                onClick={() => setConfirmReviewTarget(null)}
              >
                取消
              </button>
              <button
                type="button"
                className="rounded bg-amber-600 px-3 py-1.5 text-sm text-white hover:bg-amber-700"
                onClick={async () => {
                  if (!confirmReviewTarget) return;
                  try {
                    const res = await fetch(`/api/sheets/einvoices/${encodeURIComponent(confirmReviewTarget.invoiceId)}/confirm-review`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(confirmReviewForm),
                    });
                    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
                    if (!data.ok) throw new Error(data.error ?? "確認失敗");
                    setConfirmReviewTarget(null);
                    void load({ preserveFeedback: true });
                  } catch (err) {
                    const msg = err instanceof Error ? err.message : "確認失敗";
                    setNotice({ tone: "error", title: "確認稅率失敗", detail: msg });
                  }
                }}
              >
                確認開立
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 修改 2a：作廢原因 modal */}
      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-1 text-sm font-semibold">確認作廢</h2>
            <p className="mb-3 text-xs text-[var(--text-secondary)]">
              {cancelTarget.invoiceId} · {cancelTarget.buyerName}
            </p>
            <div className="mb-4">
              <label className="mb-1 block text-xs font-medium">作廢原因</label>
              <input
                className="w-full rounded border border-[var(--border)] px-2 py-1.5 text-sm"
                value={cancelRemark}
                onChange={(e) => setCancelRemark(e.target.value)}
                placeholder="請輸入作廢原因"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--surface-muted)]"
                onClick={() => setCancelTarget(null)}
              >
                取消
              </button>
              <button
                type="button"
                className="rounded bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700"
                disabled={!cancelRemark.trim()}
                onClick={() => void submitCancel(cancelTarget, cancelRemark)}
              >
                確認作廢
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 修改 2b：批次刪除確認 modal */}
      {confirmDeleteBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-1 text-sm font-semibold">確認刪除</h2>
            <p className="mb-4 text-xs text-[var(--text-secondary)]">
              確定刪除選取的 {historySelectedIds.size} 筆記錄？此操作無法復原。
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--surface-muted)]"
                onClick={() => setConfirmDeleteBatch(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="rounded bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700"
                onClick={() => void submitBatchDelete()}
              >
                確認刪除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 修改 2b：刪除失敗記錄確認 modal */}
      {confirmDeleteFailed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-1 text-sm font-semibold">刪除失敗記錄</h2>
            <p className="mb-4 text-xs text-[var(--text-secondary)]">
              確定刪除所有失敗記錄？此操作無法復原。
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--surface-muted)]"
                onClick={() => setConfirmDeleteFailed(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="rounded bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700"
                onClick={async () => {
                  setConfirmDeleteFailed(false);
                  const res = await fetch("/api/sheets/einvoices/cleanup", { method: "POST" });
                  const data = (await res.json()) as { ok: boolean; message?: string; error?: string };
                  if (data.ok) {
                    setNotice({ tone: "success", title: data.message ?? "刪除完成" });
                    void load({ preserveFeedback: true });
                  } else {
                    setNotice({ tone: "error", title: "刪除失敗", detail: data.error });
                  }
                }}
              >
                確認刪除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 任務 5：批次開票確認 modal */}
      <Dialog open={batchIssueConfirm !== null} onOpenChange={(open) => { if (!open) setBatchIssueConfirm(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>確認批次開立電子發票</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-4">
            <div className="overflow-x-auto rounded border border-[var(--border)]">
              <table className="w-full text-xs">
                <thead className="bg-[var(--surface-muted)]">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">來源編號</th>
                    <th className="px-3 py-2 text-left font-medium">買方名稱</th>
                    <th className="px-3 py-2 text-right font-medium">金額</th>
                  </tr>
                </thead>
                <tbody>
                  {(batchIssueConfirm?.candidates ?? []).map((c) => {
                    const d = drafts[c.candidateId] ?? buildDefaultDraft(c);
                    return (
                      <tr key={c.candidateId} className="border-t border-[var(--border)]">
                        <td className="px-3 py-1.5 text-[var(--text-secondary)]">{c.sourceId}</td>
                        <td className="px-3 py-1.5">{d.buyerName}</td>
                        <td className="px-3 py-1.5 text-right">{formatCurrency(d.totalAmount ?? c.totalAmount)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-[var(--text-secondary)]">
              <span>共 {batchIssueConfirm?.candidates.length ?? 0} 張</span>
              <span className="font-medium text-[var(--text-primary)]">
                總金額 {formatCurrency(
                  (batchIssueConfirm?.candidates ?? []).reduce((sum, c) => {
                    const d = drafts[c.candidateId] ?? buildDefaultDraft(c);
                    return sum + (d.totalAmount ?? c.totalAmount);
                  }, 0),
                )}
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchIssueConfirm(null)}>取消</Button>
            <Button
              onClick={() => { if (batchIssueConfirm) void executeBatchIssue(batchIssueConfirm.candidates); }}
              disabled={issuing}
            >
              {issuing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              確認開立
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 快速開立 modal */}
      <Dialog open={quickCreateOpen} onOpenChange={setQuickCreateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>快速開立電子發票</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 px-1 py-2">
            <div className="space-y-1">
              <Label className="text-xs">買方名稱 *</Label>
              <Input
                placeholder="公司名稱或個人姓名"
                value={quickCreateForm.buyerName}
                onChange={(e) => setQuickCreateForm((f) => ({ ...f, buyerName: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">統編（B2B 填寫，B2C 留空）</Label>
              <Input
                placeholder="12345678"
                maxLength={8}
                value={quickCreateForm.buyerTaxId}
                onChange={(e) => setQuickCreateForm((f) => ({ ...f, buyerTaxId: e.target.value.replace(/\D/g, "") }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">含稅金額 *</Label>
              <Input
                placeholder="1050"
                value={quickCreateForm.totalAmount}
                onChange={(e) => setQuickCreateForm((f) => ({ ...f, totalAmount: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">品項說明（留空同買方名稱）</Label>
              <Input
                placeholder="繃布安裝工程"
                value={quickCreateForm.content}
                onChange={(e) => setQuickCreateForm((f) => ({ ...f, content: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">發票日期</Label>
              <Input
                type="date"
                value={quickCreateForm.invoiceDate}
                onChange={(e) => setQuickCreateForm((f) => ({ ...f, invoiceDate: e.target.value }))}
              />
            </div>
            {quickCreateForm.totalAmount && Number(quickCreateForm.totalAmount.replace(/[,$]/g, "")) > 0 && (
              <p className="text-xs text-[var(--text-secondary)]">
                含稅 {Number(quickCreateForm.totalAmount.replace(/[,$]/g, "")).toLocaleString()} = 未稅 {Math.round(Number(quickCreateForm.totalAmount.replace(/[,$]/g, "")) / 1.05).toLocaleString()} + 稅 {(Number(quickCreateForm.totalAmount.replace(/[,$]/g, "")) - Math.round(Number(quickCreateForm.totalAmount.replace(/[,$]/g, "")) / 1.05)).toLocaleString()}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickCreateOpen(false)} disabled={quickCreating}>取消</Button>
            <Button
              onClick={() => void handleQuickCreate()}
              disabled={quickCreating || !quickCreateForm.buyerName.trim() || !quickCreateForm.totalAmount}
            >
              {quickCreating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              建立並開立
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 任務 13：開票成功 Snackbar */}
      {snackbar && (
        <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg bg-gray-900 px-4 py-3 text-sm text-white shadow-lg">
          <span>{snackbar.message}</span>
          {snackbar.invoiceId && (
            <button
              type="button"
              className="underline hover:no-underline"
              onClick={() => {
                const targetId = snackbar.invoiceId;
                if (!targetId) return;
                setHistoryStatusFilter("all");
                setHistorySearch("");
                // Ensure the row is rendered, then scroll to it
                setTimeout(() => {
                  const el = invoiceRowRefs.current[targetId] ?? document.getElementById(`invoice-row-${targetId}`);
                  if (el) {
                    el.scrollIntoView({ behavior: "smooth", block: "center" });
                    setHighlightedInvoiceId(targetId);
                    setTimeout(() => setHighlightedInvoiceId(null), 1500);
                  }
                }, 100);
              }}
            >
              查看
            </button>
          )}
          <button
            type="button"
            className="ml-2 opacity-60 hover:opacity-100"
            onClick={() => setSnackbar(null)}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
