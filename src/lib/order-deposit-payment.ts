/**
 * 線上下訂確認專用的訂金匯款文案。
 *
 * 🔴 刻意與 lib/deposit-payment.ts（周春懋帳戶）分開：那組仍供「報價簽署」使用，
 *    老闆 2026-10-04 指定線上下訂改用陳金水帳戶，兩條線互不影響。
 *    改任一邊之前先確認改的是哪一條流程——這是匯款帳號，弄錯錢會進錯戶頭。
 *
 * 內容為業務確認版，除了三個每單變數（訂金金額、匯款期限、訂單編號）之外請逐字保留。
 */

export const ORDER_DEPOSIT_ACCOUNT = `銀行戶名：陳金水
代號：807 永豐商業銀行
分行代碼：1664 海山分行
帳號：16600400697189`;

/** YYYY-MM-DD → M/D（文案裡寫「10/6 前」這種口語格式）。 */
export function formatPayByDate(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((ymd ?? "").trim());
  if (!m) return (ymd ?? "").trim();
  return `${Number(m[2])}/${Number(m[3])}`;
}

export interface OrderDepositOptions {
  depositAmount: number;
  /** YYYY-MM-DD；空字串時該句不提期限 */
  payByDate: string;
  /** 訂單編號，例 P6275；必填（空的話客人匯款備註沒編號，收款端對不上帳） */
  orderNo: string;
}

export function buildOrderDepositMessage({
  depositAmount,
  payByDate,
  orderNo,
}: OrderDepositOptions): string {
  const amount = `$${Number(depositAmount || 0).toLocaleString("zh-TW")}`;
  const by = formatPayByDate(payByDate);
  const firstLine = by
    ? `訂金 ${amount} 煩請於 ${by} 前匯入～`
    : `訂金 ${amount} 煩請盡快匯入～`;

  return [
    "感謝您下訂馬鈴薯沙發😊",
    firstLine,
    "",
    ORDER_DEPOSIT_ACCOUNT,
    "",
    "",
    `⚠️請於備註標明訂單編號 ${orderNo} 以利查收 🙏`,
    "⚠️完成匯款後，請告知匯款日期及帳號後五碼",
    "⚠️確認收到款項後才會叫料下排程哦！",
    "",
    "🔺提醒您，請確認各項訂製內容及注意告知事項",
    "🔺確認無誤後再匯入訂金款項以示同意各項內容❗️",
  ].join("\n");
}
