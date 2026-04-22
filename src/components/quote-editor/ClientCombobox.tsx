"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Search, UserPlus } from "lucide-react";

import type { Client } from "@/lib/types";

interface Props {
  value: string;
  clients: readonly Client[];
  onChange: (clientId: string) => void;
  loading?: boolean;
  maxResults?: number;
  /** Snapshot name shown when `value` is a real ID but not found in `clients` (e.g. client was hard-deleted). */
  fallbackName?: string;
}

export function ClientCombobox({
  value,
  clients,
  onChange,
  loading = false,
  maxResults = 50,
  fallbackName,
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

  useEffect(() => {
    if (highlight >= filtered.length + 1) setHighlight(0);
  }, [filtered, highlight]);

  function pick(id: string) {
    onChange(id);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const total = filtered.length + 1; // +1 for "new client" option
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, total - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlight === 0) {
        pick("__new__");
      } else {
        const c = filtered[highlight - 1];
        if (c) pick(c.id);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

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
          ) : selected ? (
            <>
              <span className="font-medium">{selected.companyName}</span>
              {selected.contactName && (
                <span className="ml-2 text-[var(--text-secondary)]">
                  {selected.contactName}
                </span>
              )}
            </>
          ) : value === "__new__" ? (
            <span>新客戶（手動輸入）</span>
          ) : value && fallbackName ? (
            <>
              <span className="font-medium text-[var(--text-secondary)]">
                {fallbackName}
              </span>
              <span className="ml-2 text-[var(--text-tertiary)]">（已刪除）</span>
            </>
          ) : value ? (
            <span className="text-[var(--text-tertiary)]">無客戶（已刪除）</span>
          ) : (
            <span className="text-[var(--text-tertiary)]">選擇客戶或新建</span>
          )}
        </span>
        <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" />
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
            {/* New client option */}
            <button
              type="button"
              onMouseEnter={() => setHighlight(0)}
              onClick={() => pick("__new__")}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                highlight === 0 ? "bg-[var(--bg-subtle)]" : ""
              }`}
            >
              <UserPlus className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
              <span className="text-[var(--accent)]">新客戶（手動輸入）</span>
            </button>

            {filtered.length === 0 && query ? (
              <div className="px-3 py-4 text-center text-xs text-[var(--text-tertiary)]">
                沒有符合的客戶
              </div>
            ) : (
              filtered.map((c, idx) => {
                const itemIdx = idx + 1;
                const isActive = itemIdx === highlight;
                const isSelected = c.id === value;
                return (
                  <button
                    type="button"
                    key={c.id}
                    onMouseEnter={() => setHighlight(itemIdx)}
                    onClick={() => pick(c.id)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                      isActive ? "bg-[var(--bg-subtle)]" : ""
                    }`}
                  >
                    <Check
                      className={`h-3.5 w-3.5 shrink-0 ${
                        isSelected ? "text-[var(--accent)]" : "text-transparent"
                      }`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{c.companyName}</span>
                      {c.shortName && (
                        <span className="ml-1 text-xs text-[var(--text-tertiary)]">
                          ({c.shortName})
                        </span>
                      )}
                      {c.contactName && (
                        <>
                          <span className="mx-1.5 text-[var(--text-tertiary)]">—</span>
                          <span className="text-[var(--text-secondary)]">{c.contactName}</span>
                        </>
                      )}
                    </span>
                    {c.phone && (
                      <span className="shrink-0 text-xs text-[var(--text-tertiary)]">
                        {c.phone}
                      </span>
                    )}
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
