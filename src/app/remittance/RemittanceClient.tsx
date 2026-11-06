"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { MessageResultModal } from "@/components/sofa/MessageResultModal";
import { ReceiptConfirmModal } from "@/components/sofa/ReceiptConfirmModal";
import {
  BANK_ACCOUNTS,
  PAYMENT_REF_PLACEHOLDER,
  buildReceiptMessage,
  buildRemittanceMessage,
  type BankAccount,
  type CardInfo,
  type PaymentType,
} from "@/lib/remittance";
import {
  buildReceiptInvoiceQuery,
  canInvoiceFromReceipt,
  type ReceiptInvoiceInfo,
} from "@/lib/receipt-invoice";

/** 本地日期 YYYY-MM-DD（收款確認訊息裡的「匯款日期」也是用當下本地日期） */
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ─── Constants ────────────────────────────────────────────────────────────────

// 帳戶清單與訊息產生器搬到 @/lib/remittance，應收帳款「記錄收款」共用同一份
const QUICK_AMOUNTS = [3000, 5000, 10000, 15000, 20000];

// ─── Component ────────────────────────────────────────────────────────────────

export function RemittanceClient() {
  const [amount, setAmount] = useState("");
  // 帳號末五碼／卡號末五碼／LINE PAY 驗證碼共用一格，切換付款方式不清空
  const [paymentRef, setPaymentRef] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [paymentType, setPaymentType] = useState<PaymentType>("匯款");
  const router = useRouter();
  // invoice：輸出當下的收款資料快照（LINE PAY／刷卡才有），按「開立發票」就帶這份過去
  const [receiptModal, setReceiptModal] = useState<{
    customer: string;
    full: string;
    invoice: ReceiptInvoiceInfo | null;
  } | null>(null);
  const [isBalance, setIsBalance] = useState(false);
  const [modal, setModal] = useState<{ title: string; message: string } | null>(null);
  const [showAccountPicker, setShowAccountPicker] = useState(false);
  const [cardInfo, setCardInfo] = useState<CardInfo | null>(null);

  useEffect(() => {
    if (localStorage.getItem("CHECK_PAYMENT") === "1") {
      const finalPayment = localStorage.getItem("FINAL_PAYMENT") ?? "";
      const orderNum = localStorage.getItem("ORDER_NUM_PAYMENT") ?? "";
      const rawCardInfo = localStorage.getItem("CURRENT_CARD_INFO");
      setAmount(finalPayment);
      setOrderNumber(orderNum);
      if (orderNum) localStorage.setItem("remittance_order_number", orderNum);
      setPaymentType("匯款");
      setIsBalance(true);
      if (rawCardInfo) {
        try { setCardInfo(JSON.parse(rawCardInfo) as CardInfo); } catch { /* ignore */ }
      }
      localStorage.removeItem("CHECK_PAYMENT");
      localStorage.removeItem("FINAL_PAYMENT");
      localStorage.removeItem("ORDER_NUM_PAYMENT");
      localStorage.removeItem("CURRENT_CARD_INFO");
      return;
    }
    const saved = localStorage.getItem("remittance_order_number");
    if (saved) setOrderNumber(saved);
  }, []);

  function handleOrderNumberChange(v: string) {
    setOrderNumber(v);
    localStorage.setItem("remittance_order_number", v);
  }

  function handleAccountClick(account: BankAccount) {
    if (!amount) return;
    const msg = buildRemittanceMessage(account, amount, isBalance, orderNumber);
    setModal({ title: `匯款訊息 - ${account.buttonLabel}`, message: msg });
  }

  function showBothReceipts(isPotatoAccount: boolean) {
    const customer = buildReceiptMessage(amount, paymentRef, orderNumber, paymentType, "客戶回覆聯", isBalance, paymentRef, isPotatoAccount, cardInfo ?? undefined);
    const full = buildReceiptMessage(amount, paymentRef, orderNumber, paymentType, "完整記錄", isBalance, paymentRef, isPotatoAccount, cardInfo ?? undefined);
    const amountNum = Number(amount);
    const invoice: ReceiptInvoiceInfo | null =
      canInvoiceFromReceipt(paymentType) && amountNum > 0
        ? {
            amount: amountNum,
            orderNumber: orderNumber.trim(),
            paymentType,
            paymentRef: paymentRef.trim(),
            receivedDate: localToday(),
          }
        : null;
    setReceiptModal({ customer, full, invoice });
  }

  function handleReceiptClick() {
    if (!amount) return;
    // 匯款需先選收款帳戶（供「完整記錄」使用）；其餘直接同時輸出兩段
    if (paymentType === "匯款") {
      setShowAccountPicker(true);
      return;
    }
    showBothReceipts(true);
  }

  function handleAccountPick(isPotatoAccount: boolean) {
    setShowAccountPicker(false);
    showBothReceipts(isPotatoAccount);
  }

  const segmentBase =
    "flex-1 rounded-[var(--radius-sm)] py-1.5 text-xs font-medium transition-colors";
  const segmentActive = "bg-[var(--accent)] text-white";
  const segmentInactive =
    "text-[var(--text-secondary)] hover:text-[var(--text-primary)]";

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4">
      <h1 className="text-base font-semibold text-[var(--text-primary)]">
        匯款資訊
      </h1>

      {/* Amount */}
      <div className="space-y-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
        <label className="text-xs font-medium text-[var(--text-secondary)]">
          金額
        </label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="輸入金額"
          className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
        />
        <div className="flex flex-wrap gap-1.5">
          {QUICK_AMOUNTS.map((v) => (
            <button
              key={v}
              onClick={() => setAmount(String(v))}
              className="rounded-full border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              {v.toLocaleString()}
            </button>
          ))}
        </div>
      </div>

      {/* Balance toggle */}
      <div className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5">
        <span className="text-sm text-[var(--text-primary)]">尾款模式</span>
        <button
          onClick={() => setIsBalance((v) => !v)}
          className={`relative h-6 w-11 rounded-full transition-colors ${isBalance ? "bg-[var(--accent)]" : "bg-[var(--border)]"}`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${isBalance ? "left-5.5" : "left-0.5"}`}
            style={{ left: isBalance ? "1.375rem" : "0.125rem" }}
          />
        </button>
      </div>

      {/* Account buttons */}
      <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
        <p className="mb-2 text-xs font-medium text-[var(--text-secondary)]">
          選擇帳號輸出匯款訊息
        </p>
        <div className="grid grid-cols-2 gap-2">
          {BANK_ACCOUNTS.map((acct) => (
            <button
              key={acct.id}
              onClick={() => handleAccountClick(acct)}
              disabled={!amount}
              className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-xs font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {acct.buttonLabel}
            </button>
          ))}
        </div>
      </div>

      {/* Receipt section */}
      <div className="space-y-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
        <p className="text-xs font-medium text-[var(--text-secondary)]">
          收款確認
        </p>

        {/* Payment type */}
        <div className="flex rounded-[var(--radius-sm)] bg-[var(--bg-subtle)] p-0.5">
          {(["匯款", "刷卡", "LINE PAY"] as PaymentType[]).map((t) => (
            <button
              key={t}
              onClick={() => setPaymentType(t)}
              className={`${segmentBase} ${paymentType === t ? segmentActive : segmentInactive}`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Order number */}
        <input
          type="text"
          value={orderNumber}
          onChange={(e) => handleOrderNumberChange(e.target.value)}
          placeholder="訂單編號（Pxxxx / Sxxxx）— 填了會直接帶進匯款訊息"
          className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
        />

        {/* Last five / card last five / LINE PAY code */}
        <input
          type="text"
          value={paymentRef}
          onChange={(e) => setPaymentRef(e.target.value)}
          placeholder={PAYMENT_REF_PLACEHOLDER[paymentType]}
          maxLength={paymentType === "LINE PAY" ? undefined : 5}
          className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
        />

        <button
          onClick={handleReceiptClick}
          disabled={!amount}
          className="w-full rounded-[var(--radius-sm)] bg-[var(--accent)] py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          輸出收款確認
        </button>
      </div>

      {/* Account picker action sheet */}
      {showAccountPicker && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowAccountPicker(false)} />
          <div className="relative z-10 w-full max-w-lg rounded-t-2xl bg-[var(--bg-elevated)] pb-safe">
            <p className="py-3 text-center text-xs text-[var(--text-secondary)]">
              請選擇收款帳戶
            </p>
            <div className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
              <button
                onClick={() => handleAccountPick(false)}
                className="w-full py-4 text-base font-medium text-[var(--accent)]"
              >
                【陳金水】
              </button>
              <button
                onClick={() => handleAccountPick(true)}
                className="w-full py-4 text-base font-medium text-[var(--accent)]"
              >
                【馬鈴薯沙發】
              </button>
            </div>
            <div className="border-t-8 border-[var(--bg-subtle)]">
              <button
                onClick={() => setShowAccountPicker(false)}
                className="w-full py-4 text-base font-medium text-[var(--accent)]"
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}

      {modal && (
        <MessageResultModal
          open={true}
          title={modal.title}
          message={modal.message}
          onClose={() => setModal(null)}
        />
      )}

      {receiptModal && (
        <ReceiptConfirmModal
          open
          title="收款確認"
          segments={[
            { label: "客戶回覆聯（傳給客戶）", text: receiptModal.customer },
            { label: "完整記錄（內部存查）", text: receiptModal.full },
          ]}
          onClose={() => setReceiptModal(null)}
          primaryAction={
            receiptModal.invoice
              ? {
                  label: "開立發票",
                  hint: "帶到電子發票頁填好，確認後才會送出",
                  onClick: () => {
                    const info = receiptModal.invoice;
                    if (!info) return;
                    router.push(`/einvoices?${buildReceiptInvoiceQuery(info)}` as never);
                  },
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
