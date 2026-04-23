import { Suspense } from "react";

import { EInvoicesClient } from "@/app/einvoices/EInvoicesClient";

export default function EInvoicesPage() {
  return (
    <Suspense>
      <EInvoicesClient />
    </Suspense>
  );
}
