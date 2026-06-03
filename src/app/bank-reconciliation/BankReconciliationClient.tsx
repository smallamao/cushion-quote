"use client";

import { ScanLine } from "lucide-react";

export function BankReconciliationClient() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ScanLine className="h-5 w-5 shrink-0 text-[var(--accent)]" />
        <h1 className="text-xl font-bold">核對入帳</h1>
      </div>
      <p className="text-sm text-[var(--text-secondary)]">開發中</p>
    </div>
  );
}
