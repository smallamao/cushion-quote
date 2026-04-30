"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";

import type { Client } from "@/lib/types";

interface Props {
  value: string;
  fallbackName?: string;
  clients: readonly Client[];
  onChange: (companyId: string, companyName: string) => void;
  loading?: boolean;
  maxResults?: number;
}

export function ReferrerCombobox({
  value,
  fallbackName,
  clients,
  onChange,
  loading = false,
  maxResults = 50,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => clients.find((c) => c.id === value),
    [clients, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients.slice(0, maxResults);
    return clients
      .filter((c) =>
        [c.companyName, c.shortName, c.contactName, c.phone, c.taxId]
          .filter(Boolean)
          .some((f) => f.toLowerCase().includes(q)),
      )
      .slice(0, maxResults);
  }, [clients, query, maxResults]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setHighlight(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

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

  function pick(id: string, name: string) {
    onChange(id, name);
    setOpen(false);
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange("", "");
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
      const c = filtered[highlight];
      if (c) pick(c.id, c.companyName);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const displayName = selected?.companyName || fallbackName || "";

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-full items-center justify-between rounded-md border border-[var(--border)] bg-white px-3 text-left text-sm hover:bg-[var(--bg-subtle)]"
      >
        <span className="min-w-0 flex-1 truncate">
          {loading ? (
            <span className="text-[var(--text-tertiary)]">載入中...</span>
          ) : displayName ? (
            <span className="font-medium">{displayName}</span>
          ) : (
            <span className="text-[var(--text-tertiary)]">選擇介紹公司（選填）</span>
          )}
        </span>
        {value ? (
          <X
            onClick={clear}
            className="ml-2 h-3.5 w-3.5 shrink-0 cursor-pointer text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
          />
        ) : (
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" />
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+2px)] z-50 w-full min-w-[400px] max-w-[calc(100vw-2rem)] rounded-md border border-[var(--border)] bg-white shadow-lg">
          <div className="flex items-center gap-1.5 border-b border-[var(--border)] px-3 py-2">
            <Search className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlight(0);
              }}
              onKeyDown={onKeyDown}
              placeholder="搜尋公司名稱、聯絡人、電話、統編..."
              className="h-6 flex-1 bg-transparent text-sm outline-none"
            />
            <span className="text-[10px] text-[var(--text-tertiary)]">
              {filtered.length}
              {clients.length > filtered.length && ` / ${clients.length}`}
            </span>
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-[var(--text-tertiary)]">
                {query ? "找不到符合的公司" : "尚無公司資料"}
              </div>
            ) : (
              filtered.map((c, i) => {
                const isSelected = c.id === value;
                const isHighlighted = i === highlight;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => pick(c.id, c.companyName)}
                    className={`flex w-full items-start gap-2 px-3 py-2 text-left text-sm ${
                      isHighlighted ? "bg-[var(--bg-subtle)]" : ""
                    }`}
                  >
                    <Check
                      className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                        isSelected ? "text-[var(--accent)]" : "text-transparent"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{c.companyName}</div>
                      {(c.contactName || c.phone) && (
                        <div className="mt-0.5 truncate text-[11px] text-[var(--text-secondary)]">
                          {[c.contactName, c.phone].filter(Boolean).join(" · ")}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
