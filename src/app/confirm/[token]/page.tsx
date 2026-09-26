import type { Metadata } from "next";

import { ConfirmClient } from "./ConfirmClient";

export const metadata: Metadata = {
  title: "訂單內容確認 · 馬鈴薯沙發",
};

export default async function MaterialConfirmPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <ConfirmClient token={token} />;
}
