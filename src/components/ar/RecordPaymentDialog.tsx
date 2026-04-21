"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

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
  AR_PAYMENT_METHOD_LABEL,
  DEFAULT_CARD_FEE_RATE,
  grossFromNet,
  isoDateNow,
} from "@/lib/ar-utils";
import type {
  ARPaymentMethod,
  ARScheduleRecord,
  RecordARPaymentPayload,
} from "@/lib/types";

interface RecordPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schedule: ARScheduleRecord | null;
  onSubmit: (payload: RecordARPaymentPayload) => Promise<void>;
}

function fmt(n: number): string {
  return n.toLocaleString("zh-TW", { maximumFractionDigits: 0 });
}

export function RecordPaymentDialog({
  open,
  onOpenChange,
  schedule,
  onSubmit,
}: RecordPaymentDialogProps) {
  const [paymentMethod, setPaymentMethod] = useState<Exclude<ARPaymentMethod, "">>("transfer");
  const [receivedAmount, setReceivedAmount] = useState(0);
  const [receivedDate, setReceivedDate] = useState(isoDateNow());
  const [notes, setNotes] = useState("");

  // Credit card specific state
  const [cardGrossAmount, setCardGrossAmount] = useState(0);
  const [cardFeeRate, setCardFeeRate] = useState(DEFAULT_CARD_FEE_RATE);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const outstandingThisSchedule = schedule
    ? Math.max(
        0,
        schedule.amount + schedule.adjustmentAmount - schedule.receivedAmount,
      )
    : 0;

  useEffect(() => {
    if (!open || !schedule) return;
    setError("");
    setPaymentMethod("transfer");
    setReceivedAmount(outstandingThisSchedule);
    setReceivedDate(isoDateNow());
    setNotes("");
    setCardGrossAmount(grossFromNet(outstandingThisSchedule, DEFAULT_CARD_FEE_RATE));
    setCardFeeRate(DEFAULT_CARD_FEE_RATE);
  }, [open, schedule, outstandingThisSchedule]);

  const isCard = paymentMethod === "credit_card";

  // When using card: derive fee and net from gross + rate
  const cardDerived = useMemo(() => {
    const fee = Math.round((cardGrossAmount * cardFeeRate) / 100);
    const net = cardGrossAmount - fee;
    return { fee, net };
  }, [cardGrossAmount, cardFeeRate]);

  // When switching to card mode, reset card gross to target outstanding
  function changePaymentMethod(method: Exclude<ARPaymentMethod, "">) {
    setPaymentMethod(method);
    if (method === "credit_card") {
      setCardGrossAmount(grossFromNet(outstandingThisSchedule, cardFeeRate));
    } else {
      setReceivedAmount(outstandingThisSchedule);
    }
  }

  // When card inputs change, update received amount to the net
  useEffect(() => {
    if (isCard) {
      setReceivedAmount(cardDerived.net);
    }
  }, [isCard, cardDerived.net]);

  async function handleSubmit() {
    if (!schedule) return;
    setError("");
    if (receivedAmount <= 0) {
      setError("收款金額必須 > 0");
      return;
    }
    if (!receivedDate) {
      setError("請選擇實收日期");
      return;
    }
    if (isCard && cardGrossAmount <= 0) {
      setError("客戶刷卡金額必須 > 0");
      return;
    }

    const finalNotes = isCard
      ? [
          `刷卡：客戶付 $${fmt(cardGrossAmount)}`,
          `手續費 ${cardFeeRate}% = $${fmt(cardDerived.fee)}`,
          `實收 $${fmt(cardDerived.net)}`,
          notes ? ` / ${notes}` : "",
        ].join(" / ").replace(/ \/ $/, "")
      : notes;

    setSaving(true);
    try {
      await onSubmit({
        scheduleId: schedule.scheduleId,
        receivedAmount,
        receivedDate,
        paymentMethod,
        notes: finalNotes,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "記錄失敗");
    } finally {
      setSaving(false);
    }
  }

  if (!schedule) return null;

  const shortfall = outstandingThisSchedule - receivedAmount;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            記錄收款 — 第 {schedule.seq} 期 {schedule.label}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded border border-[var(--border)] bg-[var(--bg-subtle)] p-3 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">應收金額</span>
              <span className="font-medium">
                NT$ {fmt(schedule.amount + schedule.adjustmentAmount)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">已收金額</span>
              <span className="font-medium">
                NT$ {fmt(schedule.receivedAmount)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">尚未收</span>
              <span className="font-semibold text-[var(--accent)]">
                NT$ {fmt(outstandingThisSchedule)}
              </span>
            </div>
          </div>

          <div>
            <Label className="mb-1 block text-xs">收款方式</Label>
            <Select
              value={paymentMethod}
              onValueChange={(v) =>
                changePaymentMethod(v as Exclude<ARPaymentMethod, "">)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(AR_PAYMENT_METHOD_LABEL).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isCard ? (
            <div className="space-y-3 rounded border border-amber-200 bg-amber-50/60 p-3">
              <div className="text-xs font-medium text-amber-800">
                刷卡計算（手續費由銀行從客戶刷卡金額扣除）
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-1 block text-xs">客戶刷卡金額</Label>
                  <Input
                    type="number"
                    value={cardGrossAmount}
                    onChange={(e) => setCardGrossAmount(Number(e.target.value))}
                  />
                  <p className="mt-0.5 text-[11px] text-[var(--text-tertiary)]">
                    要實收 NT$ {fmt(outstandingThisSchedule)} 建議刷 NT${" "}
                    {fmt(grossFromNet(outstandingThisSchedule, cardFeeRate))}
                  </p>
                </div>
                <div>
                  <Label className="mb-1 block text-xs">手續費率 %</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={cardFeeRate}
                    onChange={(e) => setCardFeeRate(Number(e.target.value))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 border-t border-amber-200 pt-3 text-sm">
                <div>
                  <div className="text-[11px] text-[var(--text-secondary)]">
                    手續費
                  </div>
                  <div className="font-semibold text-red-600">
                    −NT$ {fmt(cardDerived.fee)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-[var(--text-secondary)]">
                    銀行撥入（實收）
                  </div>
                  <div className="font-semibold text-green-700">
                    NT$ {fmt(cardDerived.net)}
                  </div>
                </div>
              </div>
              {shortfall !== 0 && (
                <div
                  className={[
                    "rounded px-2 py-1.5 text-xs",
                    shortfall > 0
                      ? "bg-amber-100 text-amber-800"
                      : "bg-green-100 text-green-800",
                  ].join(" ")}
                >
                  {shortfall > 0
                    ? `⚠ 實收比應收少 NT$ ${fmt(shortfall)}（分期尚有未收金額）`
                    : `✓ 實收 > 應收 NT$ ${fmt(-shortfall)}（可能是補收先前差額）`}
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1 block text-xs">本次收款金額</Label>
                <Input
                  type="number"
                  value={receivedAmount}
                  onChange={(e) => setReceivedAmount(Number(e.target.value))}
                />
              </div>
              <div>
                <Label className="mb-1 block text-xs">實收日期</Label>
                <Input
                  type="date"
                  value={receivedDate}
                  onChange={(e) => setReceivedDate(e.target.value)}
                />
              </div>
            </div>
          )}

          {isCard && (
            <div>
              <Label className="mb-1 block text-xs">實收日期</Label>
              <Input
                type="date"
                value={receivedDate}
                onChange={(e) => setReceivedDate(e.target.value)}
              />
            </div>
          )}

          <div>
            <Label className="mb-1 block text-xs">備註（選填）</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                isCard
                  ? "例：卡號末四碼 1234 / 銀行：玉山"
                  : "例：支票號 CH1234 / 匯款末四碼 5678"
              }
            />
            {isCard && (
              <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">
                系統會自動在備註前加上「刷卡：客戶付 / 手續費 / 實收」。
              </p>
            )}
          </div>

          {error && (
            <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                儲存中…
              </>
            ) : (
              "確認收款"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
