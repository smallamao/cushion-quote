"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";

import type { PurchaseProduct } from "@/lib/types";

interface Props {
  value: string;
  products: readonly PurchaseProduct[];
  onChange: (productId: string) => void;
  /** 顯示當前選中商品 (沒選時的 placeholder 才會出現) */
  placeholder?: string;
  /** 打字後最多顯示幾筆 (預設 50) */
  maxResults?: number;
  disabled?: boolean;
}

/**
 * 採購單品項用的搜尋式商品下拉。
 *
 * - 點 trigger 開 popover
 * - 最上方搜尋框自動 focus,支援 productCode / supplierProductCode /
 *   productName / specification 模糊比對
 * - 預設依 productCode 升冪,打字後才過濾
 * - 鍵盤:↑↓ 選列,Enter 確定,Esc 關閉
 */
export function ProductCombobox({
  value,
  products,
  onChange,
  placeholder = "選擇商品...",
  maxResults = 50,
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => products.find((p) => p.id === value),
    [products, value],
  );

  const sorted = useMemo(
    () =>
      [...products].sort((a, b) =>
        a.productCode.localeCompare(b.productCode, "zh-Hant", { numeric: true }),
      ),
    [products],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted.slice(0, maxResults);
    const matches = sorted.filter((p) =>
      [p.productCode, p.supplierProductCode, p.productName, p.specification]
        .filter(Boolean)
        .some((f) => (f as string).toLowerCase().includes(q)),
    );
    return matches.slice(0, maxResults);
  }, [sorted, query, maxResults]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setHighlight(0);
      // 等 popover 掛上 DOM 再 focus
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // 點外面關閉
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  useEffect(() => {
    if (highlight >= filtered.length) setHighlight(0);
  }, [filtered, highlight]);

  function pick(p: PurchaseProduct) {
    onChange(p.id);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const p = filtered[highlight];
      if (p) pick(p);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        className={`flex h-8 w-full items-center justify-between rounded-md border border-[var(--border)] bg-white px-2 text-left text-xs ${disabled ? "cursor-not-allowed opacity-50" : "hover:bg-[var(--bg-subtle)]"}`}
      >
        <span className="min-w-0 flex-1 truncate">
          {selected ? (
            <>
              <span className="font-mono">{selected.productCode}</span>
              {selected.productName && (
                <>
                  <span className="mx-1.5 text-[var(--text-tertiary)]">·</span>
                  <span className="text-[var(--text-tertiary)]">
                    {selected.productName}
                  </span>
                </>
              )}
            </>
          ) : (
            <span className="text-[var(--text-tertiary)]">{placeholder}</span>
          )}
        </span>
        <ChevronsUpDown className="ml-1 h-3 w-3 text-[var(--text-tertiary)]" />
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+2px)] z-50 w-[380px] max-w-[calc(100vw-2rem)] rounded-md border border-[var(--border)] bg-white shadow-lg">
          <div className="flex items-center gap-1.5 border-b border-[var(--border)] px-2 py-1.5">
            <Search className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlight(0);
              }}
              onKeyDown={onKeyDown}
              placeholder="輸入編號 / 廠商原碼 / 名稱 / 規格..."
              className="h-6 flex-1 bg-transparent text-xs outline-none"
            />
            <span className="text-[10px] text-[var(--text-tertiary)]">
              {filtered.length}
              {products.length > filtered.length && ` / ${products.length}`}
            </span>
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-[var(--text-tertiary)]">
                沒有符合的商品
              </div>
            ) : (
              filtered.map((p, idx) => {
                const isActive = idx === highlight;
                const isSelected = p.id === value;
                return (
                  <button
                    type="button"
                    key={p.id}
                    onMouseEnter={() => setHighlight(idx)}
                    onClick={() => pick(p)}
                    className={`flex w-full items-center gap-2 px-2 py-2.5 text-left text-xs ${
                      isActive ? "bg-[var(--bg-subtle)]" : ""
                    }`}
                  >
                    <Check
                      className={`h-3 w-3 shrink-0 ${
                        isSelected
                          ? "text-[var(--accent)]"
                          : "text-transparent"
                      }`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="font-mono">{p.productCode}</span>
                      {p.supplierProductCode && (
                        <span className="ml-1.5 font-mono text-[10px] text-[var(--text-tertiary)]">
                          [{p.supplierProductCode}]
                        </span>
                      )}
                      <span className="mx-1.5 text-[var(--text-tertiary)]">
                        ·
                      </span>
                      <span>{p.productName}</span>
                      {p.specification && (
                        <span className="ml-1.5 text-[var(--text-tertiary)]">
                          ({p.specification})
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-[var(--text-tertiary)]">
                      ${(p.unitPrice ?? 0).toLocaleString()}
                    </span>
                  </button>
                );
              })
            )}
          </div>
          {products.length > maxResults && !query && (
            <div className="border-t border-[var(--border)] px-2 py-1 text-[10px] text-[var(--text-tertiary)]">
              顯示前 {maxResults} 筆,輸入關鍵字可搜尋全部 {products.length} 筆
            </div>
          )}
        </div>
      )}
    </div>
  );
}
