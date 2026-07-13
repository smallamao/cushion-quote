"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Calculator, Check, ChevronRight, Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { calculateFabricNeeded } from "@/lib/dimension-parser";
import type { CustomOrder, OrderItem } from "@/lib/types";

export interface SuggestedItem {
  colorCode: string;
  itemName: string;
  dimensions: string;
  suggestedQty: number;
  orderNumber: string;
  orderId: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  fabricWidthCm?: number;
  onConfirm: (items: SuggestedItem[]) => void;
}

interface OrderSummary {
  orderId: string;
  orderNumber: string;
  clientName: string;
  orderTitle: string;
  orderDate: string;
}

type Step = "search" | "items";

export function WorkOrderSuggestDialog({
  open,
  onClose,
  fabricWidthCm = 145,
  onConfirm,
}: Props) {
  const [step, setStep] = useState<Step>("search");
  const [q, setQ] = useState("");
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<CustomOrder | null>(null);
  const [loadingOrder, setLoadingOrder] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [width, setWidth] = useState(fabricWidthCm);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setStep("search");
      setQ("");
      setOrders([]);
      setSelectedOrder(null);
      setCheckedIds(new Set());
      setWidth(fabricWidthCm);
    }
  }, [open, fabricWidthCm]);

  const fetchOrders = useCallback(async (query: string) => {
    setLoadingOrders(true);
    try {
      const url = query.trim() ? `/api/sheets/orders?q=${encodeURIComponent(query.trim())}` : "/api/sheets/orders";
      const res = await fetch(url);
      const json = (await res.json()) as { ok: boolean; orders?: CustomOrder[] };
      if (json.ok) {
        setOrders(
          (json.orders ?? []).slice(0, 50).map((o) => ({
            orderId: o.orderId,
            orderNumber: o.orderNumber,
            clientName: o.clientName,
            orderTitle: o.orderTitle,
            orderDate: o.orderDate,
          })),
        );
      }
    } finally {
      setLoadingOrders(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => void fetchOrders(q), 350);
    return () => clearTimeout(t);
  }, [q, open, fetchOrders]);

  async function selectOrder(orderId: string) {
    setLoadingOrder(true);
    try {
      const res = await fetch(`/api/sheets/orders/${orderId}`);
      const json = (await res.json()) as { ok: boolean; order?: CustomOrder };
      if (json.ok && json.order) {
        setSelectedOrder(json.order);
        // auto-check all items that have dimensions (色號非必要，有尺寸即可計算)
        const autoCheck = new Set<string>(
          json.order.items
            .filter((it) => it.itemType !== "header" && it.dimensions)
            .map((it) => it.id),
        );
        setCheckedIds(autoCheck);
        setStep("items");
      }
    } finally {
      setLoadingOrder(false);
    }
  }

  function toggleItem(id: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleConfirm() {
    if (!selectedOrder) return;
    const result: SuggestedItem[] = selectedOrder.items
      .filter((it) => checkedIds.has(it.id) && it.dimensions)
      .map((it: OrderItem) => {
        const calc = calculateFabricNeeded({
          dimensions: it.dimensions,
          fabricWidthCm: width,
          unit: "碼",
        });
        return {
          colorCode: it.colorCode ?? "",
          itemName: it.name,
          dimensions: it.dimensions,
          suggestedQty: calc.suggestedQty,
          orderNumber: selectedOrder.orderNumber || selectedOrder.orderId,
          orderId: selectedOrder.orderId,
        };
      });
    onConfirm(result);
    onClose();
  }

  const eligibleItems =
    selectedOrder?.items.filter(
      (it) => it.itemType !== "header",
    ) ?? [];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-4 w-4 text-[var(--accent)]" />
            從工單計算建議用量
          </DialogTitle>
        </DialogHeader>

        {step === "search" && (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-tertiary)]" />
              <Input
                ref={searchRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="搜尋工單號、客戶名稱…"
                className="pl-8 text-sm"
                autoFocus
              />
            </div>

            <div className="max-h-72 overflow-y-auto rounded-md border border-[var(--border)] divide-y divide-[var(--border)]">
              {loadingOrders && (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-[var(--text-secondary)]" />
                </div>
              )}
              {!loadingOrders && orders.length === 0 && (
                <div className="py-6 text-center text-sm text-[var(--text-tertiary)]">無符合結果</div>
              )}
              {!loadingOrders && orders.map((o) => (
                <button
                  key={o.orderId}
                  type="button"
                  disabled={loadingOrder}
                  onClick={() => void selectOrder(o.orderId)}
                  className="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-[var(--bg-hover)] disabled:opacity-50"
                >
                  <div>
                    <div className="text-xs font-mono text-[var(--accent)]">{o.orderNumber || o.orderId}</div>
                    <div className="text-sm font-medium">{o.clientName}</div>
                    {o.orderTitle && (
                      <div className="text-xs text-[var(--text-secondary)] truncate max-w-xs">{o.orderTitle}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[var(--text-tertiary)]">{o.orderDate}</span>
                    {loadingOrder ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === "items" && selectedOrder && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setStep("search")}
                className="text-xs text-[var(--accent)] hover:underline"
              >
                ← 換工單
              </button>
              <span className="text-sm font-medium">
                {selectedOrder.orderNumber} · {selectedOrder.clientName}
              </span>
            </div>

            {/* Fabric width input */}
            <div className="flex items-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 bg-[var(--bg-subtle)]">
              <Label className="text-xs shrink-0 text-[var(--text-secondary)]">布幅（cm）</Label>
              <Input
                type="number"
                value={width}
                onChange={(e) => setWidth(Number(e.target.value))}
                className="h-7 w-20 text-sm"
                min={50}
                max={300}
              />
              <span className="text-[11px] text-[var(--text-tertiary)]">預設 145cm，可依實際布幅調整</span>
            </div>

            {/* Items list */}
            <div className="max-h-64 overflow-y-auto rounded-md border border-[var(--border)] divide-y divide-[var(--border)]">
              {eligibleItems.length === 0 && (
                <div className="py-6 text-center text-sm text-[var(--text-tertiary)]">此工單無品項</div>
              )}
              {eligibleItems.map((it) => {
                // 只要有尺寸就能計算用量；色號僅為標記，不影響布料計算
                const hasCalc = !!it.dimensions;
                const calc = hasCalc
                  ? calculateFabricNeeded({ dimensions: it.dimensions, fabricWidthCm: width, unit: "碼" })
                  : null;
                const checked = checkedIds.has(it.id);
                return (
                  <label
                    key={it.id}
                    className={`flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-[var(--bg-hover)] ${!hasCalc ? "opacity-50" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!hasCalc}
                      onChange={() => toggleItem(it.id)}
                      className="mt-0.5 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {it.colorCode ? (
                          <span className="font-mono text-xs font-semibold text-red-600">{it.colorCode}</span>
                        ) : (
                          <span className="text-xs text-[var(--text-tertiary)]">無色號</span>
                        )}
                        <span className="text-sm truncate">{it.name}</span>
                      </div>
                      {it.dimensions && (
                        <div className="text-[10px] text-[var(--text-secondary)] mt-0.5 whitespace-pre-line leading-tight">
                          {it.dimensions}
                        </div>
                      )}
                      {!it.dimensions && (
                        <div className="text-[10px] text-[var(--text-tertiary)]">無尺寸資料，無法計算</div>
                      )}
                    </div>
                    {calc && (
                      <div className="shrink-0 text-right">
                        <div className="text-sm font-bold text-[var(--accent)]">{calc.suggestedQty} 碼</div>
                        {checked && <Check className="ml-auto h-3 w-3 text-green-500" />}
                      </div>
                    )}
                  </label>
                );
              })}
            </div>

            <div className="text-xs text-[var(--text-tertiary)]">
              已選 {checkedIds.size} 項 · 含 10% 損耗、每邊 +10cm 包邊
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          {step === "items" && (
            <Button
              onClick={handleConfirm}
              disabled={checkedIds.size === 0}
            >
              加入採購單（{checkedIds.size} 項）
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
