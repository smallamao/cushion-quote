"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

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
import type { ARScheduleRecord } from "@/lib/types";

const REASON_PRESETS = ["匯費／手續費", "折讓", "尾數調整", "呆帳"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  arId: string;
  schedule: ARScheduleRecord | null;
  onSaved: () => void;
}

function fmt(n: number): string {
  return n.toLocaleString("zh-TW", { maximumFractionDigits: 0 });
}

export function WriteOffDialog({ open, onOpenChange, arId, schedule, onSaved }: Props) {
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState(REASON_PRESETS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const outstanding = schedule
    ? Math.max(0, schedule.amount + schedule.adjustmentAmount - schedule.receivedAmount)
    : 0;

  useEffect(() => {
    if (!open || !schedule) return;
    setError("");
    setAmount(outstanding);
    setReason(REASON_PRESETS[0]);
  }, [open, schedule, outstanding]);

  async function handleSave() {
    if (!schedule) return;
    if (amount <= 0) {
      setError("沖銷金額必須大於 0");
      return;
    }
    if (amount > outstanding) {
      setError(`沖銷金額不可超過此期未收 NT$ ${fmt(outstanding)}`);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(
        `/api/sheets/ar/${encodeURIComponent(arId)}/schedules/${encodeURIComponent(schedule.scheduleId)}/write-off`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount, reason }),
        },
      );
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) throw new Error(json.error ?? "沖銷失敗");
      onOpenChange(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "沖銷失敗");
    } finally {
      setSaving(false);
    }
  }

  if (!schedule) return null;

  const remainingAfter = outstanding - amount;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!saving) onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            沖銷差額 — 第 {schedule.seq} 期 {schedule.label}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-xs text-[var(--text-secondary)]">
            把收不到的差額從應收中扣除（例：客戶匯款時自行扣掉匯費）。
            <span className="font-medium text-[var(--text-primary)]">
              {" "}已收現金金額不會變動
            </span>
            —— 帳面現金仍與銀行一致，只是這期的應收下修後結清。
          </p>

          <div className="space-y-1 rounded border border-[var(--border)] bg-[var(--bg-subtle)] p-3 text-xs">
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">應收</span>
              <span className="font-medium">
                NT$ {fmt(schedule.amount + schedule.adjustmentAmount)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">已收</span>
              <span className="font-medium text-green-700">
                NT$ {fmt(schedule.receivedAmount)}
              </span>
            </div>
            <div className="flex justify-between border-t border-[var(--border)] pt-1">
              <span className="text-[var(--text-secondary)]">未收（可沖銷上限）</span>
              <span className="font-semibold text-[var(--accent)]">NT$ {fmt(outstanding)}</span>
            </div>
          </div>

          <div>
            <Label className="mb-1 block text-xs">沖銷金額</Label>
            <Input
              type="number"
              value={amount}
              min={0}
              max={outstanding}
              onChange={(e) => setAmount(Number(e.target.value) || 0)}
            />
          </div>

          <div>
            <Label className="mb-1 block text-xs">原因</Label>
            <div className="mb-1.5 flex flex-wrap gap-1.5">
              {REASON_PRESETS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                    reason === r
                      ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                      : "border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="沖銷原因（會寫入備註）"
            />
          </div>

          <div className="rounded bg-blue-50 px-3 py-2 text-xs text-blue-800">
            沖銷後這期未收將變成{" "}
            <span className="font-semibold">NT$ {fmt(Math.max(0, remainingAfter))}</span>
            {remainingAfter <= 0 && " → 此期結清 ✓"}
          </div>

          {error && (
            <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving || amount <= 0}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            確認沖銷
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
