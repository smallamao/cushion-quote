import { Suspense } from "react";

import { ProductionOrdersClient } from "@/app/production-orders/ProductionOrdersClient";
import { ProductionListSkeleton } from "@/app/production-orders/ProductionOrderList";

export const metadata = {
  title: "生產訂單 | 馬鈴薯沙發營運系統",
};

// ProductionOrdersClient 用 useSearchParams（?order=）切換清單／詳細頁，需要 Suspense 邊界
export default function ProductionOrdersPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-lg">
          <ProductionListSkeleton />
        </div>
      }
    >
      <ProductionOrdersClient />
    </Suspense>
  );
}
