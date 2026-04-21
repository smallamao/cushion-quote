"use client";

import { ArrowLeft, Loader2, Wallet } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { RecordPaymentDialog } from "@/components/ar/RecordPaymentDialog";
import {
  AR_SCHEDULE_STATUS_COLOR,
  AR_SCHEDULE_STATUS_LABEL,
  AR_STATUS_COLOR,
  AR_STATUS_LABEL,
  calcScheduleDerivedStatus,
  isoDateNow,
} from "@/lib/ar-utils";
import { useReceivableDetail } from "@/hooks/useReceivables";
import type { ARScheduleRecord } from "@/lib/types";

interface Props {
  arId: string;
}

function fmt(n: number): string {
  return n.toLocaleString("zh-TW", { maximumFractionDigits: 0 });
}

export function ReceivableDetailClient({ arId }: Props) {
  const { ar, schedules, loading, error, recordPayment } =
    useReceivableDetail(arId);
  const [paymentTarget, setPaymentTarget] = useState<ARScheduleRecord | null>(null);

  const today = isoDateNow();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-sm text-[var(--text-secondary)]">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        載入中…
      </div>
    );
  }

  if (error || !ar) {
    return (
      <div className="py-24 text-center text-sm text-red-600">
        {error || "找不到此應收帳款"}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/receivables"
            className="flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--accent)]"
          >
            <ArrowLeft className="h-4 w-4" />
            返回列表
          </Link>
          <div>
            <h1 className="font-mono text-lg font-semibold text-[var(--accent)]">{ar.arId}</h1>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-[var(--text-secondary)]">
              建立於 {ar.issueDate}
              <span
                className={`inline-block rounded-full px-2 py-0.5 ${AR_STATUS_COLOR[ar.arStatus]}`}
              >
                {AR_STATUS_LABEL[ar.arStatus]}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
          <div className="text-xs text-[var(--text-secondary)]">總金額</div>
          <div className="mt-1 text-lg font-semibold">NT$ {fmt(ar.totalAmount)}</div>
        </div>
        <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
          <div className="text-xs text-[var(--text-secondary)]">已收金額</div>
          <div className="mt-1 text-lg font-semibold text-green-600">
            NT$ {fmt(ar.receivedAmount)}
          </div>
        </div>
        <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
          <div className="text-xs text-[var(--text-secondary)]">未收</div>
          <div className="mt-1 text-lg font-semibold text-amber-600">
            NT$ {fmt(ar.outstandingAmount)}
          </div>
        </div>
        <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
          <div className="text-xs text-[var(--text-secondary)]">分期數</div>
          <div className="mt-1 text-lg font-semibold">{ar.scheduleCount}</div>
        </div>
      </div>

      {/* Client info */}
      <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
        <h3 className="mb-3 text-sm font-semibold">客戶資訊</h3>
        <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
          <div>
            <div className="text-xs text-[var(--text-secondary)]">客戶名稱</div>
            <div className="mt-0.5 font-medium">{ar.clientNameSnapshot || "—"}</div>
          </div>
          <div>
            <div className="text-xs text-[var(--text-secondary)]">聯絡人</div>
            <div className="mt-0.5 font-medium">{ar.contactNameSnapshot || "—"}</div>
          </div>
          <div>
            <div className="text-xs text-[var(--text-secondary)]">電話</div>
            <div className="mt-0.5 font-medium">{ar.clientPhoneSnapshot || "—"}</div>
          </div>
          <div>
            <div className="text-xs text-[var(--text-secondary)]">專案</div>
            <div className="mt-0.5 font-medium">{ar.projectNameSnapshot || "—"}</div>
          </div>
          <div>
            <div className="text-xs text-[var(--text-secondary)]">關聯版本</div>
            <div className="mt-0.5 font-mono text-xs">{ar.versionId || "—"}</div>
          </div>
          <div>
            <div className="text-xs text-[var(--text-secondary)]">關聯案件</div>
            <div className="mt-0.5 font-mono text-xs">{ar.caseId || "—"}</div>
          </div>
        </div>
        {ar.notes && (
          <div className="mt-3 border-t border-[var(--border)] pt-3 text-xs">
            <span className="text-[var(--text-secondary)]">備註：</span>
            {ar.notes}
          </div>
        )}
      </div>

      {/* Schedules */}
      <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)]">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <h3 className="text-sm font-semibold">收款分期</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[var(--bg-subtle)] text-xs text-[var(--text-secondary)]">
              <tr>
                <th className="w-12 px-3 py-2 text-left font-medium">#</th>
                <th className="px-3 py-2 text-left font-medium">標籤</th>
                <th className="px-3 py-2 text-right font-medium">應收</th>
                <th className="px-3 py-2 text-left font-medium">預定收款日</th>
                <th className="px-3 py-2 text-right font-medium">已收</th>
                <th className="px-3 py-2 text-left font-medium">實收日</th>
                <th className="px-3 py-2 text-left font-medium">狀態</th>
                <th className="px-3 py-2 text-center font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {schedules.map((s) => {
                const derivedStatus = calcScheduleDerivedStatus(s, today);
                const canReceive = derivedStatus !== "paid" && derivedStatus !== "waived";
                return (
                  <tr
                    key={s.scheduleId}
                    className={derivedStatus === "overdue" ? "bg-red-50/50" : ""}
                  >
                    <td className="px-3 py-2 text-xs">{s.seq}</td>
                    <td className="px-3 py-2 text-sm font-medium">{s.label}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      NT$ {fmt(s.amount)}
                    </td>
                    <td className="px-3 py-2 text-xs">{s.dueDate || "—"}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-green-700">
                      {s.receivedAmount > 0 ? fmt(s.receivedAmount) : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs">{s.receivedDate || "—"}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[11px] ${AR_SCHEDULE_STATUS_COLOR[derivedStatus]}`}
                      >
                        {AR_SCHEDULE_STATUS_LABEL[derivedStatus]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      {canReceive && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setPaymentTarget(s)}
                          className="h-7 gap-1 text-xs"
                        >
                          <Wallet className="h-3 w-3" />
                          記錄收款
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <RecordPaymentDialog
        open={paymentTarget !== null}
        onOpenChange={(open) => {
          if (!open) setPaymentTarget(null);
        }}
        schedule={paymentTarget}
        onSubmit={async (payload) => {
          await recordPayment(payload);
        }}
      />
    </div>
  );
}
