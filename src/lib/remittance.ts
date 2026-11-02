// 匯款資訊頁與應收帳款「記錄收款」共用：收款帳戶清單＋匯款／收款確認訊息產生器。
// 兩邊產生的「客戶回覆聯」必須一字不差，所以集中在這裡，不要各自複製一份。

export type PaymentType = "匯款" | "刷卡" | "LINE PAY";
export type MessageType = "客戶回覆聯" | "完整記錄";
/** 客戶回覆聯裡的款項名稱；「款項」＝不分訂金／餘額（例：一次付清） */
export type ReceiptPayLabel = "訂金" | "餘額" | "款項";

export interface BankAccount {
  id: string;
  buttonLabel: string;
  holderName: string;
  bankCode: string;
  bankName: string;
  branchCode: string;
  branchName: string;
  accountNumber: string;
  showBranch: boolean; // 台新簡式省略分行
  /** 備註要標的訂單編號前綴：沙發單 P、訂製坐墊/維修單 S */
  orderPrefix?: "P" | "S";
  /** 訂製椅墊帳戶：訂金模式附加「可先匯部分訂金／多數客人匯全額」說明 */
  isCustomCushion?: boolean;
}

export const BANK_ACCOUNTS: BankAccount[] = [
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
    orderPrefix: "S",
    isCustomCushion: true,
    holderName: "周春懋",
    bankCode: "807",
    bankName: "永豐銀行",
    branchCode: "1217",
    branchName: "營業部",
    accountNumber: "16801800085918",
    showBranch: true,
  },
  {
    id: "sinopac_custom",
    buttonLabel: "輸出大戶（陳涵儀）",
    orderPrefix: "S",
    isCustomCushion: true,
    holderName: "陳涵儀",
    bankCode: "807",
    bankName: "永豐銀行",
    branchCode: "1217",
    branchName: "營業部",
    accountNumber: "06801800918474",
    showBranch: true,
  },
  {
    id: "line_custom",
    buttonLabel: "輸出連線（訂製）",
    orderPrefix: "S",
    isCustomCushion: true,
    holderName: "周春懋",
    bankCode: "824",
    bankName: "連線商業銀行",
    branchCode: "6880",
    branchName: "總行",
    accountNumber: "111019003460",
    showBranch: true,
  },
];

export const PAYMENT_REF_PLACEHOLDER: Record<PaymentType, string> = {
  匯款: "帳號末五碼",
  刷卡: "卡號末五碼",
  "LINE PAY": "LINE PAY 驗證碼",
};

export interface CardInfo {
  due: string;
  dueComplete: boolean;
  driverName: string;
}

// ─── 收款帳戶（記錄收款用） ────────────────────────────────────────────────────

export interface ReceivingAccountOption {
  id: string;
  label: string;
}

/** 記錄收款時「收款帳戶」預設值：大戶（訂製） */
export const DEFAULT_RECEIVING_ACCOUNT_ID = "big_custom";

/**
 * 收款帳戶選項：同一個實體帳戶（銀行代號＋帳號相同）只留第一筆。
 * 例：taishin 與 taishin_simple 只是訊息格式不同，實際是同一個戶頭 → 只出現一次，存 taishin。
 * 標籤：按鈕名稱去掉「輸出」＋戶名（名稱已含戶名就不重複）＋帳號末四碼，
 * 例「大戶（訂製）周春懋 …5918」。
 */
export function receivingAccountOptions(
  accounts: readonly BankAccount[] = BANK_ACCOUNTS,
): ReceivingAccountOption[] {
  const seen = new Set<string>();
  const out: ReceivingAccountOption[] = [];
  for (const a of accounts) {
    const key = `${a.bankCode}-${a.accountNumber}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: a.id, label: receivingAccountLabel(a) });
  }
  return out;
}

function receivingAccountLabel(a: BankAccount): string {
  const name = a.buttonLabel.replace(/^輸出/, "");
  const sep = name.endsWith("）") ? "" : " ";
  const withHolder = name.includes(a.holderName) ? name : `${name}${sep}${a.holderName}`;
  return `${withHolder} …${a.accountNumber.slice(-4)}`;
}

/** 依 id 找收款帳戶標籤；找不到（舊資料或已移除的帳戶）就原樣回傳 id */
export function receivingAccountLabelById(id: string): string {
  if (!id) return "";
  const acct = BANK_ACCOUNTS.find((a) => a.id === id);
  return acct ? receivingAccountLabel(acct) : id;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPayDeadline(isBalance: boolean): string {
  const days = isBalance ? 1 : 2;
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function toRocDate(date: Date): string {
  const y = date.getFullYear() - 1911;
  return `${y}/${date.getMonth() + 1}/${date.getDate()}`;
}

/** "YYYY-MM-DD" → 當地時區的當天 Date（避免 new Date(iso) 以 UTC 解析造成跨日） */
export function isoDateToLocalDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d);
}

const DAY_NAMES = ["日", "一", "二", "三", "四", "五", "六"] as const;

function formatShippingDate(isoString: string): string {
  const d = new Date(isoString);
  const rocYear = d.getFullYear() - 1911;
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const day = DAY_NAMES[d.getDay()];
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `民國${rocYear}年${mm}月${dd}日 星期${day} ${hh}:${min}`;
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export function buildRemittanceMessage(
  account: BankAccount,
  amount: string,
  isBalance: boolean,
  orderNumber = "",
): string {
  const payType = isBalance ? "餘額" : "訂金";
  const deadline = getPayDeadline(isBalance);
  const fmtAmount = Number(amount).toLocaleString("zh-TW");
  const lines: string[] = [];

  lines.push(`感謝您下訂馬鈴薯沙發😊`);
  lines.push(`${payType} $${fmtAmount} 煩請於 ${deadline} 前匯入～`);
  lines.push(``);
  lines.push(`銀行戶名：${account.holderName}`);
  lines.push(`代號：${account.bankCode} ${account.bankName}`);
  if (account.showBranch) {
    lines.push(`分行代碼：${account.branchCode} ${account.branchName}`);
  }
  lines.push(`帳號：${account.accountNumber}`);
  lines.push(``);
  lines.push(``);
  // 有填訂單編號就直接寫死在訊息裡，客人照抄即可；沒填才退回佔位提示
  const orderNo = orderNumber.trim();
  lines.push(
    orderNo
      ? `⚠️請於備註標明訂單編號 ${orderNo} 以利查收 🙏`
      : `⚠️請於備註標明訂單編號（${account.orderPrefix ?? "P"}xxxx）以利查收 🙏`,
  );
  lines.push(`⚠️完成匯款後，請告知匯款日期及帳號後五碼`);
  if (!isBalance) {
    lines.push(`⚠️確認收到款項後才會叫料下排程哦！`);
  }
  // 訂製椅墊：工期短，客人常直接匯全額省一趟；只在訂金模式提示
  if (!isBalance && account.isCustomCushion) {
    lines.push(``);
    lines.push(`💡 可以先匯部分訂金，只是椅墊製作時間比較快，`);
    lines.push(`💡 大部分客人都是直接匯全額～`);
  }
  lines.push(``);
  lines.push(`🔺提醒您，請確認各項訂製內容及注意告知事項`);
  lines.push(`🔺確認無誤後再匯入${payType}款項以示同意各項內容❗️`);

  return lines.join("\n");
}

export interface ClientReplyInput {
  /** 收款日期（匯款資訊頁＝今天；記錄收款＝實收日期） */
  date: Date;
  payLabel: ReceiptPayLabel;
  amount: string | number;
  /** 非匯款／刷卡／LINE PAY（現金、支票…）傳 null → 不附末五碼 */
  paymentType: PaymentType | null;
  /** 帳號末五碼／卡號末五碼／LINE PAY 驗證碼 */
  paymentRef: string;
}

/** 客戶回覆聯，例：「115/11/2 已經確認收到訂金款項 $4,600 (18173) 囉！ 非常感謝😊」 */
export function buildClientReply({
  date,
  payLabel,
  amount,
  paymentType,
  paymentRef,
}: ClientReplyInput): string {
  const rocDate = toRocDate(date);

  let accountSuffix = "";
  if (paymentType === "匯款" && paymentRef) {
    accountSuffix = ` (${paymentRef})`;
  } else if (paymentType === "刷卡" && paymentRef) {
    accountSuffix = ` (刷卡${paymentRef})`;
  } else if (paymentType === "LINE PAY" && paymentRef) {
    accountSuffix = ` (LINE PAY驗證碼： ${paymentRef})`;
  }

  const fmtAmount = Number(amount).toLocaleString("zh-TW");
  // 「款項」不加前綴 → 「已經確認收到款項」，避免出現「款項款項」
  const what = payLabel === "款項" ? "款項" : `${payLabel}款項`;
  return `${rocDate} 已經確認收到${what} $${fmtAmount}${accountSuffix} 囉！ 非常感謝😊`;
}

export function buildReceiptMessage(
  amount: string,
  lastFive: string,
  orderNumber: string,
  paymentType: PaymentType,
  msgType: MessageType,
  isBalance: boolean,
  linepayCode: string,
  isPotatoAccount: boolean = true,
  cardInfo?: CardInfo,
  date: Date = new Date(),
): string {
  const rocDate = toRocDate(date);
  const clientReply = buildClientReply({
    date,
    payLabel: isBalance ? "餘額" : "訂金",
    amount,
    paymentType,
    paymentRef: paymentType === "LINE PAY" ? linepayCode : lastFive,
  });

  if (msgType === "客戶回覆聯") return clientReply;

  // 完整記錄
  const fmtAmount = Number(amount).toLocaleString("zh-TW");
  const amountTag = isPotatoAccount ? ` 〔馬鈴薯沙發〕` : "";
  const lines: string[] = [];
  if (orderNumber) lines.push(`訂單編號：${orderNumber}`);
  lines.push(`匯款日期：${rocDate}`);
  lines.push(`匯款金額：$${fmtAmount}${amountTag}`);
  if (paymentType === "匯款" && lastFive) {
    lines.push(`帳號末五碼：${lastFive}`);
  }
  if (isBalance) {
    lines.push(`\n【尾款】`);
    if (cardInfo) {
      if (cardInfo.driverName) lines.push(`物流司機：${cardInfo.driverName}`);
      if (cardInfo.due) lines.push(`出貨日：${formatShippingDate(cardInfo.due)}`);
      if (!cardInfo.dueComplete) {
        lines.push(`******`);
        lines.push(`訂單尚未出貨`);
        lines.push(`請於「收款聯」紅單註記簽收`);
        lines.push(`******`);
      }
    }
  }
  lines.push(``);
  lines.push(`【客戶回覆聯】`);
  lines.push(clientReply);

  return lines.join("\n");
}

// ─── 應收分期 → 客戶回覆聯 ────────────────────────────────────────────────────

/**
 * 依分期決定客戶回覆聯寫「訂金」「餘額」或「款項」：
 * 1. 標籤含「訂金」→ 訂金；標籤含「尾款」或「餘額」→ 餘額（標籤是老闆自己取的，最可靠）
 * 2. 多期的第 1 期 → 訂金；多期的最後一期 → 餘額
 * 3. 其餘（一次付清「全額」、三期的「期中款」…）→ 款項，即「已經確認收到款項 $X」
 */
export function receiptPayLabelForSchedule(
  label: string,
  seq: number,
  scheduleCount: number,
): ReceiptPayLabel {
  if (label.includes("訂金")) return "訂金";
  if (label.includes("尾款") || label.includes("餘額")) return "餘額";
  if (scheduleCount > 1 && seq === 1) return "訂金";
  if (scheduleCount > 1 && seq === scheduleCount) return "餘額";
  return "款項";
}
