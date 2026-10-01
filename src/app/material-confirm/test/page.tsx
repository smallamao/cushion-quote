import type { Metadata } from "next";

import { TestLinkClient } from "./TestLinkClient";

export const metadata: Metadata = {
  title: "做一筆測試單 · 馬鈴薯沙發",
};

export default function MaterialConfirmTestPage() {
  return <TestLinkClient />;
}
