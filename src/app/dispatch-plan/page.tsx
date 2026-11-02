import type { Metadata } from "next";

import { DispatchPlanClient } from "./DispatchPlanClient";

export const metadata: Metadata = {
  title: "排車視圖 · 馬鈴薯沙發",
};

export default function DispatchPlanPage() {
  return (
    <div className="px-4 py-6 sm:px-6">
      <DispatchPlanClient />
    </div>
  );
}
