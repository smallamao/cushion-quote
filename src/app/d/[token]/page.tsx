import type { Metadata } from "next";

import { DriverClient } from "./DriverClient";

export const metadata: Metadata = {
  title: "配送時段確認 · 馬鈴薯沙發",
};

export default async function DriverPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <DriverClient token={token} />;
}
