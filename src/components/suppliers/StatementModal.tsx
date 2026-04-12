"use client";

import { useEffect, useMemo, useState } from "react";

import { usePurchases } from "@/hooks/usePurchases";
import type { PurchaseOrder, Supplier } from "@/lib/types";
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

interface StatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  supplier: Supplier | null;
}

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function normalizeOrderMonth(orderDate: string): string {
  const match = orderDate.trim().replace(/\//g, "-").match(/^(\d{4})-(\d{1,2})/);
  if (!match) return "";
  return `${match[1]}-${match[2].padStart(2, "0")}`;
}

function formatMonthRange(month: string): string {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return "請選擇有效月份";
  }

  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;

  if (monthIndex < 0 || monthIndex > 11) {
    return "請選擇有效月份";
  }

  const start = new Date(year, monthIndex, 1);
  const end = new Date(year, monthIndex + 1, 0);

  const formatter = new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return `${formatter.format(start)} - ${formatter.format(end)}`;
}

function buildStatementFileName(supplier: Supplier, month: string): string {
  const supplierName = (supplier.shortName || supplier.name)
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return `statement-${supplierName || supplier.supplierId}-${month}.pdf`;
}

function sumOrderAmounts(orders: PurchaseOrder[]): number {
  return orders.reduce((total, order) => total + order.totalAmount, 0);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "產生 PDF 失敗，請稍後再試。";
}

export function StatementModal({ isOpen, onClose, supplier }: StatementModalProps) {
  const { orders, loading } = usePurchases();
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!isOpen) {
      setErrorMessage("");
      setSelectedMonth(getCurrentMonth());
    }
  }, [isOpen]);

  const monthOrders = useMemo(() => {
    if (!supplier) return [];

    return orders
      .filter((order) => order.supplierId === supplier.supplierId)
      .filter((order) => order.status !== "cancelled")
      .filter((order) => normalizeOrderMonth(order.orderDate) === selectedMonth)
      .sort((a, b) => a.orderDate.localeCompare(b.orderDate));
  }, [orders, selectedMonth, supplier]);

  const estimatedTotal = useMemo(() => sumOrderAmounts(monthOrders), [monthOrders]);
  const isMonthValid = /^\d{4}-\d{2}$/.test(selectedMonth);

  async function handleGenerate() {
    if (!supplier || !isMonthValid) return;

    setIsGenerating(true);
    setErrorMessage("");

    try {
      const response = await fetch(
        `/api/sheets/suppliers/${supplier.supplierId}/statement?month=${selectedMonth}`,
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error || "產生 PDF 失敗");
      }

      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = buildStatementFileName(supplier, selectedMonth);
      link.click();
      window.URL.revokeObjectURL(objectUrl);
      onClose();
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            產生對帳報表{supplier ? ` - ${supplier.shortName || supplier.name}` : ""}
          </DialogTitle>
          <DialogDescription>
            選擇月份後，系統會依該廠商當月採購單自動產生 PDF 對帳報表。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-6 py-5">
          <div className="space-y-2">
            <Label htmlFor="statement-month">選擇月份</Label>
            <Input
              id="statement-month"
              type="month"
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
              max={getCurrentMonth()}
            />
          </div>

          <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-[var(--text-secondary)]">預覽範圍</p>
                <p className="mt-1 font-medium text-[var(--text-primary)]">
                  {formatMonthRange(selectedMonth)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-[var(--text-secondary)]">載入狀態</p>
                <p className="mt-1 font-medium text-[var(--text-primary)]">
                  {loading ? "讀取採購單中..." : "已就緒"}
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-[var(--radius-sm)] bg-[var(--bg-elevated)] p-3">
                <p className="text-xs text-[var(--text-secondary)]">符合採購單</p>
                <p className="mt-1 text-lg font-semibold text-[var(--text-primary)]">
                  {monthOrders.length} 筆
                </p>
              </div>
              <div className="rounded-[var(--radius-sm)] bg-[var(--bg-elevated)] p-3 text-right">
                <p className="text-xs text-[var(--text-secondary)]">預估總額</p>
                <p className="mt-1 text-lg font-semibold text-[var(--text-primary)]">
                  {new Intl.NumberFormat("zh-TW", {
                    style: "currency",
                    currency: "TWD",
                    maximumFractionDigits: 0,
                  }).format(estimatedTotal)}
                </p>
              </div>
            </div>
          </div>

          {errorMessage ? (
            <div className="rounded-[var(--radius-sm)] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {errorMessage}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isGenerating}>
            取消
          </Button>
          <Button onClick={handleGenerate} disabled={!supplier || !isMonthValid || isGenerating}>
            {isGenerating ? "產生中..." : "產生 PDF"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
