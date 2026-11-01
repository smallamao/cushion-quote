"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Factory } from "lucide-react";

import type { ProductionOrderView } from "@/lib/production-orders";
import { dueLabel, groupProductionOrders, type ProductionGroupKey } from "@/lib/production-groups";
import type { OrderStatus } from "@/lib/types";

// 生產訂單清單：依交期分群，卡片只放「哪一張、做什麼、什麼時候要好」。
// 字級依老闆規則（師傅年紀大）：本文 ≥19px，訂單號碼 28px。

export const STATUS_BADGE: Partial<Record<OrderStatus, { label: string; className: string }>> = {
  production: { label: "製作中", className: "bg-[var(--accent-light)] text-[var(--accent-hover)]" },
  waiting: { label: "待出貨", className: "bg-[var(--warning-light)] text-[var(--warning)]" },
  completed: { label: "已完成", className: "bg-[var(--success-light)] text-[var(--success)]" },
};

const GROUP_STYLE: Record<
  ProductionGroupKey,
  { label: string; bar: string; text: string; count: string; cardBorder: string }
> = {
  overdue: {
    label: "逾期",
    bar: "bg-[var(--error)]",
    text: "text-[var(--error)]",
    count: "bg-[var(--error-light)] text-[var(--error)]",
    cardBorder: "border-l-[var(--error)]",
  },
  today: {
    label: "今天",
    bar: "bg-[var(--warning)]",
    text: "text-[var(--warning)]",
    count: "bg-[var(--warning-light)] text-[var(--warning)]",
    cardBorder: "border-l-[var(--warning)]",
  },
  week: {
    label: "本週（7 天內）",
    bar: "bg-[var(--accent)]",
    text: "text-[var(--accent)]",
    count: "bg-[var(--accent-light)] text-[var(--accent)]",
    cardBorder: "border-l-[var(--accent)]",
  },
  later: {
    label: "之後",
    bar: "bg-[var(--border-strong)]",
    text: "text-[var(--text-secondary)]",
    count: "bg-[var(--bg-subtle)] text-[var(--text-secondary)]",
    cardBorder: "border-l-transparent",
  },
  done: {
    label: "已完成（保留 7 天）",
    bar: "bg-[var(--border-strong)]",
    text: "text-[var(--text-secondary)]",
    count: "bg-[var(--bg-subtle)] text-[var(--text-secondary)]",
    cardBorder: "border-l-transparent",
  },
};

function OrderCard({
  order,
  group,
  today,
  onOpen,
}: {
  order: ProductionOrderView;
  group: ProductionGroupKey;
  today: string;
  onOpen: () => void;
}) {
  const badge = STATUS_BADGE[order.status];
  const style = GROUP_STYLE[group];
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex w-full items-start justify-between gap-3 rounded-[var(--radius-md)] border border-l-4 border-[var(--border)] ${style.cardBorder} bg-[var(--bg-elevated)] p-4 text-left shadow-sm active:bg-[var(--bg-hover)]`}
    >
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[28px] font-black leading-none tracking-wide tabular-nums text-[var(--text-primary)]">
          {order.orderNumber || order.orderId}
        </div>
        {order.itemCategory && (
          <div className="mt-1.5 text-[19px] font-medium leading-tight text-[var(--text-secondary)]">
            {order.itemCategory}
          </div>
        )}
        <div
          className={`mt-1.5 text-[19px] font-semibold ${
            group === "overdue" ? "font-bold text-[var(--error)]" : "text-[var(--text-primary)]"
          }`}
        >
          {group === "done"
            ? `完成 ${order.completedDate ? order.completedDate.slice(5, 10).replace("-", "/") : "—"}`
            : `交期 ${dueLabel(order, today)}`}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-3">
        {badge && (
          <span className={`rounded-full px-2.5 py-1 text-[15px] font-bold leading-tight ${badge.className}`}>
            {badge.label}
          </span>
        )}
        <ChevronRight className="h-6 w-6 text-[var(--text-secondary)]" aria-hidden />
      </div>
    </button>
  );
}

function GroupHeader({
  group,
  count,
  collapsible,
  open,
  onToggle,
}: {
  group: ProductionGroupKey;
  count: number;
  collapsible?: boolean;
  open?: boolean;
  onToggle?: () => void;
}) {
  const style = GROUP_STYLE[group];
  const content = (
    <>
      <span className={`h-5 w-1 shrink-0 rounded-sm ${style.bar}`} aria-hidden />
      <span className={`text-[17px] font-bold tracking-wider ${style.text}`}>{style.label}</span>
      <span className={`rounded-full px-2 py-0.5 text-[15px] font-bold ${style.count}`}>{count} 張</span>
      {collapsible && (
        <ChevronDown
          className={`ml-auto h-5 w-5 text-[var(--text-secondary)] transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      )}
    </>
  );
  if (!collapsible) return <h2 className="flex items-center gap-2 px-1 pb-2 pt-1">{content}</h2>;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="flex w-full items-center gap-2 px-1 pb-2 pt-1 text-left"
    >
      {content}
    </button>
  );
}

export function ProductionOrderList({
  orders,
  today,
  onOpen,
}: {
  orders: ProductionOrderView[];
  today: string;
  onOpen: (order: ProductionOrderView) => void;
}) {
  // 已完成預設收起：師傅打開清單要看的是還沒做的
  const [doneOpen, setDoneOpen] = useState(false);
  const groups = groupProductionOrders(orders, today);
  const hasActive = groups.some((g) => g.key !== "done");

  return (
    <div className="space-y-5">
      {!hasActive && <ProductionEmptyState />}
      {groups.map((g) => {
        const isDone = g.key === "done";
        const showCards = !isDone || doneOpen;
        return (
          <section key={g.key}>
            <GroupHeader
              group={g.key}
              count={g.orders.length}
              collapsible={isDone}
              open={doneOpen}
              onToggle={() => setDoneOpen((v) => !v)}
            />
            {showCards && (
              <div className="space-y-2.5">
                {g.orders.map((o) => (
                  <OrderCard key={o.orderId} order={o} group={g.key} today={today} onOpen={() => onOpen(o)} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

export function ProductionEmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 py-14 text-center">
      <Factory className="h-14 w-14 text-[var(--text-secondary)]" aria-hidden />
      <div className="text-[22px] font-bold text-[var(--text-primary)]">目前沒有待製作的訂單</div>
      <div className="text-[17px] text-[var(--text-secondary)]">有新的單會出現在這裡，可按右上角重新整理</div>
    </div>
  );
}

/** 載入中：3 張卡片骨架 */
export function ProductionListSkeleton() {
  return (
    <div className="space-y-2.5" aria-busy="true" aria-label="載入中">
      <div className="h-6 w-28 animate-pulse rounded bg-[var(--bg-hover)]" />
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="space-y-2.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] p-4"
        >
          <div className="h-7 w-32 animate-pulse rounded bg-[var(--bg-hover)]" />
          <div className="h-5 w-24 animate-pulse rounded bg-[var(--bg-hover)]" />
          <div className="h-5 w-40 animate-pulse rounded bg-[var(--bg-hover)]" />
        </div>
      ))}
    </div>
  );
}
