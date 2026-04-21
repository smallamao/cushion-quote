"use client";

import { Loader2, Plus, Trash2 } from "lucide-react";
import { useMemo, useState, useEffect } from "react";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SCHEDULE_PRESETS,
  buildSchedulesFromPreset,
  isoDateNow,
} from "@/lib/ar-utils";
import type { QuoteVersionRecord } from "@/lib/types";

interface ScheduleDraft {
  label: string;
  ratio: number;
  amount: number;
  dueDate: string;
}

interface CreateARDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  version: QuoteVersionRecord | null;
  onCreate: (payload: {
    versionId: string;
    schedules: ScheduleDraft[];
    notes: string;
  }) => Promise<void>;
}

export function CreateARDialog({
  open,
  onOpenChange,
  version,
  onCreate,
}: CreateARDialogProps) {
  const [presetKey, setPresetKey] = useState("3-stage");
  const [schedules, setSchedules] = useState<ScheduleDraft[]>([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const totalAmount = version?.totalAmount ?? 0;

  // Reset schedules on open or preset change
  useEffect(() => {
    if (!open || !version) return;
    setError("");
    setNotes("");
    setPresetKey("3-stage");
    setSchedules(buildSchedulesFromPreset("3-stage", totalAmount, isoDateNow()));
  }, [open, version, totalAmount]);

  function changePreset(key: string) {
    setPresetKey(key);
    if (key === "custom") {
      if (schedules.length === 0) {
        setSchedules([
          { label: "全額", ratio: 100, amount: totalAmount, dueDate: isoDateNow() },
        ]);
      }
      return;
    }
    setSchedules(buildSchedulesFromPreset(key, totalAmount, isoDateNow()));
  }

  function updateSchedule(index: number, patch: Partial<ScheduleDraft>) {
    setSchedules((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    );
    setPresetKey("custom");
  }

  function addSchedule() {
    setSchedules((prev) => [
      ...prev,
      { label: `第 ${prev.length + 1} 期`, ratio: 0, amount: 0, dueDate: isoDateNow() },
    ]);
    setPresetKey("custom");
  }

  function removeSchedule(index: number) {
    if (schedules.length <= 1) return;
    setSchedules((prev) => prev.filter((_, i) => i !== index));
    setPresetKey("custom");
  }

  const totals = useMemo(() => {
    const sumAmount = schedules.reduce((sum, s) => sum + (s.amount || 0), 0);
    const sumRatio = schedules.reduce((sum, s) => sum + (s.ratio || 0), 0);
    return { sumAmount, sumRatio };
  }, [schedules]);

  const amountMatches = Math.abs(totals.sumAmount - totalAmount) < 1;

  async function handleSubmit() {
    if (!version) return;
    setError("");

    if (schedules.length === 0) {
      setError("至少需要一期");
      return;
    }
    for (const s of schedules) {
      if (!s.label.trim()) {
        setError("每期都要有標籤");
        return;
      }
      if (!s.dueDate) {
        setError("每期都要設定預定收款日");
        return;
      }
      if (s.amount <= 0) {
        setError("每期金額必須 > 0");
        return;
      }
    }
    if (!amountMatches) {
      setError(`分期金額加總 (${totals.sumAmount}) 與報價總額 (${totalAmount}) 不符`);
      return;
    }

    setSaving(true);
    try {
      await onCreate({
        versionId: version.versionId,
        schedules,
        notes,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "建立失敗");
    } finally {
      setSaving(false);
    }
  }

  if (!version) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            建立應收帳款 — {version.quoteId} V{version.versionNo}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded border border-[var(--border)] bg-[var(--bg-subtle)] p-3 text-xs">
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">客戶</span>
              <span className="font-medium">
                {version.clientNameSnapshot || "—"}
                {version.contactNameSnapshot && ` / ${version.contactNameSnapshot}`}
              </span>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-[var(--text-secondary)]">專案</span>
              <span className="font-medium">{version.projectNameSnapshot || "—"}</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-[var(--text-secondary)]">報價總額</span>
              <span className="font-semibold text-[var(--accent)]">
                NT$ {totalAmount.toLocaleString()}
              </span>
            </div>
          </div>

          <div>
            <Label className="mb-1 block text-xs">分期模板</Label>
            <Select value={presetKey} onValueChange={changePreset}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCHEDULE_PRESETS.map((preset) => (
                  <SelectItem key={preset.key} value={preset.key}>
                    {preset.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label className="text-xs">分期明細</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={addSchedule}
                disabled={saving}
              >
                <Plus className="h-3.5 w-3.5" />
                新增一期
              </Button>
            </div>
            <div className="overflow-hidden rounded border border-[var(--border)]">
              <table className="w-full text-sm">
                <thead className="bg-[var(--bg-subtle)] text-xs text-[var(--text-secondary)]">
                  <tr>
                    <th className="w-10 px-2 py-2 text-left">#</th>
                    <th className="px-2 py-2 text-left">標籤</th>
                    <th className="w-24 px-2 py-2 text-right">比例%</th>
                    <th className="w-32 px-2 py-2 text-right">金額</th>
                    <th className="w-36 px-2 py-2 text-left">預定收款日</th>
                    <th className="w-10 px-2 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {schedules.map((s, idx) => (
                    <tr key={idx}>
                      <td className="px-2 py-1.5 text-xs">{idx + 1}</td>
                      <td className="px-2 py-1.5">
                        <Input
                          value={s.label}
                          onChange={(e) => updateSchedule(idx, { label: e.target.value })}
                          className="h-8"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          type="number"
                          value={s.ratio}
                          onChange={(e) =>
                            updateSchedule(idx, { ratio: Number(e.target.value) })
                          }
                          className="h-8 text-right"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          type="number"
                          value={s.amount}
                          onChange={(e) =>
                            updateSchedule(idx, { amount: Number(e.target.value) })
                          }
                          className="h-8 text-right"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          type="date"
                          value={s.dueDate}
                          onChange={(e) => updateSchedule(idx, { dueDate: e.target.value })}
                          className="h-8"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <button
                          type="button"
                          onClick={() => removeSchedule(idx)}
                          disabled={schedules.length <= 1}
                          className="text-[var(--text-tertiary)] hover:text-red-500 disabled:opacity-30"
                          title="移除"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-[var(--bg-subtle)] text-xs">
                  <tr>
                    <td colSpan={2} className="px-2 py-2 text-right text-[var(--text-secondary)]">
                      加總
                    </td>
                    <td className="px-2 py-2 text-right font-medium">{totals.sumRatio}%</td>
                    <td
                      className={[
                        "px-2 py-2 text-right font-medium",
                        amountMatches ? "" : "text-red-600",
                      ].join(" ")}
                    >
                      NT$ {totals.sumAmount.toLocaleString()}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
            {!amountMatches && (
              <p className="mt-1 text-xs text-red-600">
                ⚠ 分期金額加總必須等於報價總額 NT$ {totalAmount.toLocaleString()}
              </p>
            )}
          </div>

          <div>
            <Label className="mb-1 block text-xs">備註（選填）</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="例：客戶要求延後 3 天付款"
            />
          </div>

          {error && (
            <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={saving || !amountMatches}>
            {saving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                建立中…
              </>
            ) : (
              "建立應收"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
