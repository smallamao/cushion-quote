"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Stethoscope } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAfterSales } from "@/hooks/useAfterSales";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useUnreadReplies } from "@/hooks/useUnreadReplies";
import type { AfterSalesStatus } from "@/lib/types";

const STATUS_LABEL: Record<AfterSalesStatus, string> = {
  pending: "待確認",
  scheduled: "已排程",
  in_progress: "維修中",
  completed: "已完成",
  cancelled: "取消",
};

const STATUS_COLOR: Record<AfterSalesStatus, string> = {
  pending: "bg-gray-100 text-gray-700",
  scheduled: "bg-blue-100 text-blue-700",
  in_progress: "bg-amber-100 text-amber-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

function getSafeStatus(status: AfterSalesStatus | string | undefined): AfterSalesStatus {
  return status && status in STATUS_LABEL ? (status as AfterSalesStatus) : "pending";
}

export function AfterSalesListClient() {
  const router = useRouter();
  const isMobile = useIsMobile();
  const { user } = useCurrentUser();
  const { services, loading, error } = useAfterSales();
  const { markAsRead } = useUnreadReplies();
  const isAdmin = user?.role === "admin";

  // 進入售後列表頁時延遲標記已讀，避免跟頁面載入搶 API 配額
  useEffect(() => {
    const t = setTimeout(() => void markAsRead(), 3000);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<AfterSalesStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return services
      .filter((s) => statusFilter === "all" || s.status === statusFilter)
      .filter((s) => {
        if (!q) return true;
        return (
          s.serviceId.toLowerCase().includes(q) ||
          s.clientName.toLowerCase().includes(q) ||
          s.clientPhone.includes(q) ||
          s.relatedOrderNo.toLowerCase().includes(q) ||
          s.modelCode.toLowerCase().includes(q) ||
          s.modelNameSnapshot.toLowerCase().includes(q) ||
          s.issueDescription.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.serviceId.localeCompare(a.serviceId));
  }, [services, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageRows = filtered.slice(pageStart, pageStart + pageSize);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: services.length };
    for (const s of services) {
      counts[s.status] = (counts[s.status] ?? 0) + 1;
    }
    return counts;
  }, [services]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Stethoscope className="h-6 w-6" />
            售後服務
          </h1>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            管理客戶報修、派工與維修記錄 {services.length} 筆
          </p>
        </div>
        {isAdmin && (
          <Link href={"/after-sales/new" as never}>
            <Button>
              <Plus className="mr-1 h-4 w-4" />
              新增報修單
            </Button>
          </Link>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜尋單號、客戶、電話、訂單、款式..."
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-1 overflow-x-auto flex-nowrap pb-1">
          {(
            [
              ["all", "全部"],
              ["pending", "待確認"],
              ["scheduled", "已排程"],
              ["in_progress", "維修中"],
              ["completed", "已完成"],
              ["cancelled", "取消"],
            ] as const
          ).map(([key, label]) => (
            <Button
              key={key}
              size="sm"
              variant={statusFilter === key ? "default" : "outline"}
              onClick={() => setStatusFilter(key)}
            >
              {label}
              {statusCounts[key] !== undefined && (
                <span className="ml-1 text-[10px] opacity-70">
                  {statusCounts[key]}
                </span>
              )}
            </Button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {isMobile ? (
        <div className="space-y-3">
          {loading && (
            <div className="py-8 text-center text-xs text-[var(--text-tertiary)]">
              載入中...
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="py-8 text-center text-xs text-[var(--text-tertiary)]">
              尚無符合的售後單
            </div>
          )}
          {pageRows.map((s) => {
            const safeStatus = getSafeStatus(s.status);
            return (
              <div
                key={s.serviceId}
                className="cursor-pointer rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3 shadow-sm active:opacity-80"
                onClick={() => router.push(`/after-sales/${s.serviceId}`)}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-[var(--accent)]">
                    {s.serviceId}
                  </span>
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-[11px] ${STATUS_COLOR[safeStatus]}`}
                  >
                    {STATUS_LABEL[safeStatus]}
                  </span>
                </div>
                <div className="mt-1 text-sm font-medium">
                  {s.clientName}
                  {s.clientPhone && (
                    <span className="ml-2 text-xs font-normal text-[var(--text-tertiary)]">
                      {s.clientPhone}
                    </span>
                  )}
                </div>
                {(s.modelNameSnapshot || s.issueDescription) && (
                  <div className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">
                    {s.modelNameSnapshot && (
                      <span>{s.modelNameSnapshot}</span>
                    )}
                    {s.modelNameSnapshot && s.issueDescription && (
                      <span className="mx-1">—</span>
                    )}
                    {s.issueDescription && (
                      <span>{s.issueDescription}</span>
                    )}
                  </div>
                )}
                <div className="mt-1.5 flex items-center justify-between text-[10px] text-[var(--text-tertiary)]">
                  <span>{s.receivedDate}</span>
                  <span>{s.assignedTo || "—"}</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-2)] text-xs uppercase text-[var(--text-secondary)]">
              <tr>
                <th className="px-3 py-2 text-left">單號</th>
                <th className="px-3 py-2 text-left">受理日期</th>
                <th className="px-3 py-2 text-left">客戶</th>
                <th className="px-3 py-2 text-left">款式</th>
                <th className="px-3 py-2 text-left">問題</th>
                <th className="px-3 py-2 text-left">狀態</th>
                <th className="px-3 py-2 text-left">負責人</th>
                <th className="px-3 py-2 text-left">訂單</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-xs text-[var(--text-tertiary)]">
                    載入中...
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-xs text-[var(--text-tertiary)]">
                    尚無符合的售後單
                  </td>
                </tr>
              )}
              {pageRows.map((s) => {
                const safeStatus = getSafeStatus(s.status);
                return (
                  <tr
                    key={s.serviceId}
                    className="border-t border-[var(--border)] hover:bg-[var(--bg-hover)] cursor-pointer"
                    onClick={() => router.push(`/after-sales/${s.serviceId}`)}
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={`/after-sales/${s.serviceId}` as never}
                        className="block font-mono text-xs text-[var(--accent)] hover:underline"
                      >
                        {s.serviceId}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-xs">{s.receivedDate}</td>
                    <td className="px-3 py-2">
                      <div className="text-sm">{s.clientName}</div>
                      <div className="text-[10px] text-[var(--text-tertiary)]">
                        {s.clientPhone}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {s.modelCode && (
                        <span className="font-mono">{s.modelCode}</span>
                      )}
                      {s.modelNameSnapshot && (
                        <span className="ml-1 text-[var(--text-tertiary)]">
                          {s.modelNameSnapshot}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="max-w-xs truncate text-xs text-[var(--text-secondary)]">
                        {s.issueDescription}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[11px] ${STATUS_COLOR[safeStatus]}`}
                      >
                        {STATUS_LABEL[safeStatus]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs">{s.assignedTo || "—"}</td>
                    <td className="px-3 py-2 text-xs text-[var(--text-secondary)]">
                      {s.relatedOrderNo || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--text-secondary)]">
          <div>
            {isMobile ? (
              <span>
                <span className="font-semibold text-[var(--text-primary)]">{currentPage}</span>
                {" / "}
                <span className="font-semibold text-[var(--text-primary)]">{totalPages}</span>
                {" 頁，共 "}
                <span className="font-semibold text-[var(--text-primary)]">{filtered.length}</span>
                {" 筆"}
              </span>
            ) : (
              <>
                顯示 <span className="font-semibold text-[var(--text-primary)]">{pageStart + 1}</span>
                {" - "}
                <span className="font-semibold text-[var(--text-primary)]">
                  {Math.min(pageStart + pageSize, filtered.length)}
                </span>
                {" / "}
                <span className="font-semibold text-[var(--text-primary)]">{filtered.length}</span> 筆
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!isMobile && (
              <label className="flex items-center gap-1">
                每頁
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="h-7 rounded border border-[var(--border)] bg-white px-1 text-xs"
                >
                  <option value={20}>20</option>
                  <option value={30}>30</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                筆
              </label>
            )}
            <div className="flex items-center gap-1">
              <Button size="sm" variant="outline" disabled={currentPage === 1} onClick={() => setPage(1)}>
                «
              </Button>
              <Button size="sm" variant="outline" disabled={currentPage === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                ‹<span className="hidden md:inline ml-1">上一頁</span>
              </Button>
              <span className="px-2">
                {currentPage} / {totalPages}
              </span>
              <Button size="sm" variant="outline" disabled={currentPage === totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                <span className="hidden md:inline mr-1">下一頁</span>›
              </Button>
              <Button size="sm" variant="outline" disabled={currentPage === totalPages} onClick={() => setPage(totalPages)}>
                »
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
