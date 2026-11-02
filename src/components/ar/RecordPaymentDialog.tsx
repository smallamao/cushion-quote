"use client";

import { Check, Copy, Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

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
import {
  DEFAULT_RECEIVING_ACCOUNT_ID,
  PAYMENT_REF_PLACEHOLDER,
  buildClientReply,
  isoDateToLocalDate,
  receiptPayLabelForSchedule,
  receivingAccountOptions,
  type PaymentType,
} from "@/lib/remittance";
import type {
  ARPaymentMethod,
  ARScheduleRecord,
  RecordARPaymentPayload,
} from "@/lib/types";

interface RecordPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schedule: ARScheduleRecord | null;
  /** 此應收共幾期；用來判斷客戶回覆聯寫「訂金」「餘額」或「款項」 */
  scheduleCount: number;
  onSubmit: (payload: RecordARPaymentPayload) => Promise<void>;
}

function fmt(n: number): string {
  return n.toLocaleString("zh-TW", { maximumFractionDigits: 0 });
}

/** 有末五碼欄位的收款方式 → 對應匯款資訊頁的付款類型（訊息格式共用） */
const REF_PAYMENT_TYPE: Partial<Record<ARPaymentMethod, PaymentType>> = {
  transfer: "匯款",
  credit_card: "刷卡",
  line_pay: "LINE PAY",
};

const RECEIVING_ACCOUNT_OPTIONS = receivingAccountOptions();
const LAST_ACCOUNT_KEY = "ar_last_receiving_account_id";

function loadLastAccountId(): string {
  try {
    const saved = localStorage.getItem(LAST_ACCOUNT_KEY) ?? "";
    if (RECEIVING_ACCOUNT_OPTIONS.some((o) => o.id === saved)) return saved;
  } catch {
    /* 私密瀏覽等情況讀不到 localStorage，用預設 */
  }
  return DEFAULT_RECEIVING_ACCOUNT_ID;
}

function saveLastAccountId(id: string): void {
  try {
    localStorage.setItem(LAST_ACCOUNT_KEY, id);
  } catch {
    /* 存不了就算了，下次用預設 */
  }
}

/**
 * 複製文字：優先 navigator.clipboard；失敗（舊版 iOS、非 https）退回 textarea + execCommand。
 * textarea 放在對話框內，避免被 Dialog 的 focus trap 擋住選取。
 */
async function copyText(text: string, container: HTMLElement | null): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.readOnly = true;
    // 16px 以上避免 iOS 聚焦時自動放大畫面
    ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;font-size:16px;";
    const host = container ?? document.body;
    host.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    host.removeChild(ta);
    return ok;
  }
}

export function RecordPaymentDialog({
  open,
  onOpenChange,
  schedule,
  scheduleCount,
  onSubmit,
}: RecordPaymentDialogProps) {
  const [paymentMethod, setPaymentMethod] = useState<Exclude<ARPaymentMethod, "">>("transfer");
  const [receivedAmount, setReceivedAmount] = useState(0);
  const [receivedDate, setReceivedDate] = useState(isoDateNow());
  const [notes, setNotes] = useState("");

  // Credit card specific state
  const [cardGrossAmount, setCardGrossAmount] = useState(0);
  const [cardFeeRate, setCardFeeRate] = useState(DEFAULT_CARD_FEE_RATE);

  // 實收比應收少時，可把差額直接沖銷（客戶自扣匯費等），避免留下幽靈尾款
  const [writeOffShortfall, setWriteOffShortfall] = useState(false);
  const [writeOffReason, setWriteOffReason] = useState("匯費／手續費");

  // 帳號末五碼／卡號末五碼／LINE PAY 驗證碼共用一格，切換收款方式不清空
  const [paymentRef, setPaymentRef] = useState("");
  const [receivingAccountId, setReceivingAccountId] = useState(DEFAULT_RECEIVING_ACCOUNT_ID);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // 收款成功後顯示要傳給客人的「客戶回覆聯」，不直接關閉
  const [replyText, setReplyText] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const contentRef = useRef<HTMLDivElement>(null);

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
    setWriteOffShortfall(false);
    setWriteOffReason("匯費／手續費");
    setPaymentRef("");
    setReceivingAccountId(loadLastAccountId());
    setReplyText(null);
    setCopyState("idle");
  }, [open, schedule, outstandingThisSchedule]);

  const isCard = paymentMethod === "credit_card";
  const isTransfer = paymentMethod === "transfer";
  const refPaymentType = REF_PAYMENT_TYPE[paymentMethod] ?? null;

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

    const shortfallNow = outstandingThisSchedule - receivedAmount;
    const doWriteOff = writeOffShortfall && shortfallNow > 0;
    // 只有匯款／刷卡／LINE PAY 存末五碼；只有匯款存收款帳戶
    const ref = refPaymentType ? paymentRef.trim() : "";
    const accountId = isTransfer ? receivingAccountId : "";

    setSaving(true);
    try {
      await onSubmit({
        scheduleId: schedule.scheduleId,
        receivedAmount,
        receivedDate,
        paymentMethod,
        paymentRef: ref,
        receivingAccountId: accountId,
        notes: doWriteOff
          ? [finalNotes, `沖銷差額 $${fmt(shortfallNow)}：${writeOffReason}`]
              .filter(Boolean)
              .join("\n")
          : finalNotes,
        // 負值＝下修應收，使本期以實收金額結清（已收現金不變）
        ...(doWriteOff ? { adjustmentAmount: -shortfallNow } : {}),
      });
      if (isTransfer) saveLastAccountId(receivingAccountId);
      setReplyText(
        buildClientReply({
          date: isoDateToLocalDate(receivedDate),
          payLabel: receiptPayLabelForSchedule(schedule.label, schedule.seq, scheduleCount),
          // 刷卡：客人看到的是他刷的金額（含手續費），不是我們實收的淨額
          amount: isCard ? cardGrossAmount : receivedAmount,
          paymentType: refPaymentType,
          paymentRef: ref,
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "記錄失敗");
    } finally {
      setSaving(false);
    }
  }

  async function handleCopy() {
    if (!replyText) return;
    const ok = await copyText(replyText, contentRef.current);
    setCopyState(ok ? "copied" : "failed");
  }

  if (!schedule) return null;

  const shortfall = outstandingThisSchedule - receivedAmount;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent ref={contentRef}>
        <DialogHeader>
          <DialogTitle>
            {replyText ? "已記錄收款" : `記錄收款 — 第 ${schedule.seq} 期 ${schedule.label}`}
          </DialogTitle>
        </DialogHeader>

        {replyText ? (
          <>
            <div className="space-y-3">
              <p className="text-xs text-[var(--text-secondary)]">
                客戶回覆聯（複製後貼到 LINE 給客人）
              </p>
              <div className="select-all whitespace-pre-wrap break-words rounded border border-[var(--border)] bg-[var(--bg-subtle)] p-3 text-base leading-relaxed text-[var(--text-primary)]">
                {replyText}
              </div>
              {copyState === "failed" && (
                <div className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  自動複製失敗，請長按上方文字手動複製。
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                完成
              </Button>
              <Button
                size="lg"
                className="h-12 text-base md:h-12"
                onClick={() => void handleCopy()}
              >
                {copyState === "copied" ? (
                  <>
                    <Check className="h-4 w-4" />
                    已複製
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    複製給客人
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        ) : (
        <>
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

          {/* 末五碼：匯款／刷卡／LINE PAY 共用一格，切換方式不清空 */}
          {refPaymentType && (
            <div className={isTransfer ? "grid grid-cols-2 gap-3" : undefined}>
              <div>
                <Label className="mb-1 block text-xs">
                  {PAYMENT_REF_PLACEHOLDER[refPaymentType]}（選填）
                </Label>
                <Input
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                  placeholder={PAYMENT_REF_PLACEHOLDER[refPaymentType]}
                  maxLength={refPaymentType === "LINE PAY" ? undefined : 5}
                  inputMode={refPaymentType === "LINE PAY" ? undefined : "numeric"}
                />
              </div>
              {isTransfer && (
                <div>
                  <Label className="mb-1 block text-xs">收款帳戶（選填）</Label>
                  <Select value={receivingAccountId} onValueChange={setReceivingAccountId}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RECEIVING_ACCOUNT_OPTIONS.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

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

          {/* 實收 < 應收 → 可一併沖銷差額，不留幽靈尾款 */}
          {shortfall > 0 && (
            <div className="space-y-2 rounded border border-blue-200 bg-blue-50/60 p-3">
              <label className="flex cursor-pointer items-start gap-2 text-xs text-blue-900">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={writeOffShortfall}
                  onChange={(e) => setWriteOffShortfall(e.target.checked)}
                />
                <span>
                  將差額 <span className="font-semibold">NT$ {fmt(shortfall)}</span> 沖銷（此期直接結清）
                  <br />
                  <span className="text-[11px] text-blue-700">
                    客戶自扣匯費／折讓時勾選。已收現金不變，只下修應收 —— 不會虛增現金。
                  </span>
                </span>
              </label>
              {writeOffShortfall && (
                <Input
                  className="h-8 text-xs"
                  value={writeOffReason}
                  onChange={(e) => setWriteOffReason(e.target.value)}
                  placeholder="沖銷原因"
                />
              )}
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
                  ? "例：銀行：玉山"
                  : "例：支票號 CH1234"
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
        </>
        )}
      </DialogContent>
    </Dialog>
  );
}
