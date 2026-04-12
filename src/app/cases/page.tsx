import { Suspense } from "react";

import { CasesClient } from "@/app/cases/CasesClient";

export default function CasesPage() {
  return (
    <Suspense fallback={null}>
      <CasesClient />
    </Suspense>
  );
}
