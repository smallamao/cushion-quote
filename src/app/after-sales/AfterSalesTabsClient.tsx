"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { AfterSalesListClient } from "@/app/after-sales/AfterSalesListClient";
import { MyScheduleClient } from "@/app/my-schedule/MyScheduleClient";
import { useCurrentUser } from "@/hooks/useCurrentUser";

type Tab = "list" | "schedule";

export function AfterSalesTabsClient() {
  const { user, loading } = useCurrentUser();
  const [tab, setTab] = useState<Tab | null>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-[var(--text-secondary)]" size={32} />
      </div>
    );
  }

  const isAdmin = user?.role === "admin";
  // Technicians default to schedule; admins default to list
  const activeTab = tab ?? (isAdmin ? "list" : "schedule");

  return (
    <div>
      <div className="flex border-b border-[var(--border)] px-4 bg-[var(--bg-base)]">
        <button
          onClick={() => setTab("list")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === "list"
              ? "border-[var(--accent)] text-[var(--accent)]"
              : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }`}
        >
          工單列表
        </button>
        <button
          onClick={() => setTab("schedule")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === "schedule"
              ? "border-[var(--accent)] text-[var(--accent)]"
              : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }`}
        >
          我的行程
        </button>
      </div>

      {activeTab === "list" ? <AfterSalesListClient /> : <MyScheduleClient />}
    </div>
  );
}
