"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Stethoscope } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { useAfterSales } from "@/hooks/useAfterSales";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useDebounce } from "@/hooks/useDebounce";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useUnreadReplies } from "@/hooks/useUnreadReplies";
import type { AfterSalesServiceType, AfterSalesStatus } from "@/lib/types";

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
  const debouncedSearch = useDebounce(search, 200);
  const [statusFilter, setStatusFilter] = useState<AfterSalesStatus | "all" | "pending_scheduled">("pending_scheduled");
  const [typeFilter, setTypeFilter] = useState<AfterSalesServiceType | "all">("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, typeFilter]);

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return services
      .filter((s) => {
        if (statusFilter === "all") return true;
        if (statusFilter === "pending_scheduled") return s.status === "pending" || s.status === "scheduled";
        return s.status === statusFilter;
      })
      .filter((s) => typeFilter === "all" || (s.serviceType ?? "client") === typeFilter)
      .filter((s) => {
        if (!q) return true;
        return (
          s.serviceId.toLowerCase().includes(q) ||
          s.clientName.toLowerCase().includes(q) ||
          s.clientPhone.includes(q) ||
          s.relatedOrderNo.toLowerCase().includes(q) ||
          s.modelCode.toLowerCase().includes(q) ||
          s.modelNameSnapshot.toLowerCase().includes(q) ||
          s.issueDescription.toLowerCase().includes(q) ||
          (s.outsourcedVendor ?? "").toLowerCase().includes(q) ||
          (s.itemDescription ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.serviceId.localeCompare(a.serviceId));
  }, [services, debouncedSearch, statusFilter, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageRows = filtered.slice(pageStart, pageStart + pageSize);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: services.length };
    for (const s of services) {
      counts[s.status] = (counts[s.status] ?? 0) + 1;
    }
    counts.pending_scheduled = (counts.pending ?? 0) + (counts.scheduled ?? 0);
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
        <div
          className="grid w-full grid-cols-3 gap-1.5 lg:flex lg:w-auto lg:flex-nowrap lg:items-center lg:overflow-x-auto"
        >
          {(
            [
              ["pending_scheduled", "待確認＆已排程"],
              ["all", "全部"],
              ["pending", "待確認"],
              ["scheduled", "已排程"],
              ["completed", "已完成"],
              ["cancelled", "取消"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setStatusFilter(key)}
              style={{ whiteSpace: "nowrap" }}
              className={[
                "inline-flex items-center justify-center gap-1 rounded-full px-3 py-1.5 text-xs transition-colors",
                "lg:shrink-0",
                statusFilter === key
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]",
              ].join(" ")}
            >
              <span style={{ whiteSpace: "nowrap" }}>{label}</span>
              {statusCounts[key] !== undefined && (
                <span className="opacity-70">{statusCounts[key]}</span>
              )}
            </button>
          ))}
        </div>
        <div className="flex w-full flex-wrap gap-1.5">
          {(
            [
              ["all", "全部類型"],
              ["client", "客戶報修"],
              ["outsourced", "代辦處理"],
              ["factory_display", "展示品修繕"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTypeFilter(key)}
              style={{ whiteSpace: "nowrap" }}
              className={[
                "inline-flex items-center justify-center gap-1 rounded-full px-3 py-1 text-xs transition-colors",
                typeFilter === key
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]",
              ].join(" ")}
            >
              {label}
            </button>
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
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs text-[var(--accent)]">
                      {s.serviceId}
                    </span>
                    {s.serviceType === "outsourced" && (
                      <span className="rounded bg-orange-100 px-1.5 py-0.5 text-[10px] text-orange-700">代辦</span>
                    )}
                    {s.serviceType === "factory_display" && (
                      <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] text-purple-700">展示品</span>
                    )}
                  </div>
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
                <th className="px-3 py-2 text-left">訂單</th>
                <th className="px-3 py-2 text-left">客戶</th>
                <th className="px-3 py-2 text-left">款式</th>
                <th className="px-3 py-2 text-left">問題</th>
                <th className="px-3 py-2 text-left">狀態</th>
                <th className="px-3 py-2 text-left">負責人</th>
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
                    <td className="px-3 py-2 text-xs text-[var(--text-secondary)]">
                      {s.relatedOrderNo || "—"}
                    </td>
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
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={filtered.length}
        pageStart={pageStart}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
        isMobile={isMobile}
      />
    </div>
  );
}
