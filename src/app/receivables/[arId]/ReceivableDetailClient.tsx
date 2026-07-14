"use client";

import { ArrowLeft, Loader2, Scissors, SplitSquareHorizontal, Trash2, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { EditSchedulesDialog } from "@/components/ar/EditSchedulesDialog";
import { WriteOffDialog } from "@/components/ar/WriteOffDialog";
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
  const { ar, schedules, loading, error, recordPayment, deleteAR, reload } =
    useReceivableDetail(arId);
  const [paymentTarget, setPaymentTarget] = useState<ARScheduleRecord | null>(null);
  const [editSchedulesOpen, setEditSchedulesOpen] = useState(false);
  const [writeOffTarget, setWriteOffTarget] = useState<ARScheduleRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  const today = isoDateNow();
  // 沖銷總額（負的 adjustmentAmount 取正值顯示）
  const totalWrittenOff = schedules.reduce(
    (sum, s) => sum + Math.max(0, -s.adjustmentAmount),
    0,
  );

  async function handleDelete() {
    if (!ar) return;
    const warn =
      ar.receivedAmount > 0
        ? `此應收帳款已收 NT$ ${fmt(ar.receivedAmount)}，刪除後收款記錄一併移除且無法復原。\n\n確定要刪除 ${ar.arId}？`
        : `確定要刪除應收帳款 ${ar.arId}？\n\n將一併移除所有收款分期，且無法復原。若金額有異動，刪除後可從報價紀錄重新「建立應收帳款」。`;
    if (!confirm(warn)) return;
    setDeleting(true);
    try {
      await deleteAR();
      router.push("/receivables");
    } catch (err) {
      alert(err instanceof Error ? err.message : "刪除失敗");
      setDeleting(false);
    }
  }

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
        <Button
          variant="outline"
          size="sm"
          onClick={handleDelete}
          disabled={deleting}
          className="gap-1 text-red-600 hover:bg-red-50 hover:text-red-700"
        >
          {deleting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
          刪除
        </Button>
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
          {/* 沖銷金額（匯費／折讓）— 解釋總額與已收之間的差 */}
          {totalWrittenOff > 0 && (
            <div className="mt-0.5 text-[11px] text-red-600">
              已沖銷 NT$ {fmt(totalWrittenOff)}
            </div>
          )}
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
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <h3 className="text-sm font-semibold">收款分期</h3>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => setEditSchedulesOpen(true)}
            title="重新分配分期（例如把「全額」拆成訂金＋尾款），單號不變"
          >
            <SplitSquareHorizontal className="h-3.5 w-3.5" />
            編輯分期
          </Button>
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
                    {/* 有沖銷時顯示「實際應收」並標出被沖掉的金額，避免帳面看起來兜不攏 */}
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      NT$ {fmt(s.amount + s.adjustmentAmount)}
                      {s.adjustmentAmount !== 0 && (
                        <div
                          className="mt-0.5 text-[11px] text-red-600"
                          title={s.notes || undefined}
                        >
                          <span className="text-[var(--text-tertiary)] line-through">
                            {fmt(s.amount)}
                          </span>{" "}
                          沖銷 {fmt(s.adjustmentAmount)}
                        </div>
                      )}
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
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-center gap-1">
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
                        {/* 未收剩零頭（客戶扣匯費等）→ 沖銷結清，不虛增現金 */}
                        {canReceive &&
                          s.amount + s.adjustmentAmount - s.receivedAmount > 0 && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setWriteOffTarget(s)}
                              className="h-7 gap-1 text-xs text-[var(--text-secondary)]"
                              title="把收不到的差額（匯費／折讓）從應收沖銷，使此期結清"
                            >
                              <Scissors className="h-3 w-3" />
                              沖銷差額
                            </Button>
                          )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <WriteOffDialog
        open={writeOffTarget !== null}
        onOpenChange={(o) => { if (!o) setWriteOffTarget(null); }}
        arId={ar.arId}
        schedule={writeOffTarget}
        onSaved={() => void reload()}
      />

      <EditSchedulesDialog
        open={editSchedulesOpen}
        onOpenChange={setEditSchedulesOpen}
        ar={ar}
        schedules={schedules}
        onSaved={() => void reload()}
      />

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
