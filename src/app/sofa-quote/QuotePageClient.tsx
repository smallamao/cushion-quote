"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { SofaQuoteClient } from "@/app/sofa-quote/SofaQuoteClient";
import { PosQuoteClient } from "@/app/pos-quote/PosQuoteClient";

type QuoteTab = "sofa" | "pos";

const TABS: Array<{ value: QuoteTab; label: string }> = [
  { value: "sofa", label: "尺寸報價" },
  { value: "pos", label: "POS 訂製報價" },
];

export function QuotePageClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tab = (searchParams.get("tab") as QuoteTab | null) ?? "sofa";
  const activeTab: QuoteTab = tab === "pos" ? "pos" : "sofa";

  function setTab(t: QuoteTab) {
    router.replace(`/sofa-quote?tab=${t}`);
  }

  return (
    <div>
      <div className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--bg-base)]">
        <div className="mx-auto flex max-w-lg gap-0 px-4">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={[
                "flex-1 py-3 text-sm font-medium transition-colors",
                activeTab === t.value
                  ? "border-b-2 border-[var(--accent)] text-[var(--accent)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
              ].join(" ")}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "sofa" ? <SofaQuoteClient /> : <PosQuoteClient />}
    </div>
  );
}
