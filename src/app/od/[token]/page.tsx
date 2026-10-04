import type { Metadata } from "next";

import { OrderConfirmClient } from "./OrderConfirmClient";

// 帶客戶姓名與訂貨內容的對外頁，不給搜尋引擎索引。
export const metadata: Metadata = {
  title: "線上下訂確認 · 馬鈴薯沙發",
  robots: { index: false, follow: false },
};

export default async function OrderConfirmPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <OrderConfirmClient token={token} />;
}
