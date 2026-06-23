"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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
import { Printer } from "lucide-react";
import type { CustomOrder } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  orders: CustomOrder[];
  selectedMonth: string;
  onMonthChange: (m: string) => void;
  months: string[];
}

function toRocMonth(isoMonth: string): string {
  // isoMonth = "2026-05"
  const [y, m] = isoMonth.split("-");
  const roc = parseInt(y) - 1911;
  return `${roc}.${m}`;
}

function fmtMoney(n: number): string {
  return `$${n.toLocaleString("zh-TW", { maximumFractionDigits: 0 })}`;
}

export function MonthlyReportModal({
  open,
  onClose,
  orders,
  selectedMonth,
  onMonthChange,
  months,
}: Props) {
  const printRef = useRef<HTMLDivElement>(null);

  const filtered = orders
    .filter((o) => {
      const date = o.installDate || o.completedDate;
      return date?.startsWith(selectedMonth);
    })
    .sort((a, b) => (a.installDate || "").localeCompare(b.installDate || ""));

  const total = filtered.reduce((s, o) => s + (o.quotedAmount || 0), 0);

  const title = selectedMonth !== "all"
    ? `${toRocMonth(selectedMonth)} 訂製出貨明細`
    : "訂製出貨明細";

  function handlePrint() {
    const content = printRef.current;
    if (!content) return;
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) return;
    w.document.write(`
      <!DOCTYPE html>
      <html><head>
        <meta charset="utf-8"/>
        <title>${title}</title>
        <style>
          body { font-family: sans-serif; font-size: 13px; padding: 24px; }
          h2 { font-size: 18px; margin-bottom: 16px; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }
          th { background: #f0f0f0; font-weight: bold; }
          .total td { font-weight: bold; background: #f9f9f9; }
          .money { text-align: right; }
        </style>
      </head><body>
        <h2>${title}</h2>
        ${content.innerHTML}
      </body></html>
    `);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 300);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>訂製出貨月報</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-3 pb-2">
          <Select value={selectedMonth} onValueChange={onMonthChange}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="選擇月份" />
            </SelectTrigger>
            <SelectContent>
              {months.map((m) => (
                <SelectItem key={m} value={m}>
                  {toRocMonth(m)}（{m}）
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-[var(--text-secondary)]">
            共 {filtered.length} 筆
          </span>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            onClick={handlePrint}
            disabled={filtered.length === 0}
          >
            <Printer className="h-3.5 w-3.5 mr-1" />
            列印
          </Button>
        </div>

        <div className="overflow-auto flex-1">
          <div ref={printRef}>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-[var(--surface-2)] text-xs">
                  <th className="border border-[var(--border)] px-3 py-2 text-left w-24">單號</th>
                  <th className="border border-[var(--border)] px-3 py-2 text-left">品項</th>
                  <th className="border border-[var(--border)] px-3 py-2 text-left w-24">下單日</th>
                  <th className="border border-[var(--border)] px-3 py-2 text-right w-24">金額</th>
                  <th className="border border-[var(--border)] px-3 py-2 text-left w-24">出貨日</th>
                  <th className="border border-[var(--border)] px-3 py-2 text-left w-32">備注</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="border border-[var(--border)] px-3 py-8 text-center text-[var(--text-tertiary)]">
                      此月份無出貨記錄
                    </td>
                  </tr>
                )}
                {filtered.map((o) => (
                  <tr key={o.orderId} className="hover:bg-[var(--bg-hover)]">
                    <td className="border border-[var(--border)] px-3 py-2 font-mono text-xs text-[var(--accent)]">
                      {o.orderNumber || o.orderId}
                    </td>
                    <td className="border border-[var(--border)] px-3 py-2">
                      {o.orderTitle || o.itemCategory || "—"}
                    </td>
                    <td className="border border-[var(--border)] px-3 py-2 text-xs">
                      {o.orderDate || "—"}
                    </td>
                    <td className="border border-[var(--border)] px-3 py-2 text-right font-medium">
                      {o.quotedAmount ? fmtMoney(o.quotedAmount) : "—"}
                    </td>
                    <td className="border border-[var(--border)] px-3 py-2 text-xs">
                      {o.installDate || o.completedDate || "—"}
                    </td>
                    <td className="border border-[var(--border)] px-3 py-2 text-xs text-[var(--text-secondary)]">
                      {o.internalNotes || ""}
                    </td>
                  </tr>
                ))}
                {filtered.length > 0 && (
                  <tr className="font-bold bg-[var(--surface-2)]">
                    <td colSpan={3} className="border border-[var(--border)] px-3 py-2 text-right">
                      總金額
                    </td>
                    <td className="border border-[var(--border)] px-3 py-2 text-right">
                      {fmtMoney(total)}
                    </td>
                    <td colSpan={2} className="border border-[var(--border)] px-3 py-2" />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
