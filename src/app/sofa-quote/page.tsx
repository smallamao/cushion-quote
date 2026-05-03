import { Suspense } from "react";
import { QuotePageClient } from "@/app/sofa-quote/QuotePageClient";

export default function SofaQuotePage() {
  return (
    <Suspense>
      <QuotePageClient />
    </Suspense>
  );
}
