import { redirect } from "next/navigation";

// 舊「核對入帳」已改成應收帳款裡的「銀行對帳」分頁（唯讀核對），舊網址導過去
export default function BankReconciliationPage() {
  redirect("/receivables?tab=bank");
}
