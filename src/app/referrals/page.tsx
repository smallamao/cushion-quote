import { Suspense } from "react";
import { Loader2 } from "lucide-react";

import { ReferralsClient } from "@/app/referrals/ReferralsClient";

export default function ReferralsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--text-secondary)]" />
      </div>
    }>
      <ReferralsClient />
    </Suspense>
  );
}
