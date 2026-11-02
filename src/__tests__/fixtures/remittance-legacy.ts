// 重構前 src/app/remittance/RemittanceClient.tsx 的訊息邏輯原文（commit 8f38105），
// 只給 remittance-messages.test.ts 比對「搬到 @/lib/remittance 後輸出一字不差」用，不要改。

export type PaymentType = "匯款" | "刷卡" | "LINE PAY";
export type MessageType = "客戶回覆聯" | "完整記錄";

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

  const fmtAmount = Number(amount).toLocaleString("zh-TW");
  const clientReply = `${rocDate} 已經確認收到${payLabel}款項 $${fmtAmount}${accountSuffix} 囉！ 非常感謝😊`;

  if (msgType === "客戶回覆聯") return clientReply;

  // 完整記錄
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
