"use client";

import { Download, Loader2, ReceiptText, RefreshCw, RotateCcw, SendHorizonal, XCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { EInvoiceCandidate, EInvoiceRecord } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface DraftOverride {
  buyerType: "b2b" | "b2c";
  buyerName: string;
  buyerTaxId: string;
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

interface CandidateDraftSnapshot {
  candidate: EInvoiceCandidate;
  draft: DraftOverride;
}

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
      const effectiveRatePercent = (draft.taxRate ?? candidate.taxRate) / 100;
      const effectiveUntaxed = effectiveRatePercent > 0 ? Math.round(effectiveTotal / (1 + effectiveRatePercent)) : effectiveTotal;
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
          email: draft.email,
          carrierType: draft.carrierType,
          carrierValue: draft.carrierValue,
          donationCode: draft.donationCode,
          invoiceDate: candidate.invoiceDate,
          taxType: 0,
          totalAmount: effectiveTotal,
          taxRate: effectiveRatePercent,
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

  async function handleBatchIssue() {
    if (selectedCandidates.length === 0) {
      setNotice({ tone: "info", title: "請至少勾選一筆待開資料" });
      return;
    }
    setIssuing(true);
    setBatchReport(null);
    setNotice({ tone: "info", title: `正在批次開立 ${selectedCandidates.length} 筆電子發票...` });
    const snapshots: CandidateDraftSnapshot[] = selectedCandidates.map((candidate) => ({
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
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "同步失敗");
      }
      setNotice({ tone: "success", title: `已同步發票 ${invoiceId}` });
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
      await load({ preserveFeedback: true });
    } catch (err) {
      setNotice({ tone: "error", title: "開立失敗", detail: err instanceof Error ? err.message : "開立失敗" });
    } finally {
      setSyncingInvoiceId("");
    }
  }

  async function handleCancel(invoice: EInvoiceRecord) {
    const remark = window.prompt("請輸入作廢原因", invoice.cancelReason || "客戶要求作廢");
    if (!remark) return;
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
          <Button onClick={() => void handleBatchIssue()} disabled={issuing || selectedCandidates.length === 0}>
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
            {candidates.length === 0 ? (
              <div className="rounded-md bg-[var(--surface-muted)] px-4 py-6 text-sm text-[var(--text-secondary)]">目前沒有可開立的候選資料。</div>
            ) : (
              candidates.map((candidate) => {
                const draft = drafts[candidate.candidateId] ?? buildDefaultDraft(candidate);
                const disabled = issuing || Boolean(candidate.existingInvoiceId);
                return (
                  <div key={candidate.candidateId} className="rounded-lg border border-[var(--border)] p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
<div className="flex items-start gap-3">
                          <Checkbox checked={selectedIds.includes(candidate.candidateId)} onCheckedChange={(checked) => toggleCandidate(candidate.candidateId, checked === true)} disabled={disabled} />
                          <div>
                            <div className="font-medium text-[var(--text-primary)]">{candidate.projectName || candidate.clientName}</div>
                            <div className="mt-1 text-xs text-[var(--text-secondary)]">
                              {candidate.sourceType} / {candidate.sourceId} / 金額 {formatCurrency(draft.totalAmount ?? candidate.totalAmount)}
                            </div>
                            {candidate.existingInvoiceId ? (
                              <div className="mt-1 text-xs text-emerald-700">已開立：{candidate.existingInvoiceId}（{candidate.existingInvoiceStatus}）</div>
                            ) : null}
                          </div>
                        </div>
                        {!disabled && (
                          <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={() => void removeCandidate(candidate.candidateId)}>
                            移除
                          </Button>
                        )}
                      <div className="text-xs text-[var(--text-secondary)]">
                        客戶：{candidate.clientName} / 聯絡人：{candidate.contactName || "—"}
                      </div>
                    </div>

                    {!disabled ? (
                      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
                            onChange={(e) => updateDraft(candidate.candidateId, { taxRate: Number(e.target.value) / 100 })}
                          />
                        </div>
                      </div>
                    ) : null}
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
            <h2 className="text-sm font-medium">開票歷史</h2>
            <span className="text-xs text-[var(--text-secondary)]">{invoices.length} 筆</span>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              title="從事件紀錄重建遺失的主紀錄，並修正卡在 draft/issuing 的已開立發票"
              onClick={async () => {
                const res = await fetch("/api/sheets/einvoices/reconcile", { method: "POST" });
                const data = (await res.json()) as { ok: boolean; message?: string; error?: string; newRecords?: EInvoiceRecord[]; updatedRecords?: EInvoiceRecord[] };
                if (data.ok) {
                  setNotice({ tone: "success", title: data.message ?? "修復完成" });
                  // Merge recovered records immediately into state (don't wait for Sheets propagation)
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
                  // Also reload in background so Sheets eventually catches up
                  void load({ preserveFeedback: true });
                } else {
                  setNotice({ tone: "error", title: "修復失敗", detail: data.error });
                }
              }}
            >
              修復遺失記錄
            </Button>
            {invoices.some((inv) => inv.status === "failed") && (
              <Button
                size="sm"
                variant="destructive"
                onClick={async () => {
                  if (!confirm("確定刪除所有失敗記錄？")) return;
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
                刪除失敗記錄
              </Button>
            )}
          </div>

          <div className="space-y-3">
            {invoices.length === 0 ? (
              <div className="rounded-md bg-[var(--surface-muted)] px-4 py-6 text-sm text-[var(--text-secondary)]">尚無開票紀錄。</div>
            ) : (
              invoices.slice(0, 20).map((invoice) => (
                <div key={invoice.invoiceId} className="rounded-lg border border-[var(--border)] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">{invoice.invoiceId}</div>
                      <div className="mt-1 text-xs text-[var(--text-secondary)]">
                        {invoice.buyerName} / {formatCurrency(invoice.totalAmount)} / {invoice.status}
                      </div>
                      {invoice.providerInvoiceNo ? (
                        <div className="mt-1 text-xs text-emerald-700">發票號碼：{invoice.providerInvoiceNo}</div>
                      ) : null}
                      {invoice.errorMessage ? (
                        <div className="mt-1 text-xs text-red-600">{invoice.errorMessage}</div>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-1">
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
                          <a
                            href={`/api/sheets/einvoices/${encodeURIComponent(invoice.invoiceId)}/picture?type=1${invoice.providerInvoiceNo ? `&code=${encodeURIComponent(invoice.providerInvoiceNo)}` : ""}`}
                            download
                            title="下載發票圖片"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent"
                          >
                            <Download className="h-4 w-4 text-emerald-600" />
                          </a>
                          <Button variant="ghost" size="sm" onClick={() => void handleCancel(invoice)} disabled={syncingInvoiceId === invoice.invoiceId}>
                            <XCircle className="h-4 w-4 text-red-600" />
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
