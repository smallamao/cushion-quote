import type { Metadata } from "next";

import { SignClient } from "./SignClient";

export const metadata: Metadata = {
  title: "報價單線上簽署 · 馬鈴薯沙發",
};

export default async function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SignClient token={token} />;
}
