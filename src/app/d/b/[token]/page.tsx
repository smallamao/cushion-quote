import type { Metadata } from "next";

import { DriverBatchClient } from "./DriverBatchClient";

export const metadata: Metadata = {
  title: "配送時段確認 · 馬鈴薯沙發",
};

export default async function DriverBatchPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <DriverBatchClient token={token} />;
}
