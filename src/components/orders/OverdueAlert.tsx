"use client";

import { AlertTriangle } from "lucide-react";

import type { OverdueItem } from "@/lib/order-overdue";

/**
 * 在製品超期警示列 —— 放在訂製訂單清單【上方】，不動原本的排序。
 *
 * 🔴 為什麼不是改排序：order-sort.ts 的順序老闆調過好幾次
 *    （2026-11-05 才把安裝日翻成「有日期優先」），那是用出來的經驗，不該為了
 *    讓超期單浮上來而推翻。
 * 🔴 為什麼全綠時整條消失：2026-11-10 實測 18 筆在製品只有 2 筆超期。
 *    常態顯示等於天天看一條綠字，看久了就會略過，真的紅了也不會注意。
 */

interface Props {
  items: OverdueItem[];
  /** 點「只看這幾筆」時把清單篩成這些單號 */
  onFocus: (orderNumbers: string[]) => void;
}

const money = (n: number) => `$${Number(n || 0).toLocaleString("en-US")}`;

export function OverdueAlert({ items, onFocus }: Props) {
  if (items.length === 0) return null;

  const total = items.reduce((sum, x) => sum + (x.order.quotedAmount || 0), 0);
  const critical = items.filter((x) => x.level === "critical");

  return (
    <div className="rounded-lg border border-[var(--danger)] bg-[var(--danger-bg,rgba(220,38,38,0.06))] p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--danger)]">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            {items.length} 筆超過承諾交期　合計 {money(total)}
            {critical.length > 0 && `　（其中 ${critical.length} 筆嚴重超期）`}
          </span>
        </div>
        <button
          type="button"
          onClick={() => onFocus(items.map((x) => x.order.orderNumber).filter(Boolean))}
          className="self-start rounded border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1 text-xs hover:bg-[var(--bg-hover)] sm:self-auto"
        >
          只看這幾筆
        </button>
      </div>

      <ul className="mt-2 space-y-1.5">
        {items.map((x) => (
          <li key={x.order.orderId} className="text-xs">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span>{x.level === "critical" ? "🔴" : "🟡"}</span>
              <span className="font-medium">{x.order.clientName || "（無名）"}</span>
              <span className="text-[var(--text-secondary)]">{x.order.orderNumber}</span>
              <span className="text-[var(--text-secondary)]">{x.order.itemCategory}</span>
              <span>
                {x.days}/{x.promise} 工作天
                <span className="ml-1 font-medium text-[var(--danger)]">超出 {x.over} 天</span>
              </span>
              <span className="ml-auto tabular-nums">{money(x.order.quotedAmount)}</span>
            </div>
            <div className="pl-6 text-[var(--text-secondary)]">
              {x.order.orderTitle || "（無標題）"}
              {x.order.orderDate && ` · ${x.order.orderDate.slice(5)} 下單`}
              {/* 叫料日 8% 填寫率（2026-11-10）：沒填就分不出卡在等料還是做工 */}
              {!x.order.supplierOrderDate && " · ⚠ 叫料日未填，分不出卡在等料還是做工"}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
