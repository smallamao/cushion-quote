"use client";

import { useEffect, useMemo, useState } from "react";
import { Banknote, FileText, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
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
import { PDFPreviewModal } from "@/components/pdf/PDFPreviewModal";
import {
  buildStatementFileName,
  generateStatementPdfBlob,
  type StatementData,
} from "@/components/pdf/StatementPDF";
import type { CustomOrder } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  orders: CustomOrder[];
  /** 標記收款後通知父層重新載入訂單 */
  onOrdersChanged: () => void;
}

interface LineDraft {
  orderId: string;
  checked: boolean;
  date: string;
  name: string;
  qty: number;
  unit: string;
  unitPrice: number;
}

type TaxMode = "add5" | "none";

function rocMonthTitleOf(d: Date): string {
  return `${d.getFullYear() - 1911}年${String(d.getMonth() + 1).padStart(2, "0")}月份`;
}

function defaultLineName(o: CustomOrder): string {
  const line1 = o.orderTitle || o.itemCategory || "訂製品";
  const line2 = o.orderNumber ? `#${o.orderNumber}` : "";
  return line2 ? `${line1}\n${line2}` : line1;
}

function lineDate(o: CustomOrder): string {
  return o.installDate || o.completedDate || o.orderDate || "";
}

// 對帳單範圍＝該客戶所有「未收款」訂單（滾存）：沒收款日就會一直出現，收款後消失
function eligibleOrders(orders: CustomOrder[], clientName: string): CustomOrder[] {
  return orders
    .filter(
      (o) =>
        o.clientName === clientName &&
        o.status !== "cancelled" &&
        !o.paidDate &&
        !o.isArchived,
    )
    .sort((a, b) => lineDate(a).localeCompare(lineDate(b)));
}

export function StatementModal({ open, onClose, orders, onOrdersChanged }: Props) {
  const [clientName, setClientName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [taxMode, setTaxMode] = useState<TaxMode>("add5");
  const [monthTitle, setMonthTitle] = useState(() => rocMonthTitleOf(new Date()));
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [companyTaxIds, setCompanyTaxIds] = useState<Map<string, string>>(new Map());
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [fileName, setFileName] = useState("對帳單.pdf");
  const [markOpen, setMarkOpen] = useState(false);
  const [markDate, setMarkDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [marking, setMarking] = useState(false);

  // 有未收款訂單的客戶清單（筆數多的排前面）
  const clientOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const o of orders) {
      if (!o.clientName || o.status === "cancelled" || o.paidDate || o.isArchived) continue;
      counts.set(o.clientName, (counts.get(o.clientName) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [orders]);

  // 客戶資料庫：名稱 → 統編（比對公司全名或簡稱）
  useEffect(() => {
    if (!open) return;
    void (async () => {
      try {
        const res = await fetch("/api/sheets/clients", { cache: "no-store" });
        const json = (await res.json()) as {
          companies?: Array<{ companyName?: string; shortName?: string; taxId?: string }>;
        };
        const map = new Map<string, string>();
        for (const c of json.companies ?? []) {
          if (!c.taxId) continue;
          if (c.companyName) map.set(c.companyName, c.taxId);
          if (c.shortName) map.set(c.shortName, c.taxId);
        }
        setCompanyTaxIds(map);
      } catch {
        /* 拿不到統編就手動填 */
      }
    })();
  }, [open]);

  // 切換客戶：重建明細列、帶入統編與上次的稅別選擇
  useEffect(() => {
    if (!clientName) {
      setLines([]);
      return;
    }
    setLines(
      eligibleOrders(orders, clientName).map((o) => ({
        orderId: o.orderId,
        checked: true,
        date: lineDate(o),
        name: defaultLineName(o),
        qty: 1,
        unit: "式",
        unitPrice: o.quotedAmount || 0,
      })),
    );
    setTaxId(companyTaxIds.get(clientName) ?? "");
    try {
      const saved = localStorage.getItem(`statement-tax:${clientName}`);
      setTaxMode(saved === "none" ? "none" : "add5");
    } catch {
      setTaxMode("add5");
    }
  }, [clientName, orders, companyTaxIds]);

  function updateLine(orderId: string, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l) => (l.orderId === orderId ? { ...l, ...patch } : l)));
  }

  const checked = lines.filter((l) => l.checked);
  const subtotal = checked.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  const taxAmount = taxMode === "add5" ? Math.round(subtotal * 0.05) : 0;
  const total = subtotal + taxAmount;

  function chooseTax(mode: TaxMode) {
    setTaxMode(mode);
    try {
      localStorage.setItem(`statement-tax:${clientName}`, mode);
    } catch {
      /* ignore */
    }
  }

  async function handleGeneratePdf() {
    if (!clientName || checked.length === 0) return;
    setPdfLoading(true);
    try {
      const data: StatementData = {
        rocMonthTitle: monthTitle,
        clientName,
        taxId,
        rows: checked.map((l) => ({
          date: l.date,
          name: l.name,
          qty: l.qty,
          unit: l.unit,
          unitPrice: l.unitPrice,
          amount: l.qty * l.unitPrice,
        })),
        subtotal,
        taxAmount,
        total,
      };
      setFileName(buildStatementFileName(data));
      setPdfBlob(await generateStatementPdfBlob(data));
      setPdfOpen(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : "PDF 產生失敗");
    } finally {
      setPdfLoading(false);
    }
  }

  async function handleMarkPaid() {
    if (checked.length === 0) return;
    setMarking(true);
    try {
      const res = await fetch("/api/sheets/orders/batch-paid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: checked.map((l) => l.orderId), paidDate: markDate }),
      });
      const json = (await res.json()) as { ok: boolean; updated?: number; error?: string };
      if (!json.ok) throw new Error(json.error ?? "標記收款失敗");
      setMarkOpen(false);
      onOrdersChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : "標記收款失敗");
    } finally {
      setMarking(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="flex max-h-[88vh] max-w-4xl flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-[var(--accent)]" />
              請款對帳單
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-wrap items-end gap-3">
            <div className="w-64">
              <Label className="text-xs">客戶（未收款筆數）</Label>
              <Select value={clientName} onValueChange={setClientName}>
                <SelectTrigger>
                  <SelectValue placeholder="選擇客戶" />
                </SelectTrigger>
                <SelectContent>
                  {clientOptions.map(([name, count]) => (
                    <SelectItem key={name} value={name}>
                      {name}（{count}）
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-36">
              <Label className="text-xs">統編</Label>
              <Input value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="8 碼" />
            </div>
            <div className="w-40">
              <Label className="text-xs">對帳單標題月份</Label>
              <Input value={monthTitle} onChange={(e) => setMonthTitle(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">稅別</Label>
              <div className="flex overflow-hidden rounded-md border border-[var(--border)] text-xs">
                {([["add5", "+5%"], ["none", "免稅"]] as const).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => chooseTax(mode)}
                    className={`px-3 py-1.5 transition-colors ${taxMode === mode ? "bg-[var(--accent)] text-white" : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto rounded border border-[var(--border)]">
            {!clientName ? (
              <p className="p-6 text-center text-sm text-[var(--text-tertiary)]">
                選擇客戶後，會自動列出該客戶所有未收款的訂單（含前期未結）。
              </p>
            ) : lines.length === 0 ? (
              <p className="p-6 text-center text-sm text-[var(--text-tertiary)]">
                此客戶目前沒有未收款的訂單 🎉
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-[var(--surface-2)] text-xs text-[var(--text-secondary)]">
                  <tr>
                    <th className="w-8 px-2 py-2"></th>
                    <th className="w-28 px-2 py-2 text-left">日期</th>
                    <th className="px-2 py-2 text-left">品名（可編輯，換行＝第二行）</th>
                    <th className="w-16 px-2 py-2 text-right">數量</th>
                    <th className="w-16 px-2 py-2 text-left">單位</th>
                    <th className="w-24 px-2 py-2 text-right">單價</th>
                    <th className="w-24 px-2 py-2 text-right">金額</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.orderId} className={`border-t border-[var(--border)] ${l.checked ? "" : "opacity-40"}`}>
                      <td className="px-2 py-1.5 text-center">
                        <Checkbox
                          checked={l.checked}
                          onCheckedChange={(v) => updateLine(l.orderId, { checked: v === true })}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          type="date"
                          className="h-8 text-xs"
                          value={l.date}
                          onChange={(e) => updateLine(l.orderId, { date: e.target.value })}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <textarea
                          className="w-full resize-none rounded border border-[var(--border)] bg-transparent px-2 py-1 text-xs"
                          rows={2}
                          value={l.name}
                          onChange={(e) => updateLine(l.orderId, { name: e.target.value })}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          type="number"
                          className="h-8 text-right text-xs"
                          value={l.qty}
                          min={1}
                          onChange={(e) => updateLine(l.orderId, { qty: Number(e.target.value) || 1 })}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          className="h-8 text-xs"
                          value={l.unit}
                          onChange={(e) => updateLine(l.orderId, { unit: e.target.value })}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          type="number"
                          className="h-8 text-right text-xs"
                          value={l.unitPrice}
                          min={0}
                          onChange={(e) => updateLine(l.orderId, { unitPrice: Number(e.target.value) || 0 })}
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-xs">
                        ${(l.qty * l.unitPrice).toLocaleString("zh-TW")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {clientName && lines.length > 0 && (
            <div className="flex items-center justify-end gap-6 text-sm">
              <span>小計 <span className="font-mono">${subtotal.toLocaleString("zh-TW")}</span></span>
              <span>稅額 <span className="font-mono">${taxAmount.toLocaleString("zh-TW")}</span></span>
              <span className="font-semibold">總額 <span className="font-mono text-[var(--accent)]">${total.toLocaleString("zh-TW")}</span></span>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              disabled={checked.length === 0 || marking}
              onClick={() => setMarkOpen(true)}
              title="客戶付款後，把勾選的訂單標記為已收款（下期對帳單不再出現）"
            >
              <Banknote className="mr-1 h-4 w-4" />
              標記已收款（{checked.length}）
            </Button>
            <Button onClick={() => void handleGeneratePdf()} disabled={!clientName || checked.length === 0 || pdfLoading}>
              {pdfLoading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileText className="mr-1 h-4 w-4" />}
              產生對帳單 PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PDFPreviewModal
        open={pdfOpen}
        onOpenChange={setPdfOpen}
        pdfBlob={pdfBlob}
        fileName={fileName}
        loading={pdfLoading}
      />

      {/* 標記收款確認 */}
      <Dialog open={markOpen} onOpenChange={(o) => { if (!o && !marking) setMarkOpen(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>標記已收款</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-[var(--text-secondary)]">
              將 <span className="font-semibold">{clientName}</span> 勾選中的{" "}
              <span className="font-semibold">{checked.length}</span> 筆訂單
              （合計 ${total.toLocaleString("zh-TW")}）標記為已收款，之後不再出現在對帳單。
            </p>
            <div>
              <Label className="text-xs">收款日期</Label>
              <Input type="date" value={markDate} onChange={(e) => setMarkDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMarkOpen(false)} disabled={marking}>
              取消
            </Button>
            <Button onClick={() => void handleMarkPaid()} disabled={marking}>
              {marking ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Banknote className="mr-1 h-4 w-4" />}
              確認收款
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
