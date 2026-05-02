"use client";

import { useState, useEffect } from "react";
import { MessageResultModal } from "@/components/sofa/MessageResultModal";

// ─── Types & Constants ────────────────────────────────────────────────────────

type PaymentType = "匯款" | "刷卡" | "LINE PAY";
type MessageType = "客戶回覆聯" | "完整記錄";

interface BankAccount {
  id: string;
  buttonLabel: string;
  holderName: string;
  bankCode: string;
  bankName: string;
  branchCode: string;
  branchName: string;
  accountNumber: string;
  showBranch: boolean; // 台新簡式省略分行
}

const BANK_ACCOUNTS: BankAccount[] = [
  {
    id: "chen",
    buttonLabel: "陳金水",
    holderName: "陳金水",
    bankCode: "807",
    bankName: "永豐商業銀行",
    branchCode: "1664",
    branchName: "海山分行",
    accountNumber: "16600400697189",
    showBranch: true,
  },
  {
    id: "taishin",
    buttonLabel: "輸出台新銀行",
    holderName: "陳涵儀",
    bankCode: "812",
    bankName: "台新銀行",
    branchCode: "0023",
    branchName: "敦南分行",
    accountNumber: "28881002433394",
    showBranch: true,
  },
  {
    id: "taishin_simple",
    buttonLabel: "輸出台新（簡式）",
    holderName: "陳涵儀",
    bankCode: "812",
    bankName: "台新銀行",
    branchCode: "0023",
    branchName: "敦南分行",
    accountNumber: "28881002433394",
    showBranch: false,
  },
  {
    id: "potato",
    buttonLabel: "馬鈴薯沙發",
    holderName: "馬鈴薯沙發企業社",
    bankCode: "807",
    bankName: "永豐商業銀行",
    branchCode: "0302",
    branchName: "學府分行",
    accountNumber: "03001800081061",
    showBranch: true,
  },
  {
    id: "big_custom",
    buttonLabel: "輸出大戶（訂製）",
    holderName: "周春懋",
    bankCode: "807",
    bankName: "永豐銀行",
    branchCode: "1217",
    branchName: "營業部",
    accountNumber: "16801800085918",
    showBranch: true,
  },
  {
    id: "line_custom",
    buttonLabel: "輸出連線（訂製）",
    holderName: "周春懋",
    bankCode: "824",
    bankName: "連線商業銀行",
    branchCode: "6880",
    branchName: "總行",
    accountNumber: "111019003460",
    showBranch: true,
  },
];

const QUICK_AMOUNTS = [3000, 5000, 10000, 15000, 20000];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPayDeadline(isBalance: boolean): string {
  const days = isBalance ? 1 : 2;
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function toRocDate(date: Date): string {
  const y = date.getFullYear() - 1911;
  return `${y}/${date.getMonth() + 1}/${date.getDate()}`;
}

function buildRemittanceMessage(
  account: BankAccount,
  amount: string,
  isBalance: boolean
): string {
  const payType = isBalance ? "餘額" : "訂金";
  const deadline = getPayDeadline(isBalance);
  const lines: string[] = [];

  lines.push(`感謝您下訂馬鈴薯沙發😊`);
  lines.push(`${payType} $${amount} 煩請於 ${deadline} 前匯入～`);
  lines.push(``);
  lines.push(`銀行戶名：${account.holderName}`);
  lines.push(`代號：${account.bankCode} ${account.bankName}`);
  if (account.showBranch) {
    lines.push(`分行代碼：${account.branchCode} ${account.branchName}`);
  }
  lines.push(`帳號：${account.accountNumber}`);
  lines.push(``);
  lines.push(``);
  lines.push(`⚠️請於備註標明訂單編號（Pxxxx）以利查收 🙏`);
  lines.push(`⚠️完成匯款後，請告知匯款日期及帳號後五碼`);
  if (!isBalance) {
    lines.push(`⚠️確認收到款項後才會叫料下排程哦！`);
  }
  lines.push(``);
  lines.push(`🔺提醒您，請確認各項訂製內容及注意告知事項`);
  lines.push(`🔺確認無誤後再匯入${payType}款項以示同意各項內容❗️`);

  return lines.join("\n");
}

function buildReceiptMessage(
  amount: string,
  lastFive: string,
  orderNumber: string,
  paymentType: PaymentType,
  msgType: MessageType,
  isBalance: boolean,
  linepayCode: string,
  isPotatoAccount: boolean = true  // 完整記錄匯款時：false=陳金水（不加〔馬鈴薯沙發〕）
): string {
  const today = new Date();
  const rocDate = toRocDate(today);
  const payLabel = isBalance ? "餘額" : "訂金";

  let accountSuffix = "";
  if (paymentType === "匯款" && lastFive) {
    accountSuffix = ` (${lastFive})`;
  } else if (paymentType === "刷卡" && lastFive) {
    accountSuffix = ` (刷卡${lastFive})`;
  } else if (paymentType === "LINE PAY" && linepayCode) {
    accountSuffix = ` (LINE PAY驗證碼： ${linepayCode})`;
  }

  const clientReply = `${rocDate} 已經確認收到${payLabel}款項 $${amount}${accountSuffix} 囉！ 非常感謝😊`;

  if (msgType === "客戶回覆聯") return clientReply;

  // 完整記錄
  const amountTag = isPotatoAccount ? ` 〔馬鈴薯沙發〕` : "";
  const lines: string[] = [];
  if (orderNumber) lines.push(`訂單編號：${orderNumber}`);
  lines.push(`匯款日期：${rocDate}`);
  lines.push(`匯款金額：$${amount}${amountTag}`);
  if (paymentType === "匯款" && lastFive) {
    lines.push(`帳號末五碼：${lastFive}`);
  }
  if (isBalance) lines.push(`\n【尾款】`);
  lines.push(``);
  lines.push(`【客戶回覆聯】`);
  lines.push(clientReply);

  return lines.join("\n");
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RemittanceClient() {
  const [amount, setAmount] = useState("");
  const [lastFive, setLastFive] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [paymentType, setPaymentType] = useState<PaymentType>("匯款");
  const [msgType, setMsgType] = useState<MessageType>("客戶回覆聯");
  const [isBalance, setIsBalance] = useState(false);
  const [linepayCode, setLinepayCode] = useState("");
  const [modal, setModal] = useState<{ title: string; message: string } | null>(null);
  const [showAccountPicker, setShowAccountPicker] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("remittance_order_number");
    if (saved) setOrderNumber(saved);
  }, []);

  function handleOrderNumberChange(v: string) {
    setOrderNumber(v);
    localStorage.setItem("remittance_order_number", v);
  }

  function handleAccountClick(account: BankAccount) {
    if (!amount) return;
    const msg = buildRemittanceMessage(account, amount, isBalance);
    setModal({ title: `匯款訊息 - ${account.buttonLabel}`, message: msg });
  }

  function handleReceiptClick() {
    if (!amount) return;
    // 完整記錄 + 匯款 → 先選收款帳戶
    if (msgType === "完整記錄" && paymentType === "匯款") {
      setShowAccountPicker(true);
      return;
    }
    const msg = buildReceiptMessage(amount, lastFive, orderNumber, paymentType, msgType, isBalance, linepayCode);
    setModal({ title: "收款確認", message: msg });
  }

  function handleAccountPick(isPotatoAccount: boolean) {
    setShowAccountPicker(false);
    const msg = buildReceiptMessage(amount, lastFive, orderNumber, paymentType, msgType, isBalance, linepayCode, isPotatoAccount);
    setModal({ title: "收款確認", message: msg });
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

        {/* Message type */}
        <div className="flex rounded-[var(--radius-sm)] bg-[var(--bg-subtle)] p-0.5">
          {(["客戶回覆聯", "完整記錄"] as MessageType[]).map((t) => (
            <button
              key={t}
              onClick={() => setMsgType(t)}
              className={`${segmentBase} ${msgType === t ? segmentActive : segmentInactive}`}
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
          placeholder="訂單編號（Pxxxx）"
          className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
        />

        {/* Last five / LINE PAY code */}
        {paymentType !== "LINE PAY" ? (
          <input
            type="text"
            value={lastFive}
            onChange={(e) => setLastFive(e.target.value)}
            placeholder={paymentType === "匯款" ? "帳號末五碼" : "卡號末五碼"}
            maxLength={5}
            className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
          />
        ) : (
          <input
            type="text"
            value={linepayCode}
            onChange={(e) => setLinepayCode(e.target.value)}
            placeholder="LINE PAY 驗證碼"
            className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
          />
        )}

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
    </div>
  );
}
