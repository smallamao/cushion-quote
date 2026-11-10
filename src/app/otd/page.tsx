import type { Metadata } from "next";

import { OtdClient } from "./OtdClient";

export const metadata: Metadata = {
  title: "交期達成率 · 馬鈴薯沙發",
};

export default function OtdPage() {
  return (
    <div className="px-4 py-6 sm:px-6">
      <OtdClient />
    </div>
  );
}
