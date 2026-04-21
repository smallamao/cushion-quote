"use client";

import { Button } from "@/components/ui/button";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageStart: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  isMobile?: boolean;
}

export function Pagination({
  currentPage,
  totalPages,
  totalItems,
  pageStart,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [20, 30, 50, 100],
  isMobile = false,
}: PaginationProps) {
  if (totalItems === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--text-secondary)]">
      <div>
        {isMobile ? (
          <span>
            <span className="font-semibold text-[var(--text-primary)]">{currentPage}</span>
            {" / "}
            <span className="font-semibold text-[var(--text-primary)]">{totalPages}</span>
            {" 頁，共 "}
            <span className="font-semibold text-[var(--text-primary)]">{totalItems}</span>
            {" 筆"}
          </span>
        ) : (
          <>
            顯示 <span className="font-semibold text-[var(--text-primary)]">{pageStart + 1}</span>
            {" - "}
            <span className="font-semibold text-[var(--text-primary)]">
              {Math.min(pageStart + pageSize, totalItems)}
            </span>
            {" / "}
            <span className="font-semibold text-[var(--text-primary)]">{totalItems}</span> 筆
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        {!isMobile && onPageSizeChange && (
          <label className="flex items-center gap-1">
            每頁
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="h-7 rounded border border-[var(--border)] bg-white px-1 text-xs"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            筆
          </label>
        )}
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            disabled={currentPage === 1}
            onClick={() => onPageChange(1)}
          >
            «
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={currentPage === 1}
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          >
            ‹<span className="hidden md:inline ml-1">上一頁</span>
          </Button>
          <span className="px-2">
            {currentPage} / {totalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={currentPage === totalPages}
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          >
            <span className="hidden md:inline mr-1">下一頁</span>›
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={currentPage === totalPages}
            onClick={() => onPageChange(totalPages)}
          >
            »
          </Button>
        </div>
      </div>
    </div>
  );
}
