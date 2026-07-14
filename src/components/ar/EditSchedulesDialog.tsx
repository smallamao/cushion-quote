"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";

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
import {
  SCHEDULE_PRESETS,
  buildSchedulesFromPreset,
  isoDateNow,
} from "@/lib/ar-utils";
import type { ARRecord, ARScheduleRecord } from "@/lib/types";

interface ScheduleDraft {
  label: string;
  ratio: number;
  amount: number;
  dueDate: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ar: ARRecord;
  schedules: ARScheduleRecord[];
  onSaved: () => void;
}

function fmt(n: number): string {
  return n.toLocaleString("zh-TW", { maximumFractionDigits: 0 });
}

export function EditSchedulesDialog({ open, onOpenChange, ar, schedules, onSaved }: Props) {
  const [drafts, setDrafts] = useState<ScheduleDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const totalAmount = Math.round(ar.totalAmount);
  const received = Math.round(ar.receivedAmount);

  // 開啟時載入目前分期
  useEffect(() => {
    if (!open) return;
    setError("");
    setDrafts(
      schedules.map((s) => ({
        label: s.label,
        ratio: s.ratio,
        amount: s.amount,
        dueDate: s.dueDate || isoDateNow(),
      })),
    );
  }, [open, schedules]);

  function applyPreset(key: string) {
    const built = buildSchedulesFromPreset(key, totalAmount, isoDateNow());
    if (built.length > 0) setDrafts(built);
  }

  function updateDraft(i: number, patch: Partial<ScheduleDraft>) {
    setDrafts((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }

  const sum = useMemo(
    () => drafts.reduce((s, d) => s + (Math.round(d.amount) || 0), 0),
    [drafts],
  );
  const matches = Math.abs(sum - totalAmount) < 1;

  // 預覽：已收金額會依序填入各期（與後端瀑布式分配一致）
  const preview = useMemo(() => {
    let remain = received;
    return drafts.map((d) => {
      const applied = Math.min(remain, Math.round(d.amount) || 0);
      remain -= applied;
      return applied;
    });
  }, [drafts, received]);

  async function handleSave() {
    if (!matches) {
      setError(`各期金額合計 NT$ ${fmt(sum)} 必須等於應收總額 NT$ ${fmt(totalAmount)}`);
      return;
    }
    if (drafts.some((d) => !d.dueDate)) {
      setError("每期都需要預定收款日");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/sheets/ar/${encodeURIComponent(ar.arId)}/schedules`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schedules: drafts.map((d) => ({
            label: d.label,
            ratio: totalAmount > 0 ? Math.round((d.amount / totalAmount) * 100) : 0,
            amount: Math.round(d.amount),
            dueDate: d.dueDate,
          })),
        }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) throw new Error(json.error ?? "儲存失敗");
      onOpenChange(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!saving) onOpenChange(o); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>編輯收款分期</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-xs text-[var(--text-secondary)]">
            重新分配這張應收帳款的分期（單號不變、不必刪除重建）。
            {received > 0 && (
              <>
                {" "}已收 <span className="font-semibold text-green-700">NT$ {fmt(received)}</span>{" "}
                會由前面的期別依序收滿（總已收金額不變）。
              </>
            )}
          </p>

          {/* 快速套用 */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-[var(--text-tertiary)]">快速套用：</span>
            {SCHEDULE_PRESETS.filter((p) => p.key !== "custom").map((p) => (
              <Button
                key={p.key}
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => applyPreset(p.key)}
                disabled={saving}
              >
                {p.label}
              </Button>
            ))}
          </div>

          {/* 分期表 */}
          <div className="overflow-x-auto rounded border border-[var(--border)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--surface-2)] text-xs text-[var(--text-secondary)]">
                <tr>
                  <th className="px-2 py-2 text-left">標籤</th>
                  <th className="px-2 py-2 text-right">應收金額</th>
                  <th className="px-2 py-2 text-left">預定收款日</th>
                  <th className="px-2 py-2 text-right">已收（自動）</th>
                  <th className="w-8 px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {drafts.map((d, i) => (
                  <tr key={i} className="border-t border-[var(--border)]">
                    <td className="px-2 py-1.5">
                      <Input
                        className="h-8 text-xs"
                        value={d.label}
                        onChange={(e) => updateDraft(i, { label: e.target.value })}
                        placeholder={`第 ${i + 1} 期`}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        type="number"
                        className="h-8 text-right text-xs"
                        value={d.amount}
                        min={0}
                        onChange={(e) => updateDraft(i, { amount: Number(e.target.value) || 0 })}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        type="date"
                        className="h-8 text-xs"
                        value={d.dueDate}
                        onChange={(e) => updateDraft(i, { dueDate: e.target.value })}
                      />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {preview[i] > 0 ? (
                        <span className="font-mono text-xs text-green-700">
                          {fmt(preview[i])}
                          {preview[i] >= Math.round(d.amount) && " ✓"}
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--text-tertiary)]">—</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      {drafts.length > 1 && (
                        <button
                          type="button"
                          className="text-[var(--text-tertiary)] hover:text-red-500"
                          onClick={() => setDrafts((prev) => prev.filter((_, idx) => idx !== i))}
                          disabled={saving}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() =>
                setDrafts((prev) => [
                  ...prev,
                  { label: `第 ${prev.length + 1} 期`, ratio: 0, amount: 0, dueDate: isoDateNow() },
                ])
              }
              disabled={saving}
            >
              <Plus className="mr-1 h-3 w-3" />
              新增一期
            </Button>
            <span className={`text-sm ${matches ? "text-[var(--text-secondary)]" : "font-semibold text-red-600"}`}>
              合計 NT$ {fmt(sum)} / 應收總額 NT$ {fmt(totalAmount)}
              {!matches && "（不符）"}
            </span>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <DialogFooter>
          <Label className="mr-auto text-xs text-[var(--text-tertiary)]">
            總金額不可更動（來自報價）；只重新分配各期
          </Label>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving || !matches}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            儲存分期
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
