"use client";

import { useMemo } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { REWORK_TRACKING_SINCE, summarizeReworks, type ReworkStat } from "@/lib/order-rework";
import type { CustomOrder } from "@/lib/types";

/**
 * 重做統計。
 *
 * 🔴 分母一定要跟數字一起講。這裡的重做率只算 REWORK_TRACKING_SINCE 之後的訂單——
 *    把舊單當成「零次重做」平均進去，會算出一個漂亮但假的低百分比。
 *    剛上線的頭幾週樣本本來就少，畫面上直接寫出「n 張裡面有 m 張」，
 *    比寫「2.1%」誠實。
 */

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orders: CustomOrder[];
}

function Bar({ stats, total }: { stats: ReworkStat[]; total: number }) {
  if (stats.length === 0) {
    return <div className="text-xs text-[var(--text-tertiary)]">—</div>;
  }
  return (
    <ul className="space-y-1">
      {stats.map((s) => (
        <li key={s.key} className="flex items-center gap-2 text-xs">
          <span className="w-20 shrink-0">{s.key}</span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--bg-hover)]">
            <span
              className="block h-full rounded-full bg-[var(--accent)]"
              style={{ width: `${total > 0 ? (s.count / total) * 100 : 0}%` }}
            />
          </span>
          <span className="w-8 shrink-0 text-right tabular-nums">{s.count}</span>
        </li>
      ))}
    </ul>
  );
}

export function ReworkStatsModal({ open, onOpenChange, orders }: Props) {
  const s = useMemo(() => summarizeReworks(orders), [orders]);

  const recent = useMemo(() => {
    const rows = orders.flatMap((o) => (o.reworks ?? []).map((r) => ({ r, o })));
    return rows.sort((a, b) => b.r.at.localeCompare(a.r.at)).slice(0, 20);
  }, [orders]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>重做統計</DialogTitle>
          <DialogDescription>
            {REWORK_TRACKING_SINCE} 開始記錄。更早的訂單沒有紀錄機制，不列入分母。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 px-6 py-4">
          <div className="rounded border border-[var(--border)] p-3">
            {s.scopeOrders === 0 ? (
              <div className="text-sm text-[var(--text-secondary)]">
                {REWORK_TRACKING_SINCE} 之後還沒有新訂單，沒有可以算的分母。
              </div>
            ) : (
              <div className="text-sm">
                <span className="text-lg font-semibold tabular-nums">
                  {s.orderCount} / {s.scopeOrders}
                </span>
                <span className="ml-2 text-[var(--text-secondary)]">
                  張訂單有重做（{(s.rate * 100).toFixed(1)}%）
                </span>
                <span className="ml-2 text-[var(--text-secondary)]">共 {s.total} 筆</span>
              </div>
            )}
            {s.scopeOrders > 0 && s.scopeOrders < 20 && (
              <div className="mt-1 text-xs text-[var(--text-tertiary)]">
                樣本只有 {s.scopeOrders} 張，這個百分比還不能拿來下判斷，先看絕對次數。
              </div>
            )}
            {s.unknownCause > 0 && (
              <div className="mt-1 text-xs text-[var(--text-secondary)]">
                其中 {s.unknownCause} 筆還沒查出根因 —— 查到了回訂單裡補。
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="mb-1.5 text-xs font-medium">錯在哪（症狀）</div>
              <Bar stats={s.bySymptom} total={s.total} />
            </div>
            <div>
              <div className="mb-1.5 text-xs font-medium">哪一關出錯（歸因）</div>
              <Bar stats={s.byCause} total={s.total} />
            </div>
            <div>
              <div className="mb-1.5 text-xs font-medium">何時發現</div>
              <Bar stats={s.byFoundAt} total={s.total} />
            </div>
            <div>
              <div className="mb-1.5 text-xs font-medium">哪個品類</div>
              <Bar stats={s.byCategory} total={s.total} />
            </div>
          </div>

          {recent.length > 0 && (
            <div>
              <div className="mb-1.5 text-xs font-medium">最近 {recent.length} 筆</div>
              <ul className="space-y-1">
                {recent.map(({ r, o }) => (
                  <li key={r.id} className="text-xs">
                    <span className="text-[var(--text-secondary)]">{r.at.slice(0, 10)}</span>
                    <span className="ml-2 font-medium">{o.clientName}</span>
                    <span className="ml-1 text-[var(--text-secondary)]">{o.orderNumber}</span>
                    <span className="ml-2">{r.itemName || "整張單"}</span>
                    <span className="ml-2">{r.symptom}</span>
                    <span className="ml-1 text-[var(--text-secondary)]">
                      {r.cause ? `← ${r.cause}` : "← 根因未查"}　{r.foundAt}
                    </span>
                    {r.note && <div className="pl-4 text-[var(--text-tertiary)]">{r.note}</div>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
