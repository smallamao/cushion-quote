"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";

export interface MaterialOption {
  id: string;
  label: string;
  searchText: string;
}

interface Props {
  value: string;
  materials: readonly MaterialOption[];
  favoriteMaterials?: readonly MaterialOption[];
  recentMaterials?: readonly MaterialOption[];
  onChange: (id: string) => void;
  placeholder?: string;
  customLabel?: string;
  maxResults?: number;
}

function dedupeById(items: readonly MaterialOption[]): MaterialOption[] {
  const seen = new Set<string>();
  const result: MaterialOption[] = [];

  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
  }

  return result;
}

export function MaterialCombobox({
  value,
  materials,
  favoriteMaterials = [],
  recentMaterials = [],
  onChange,
  placeholder = "選擇材質或自訂",
  customLabel = "自訂面料（手動輸入成本）",
  maxResults = 80,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => materials.find((material) => material.id === value) ?? null,
    [materials, value],
  );

  const orderedMaterials = useMemo(() => dedupeById(materials), [materials]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return orderedMaterials.slice(0, maxResults);

    return orderedMaterials
      .filter((material) => material.searchText.toLowerCase().includes(q))
      .slice(0, maxResults);
  }, [orderedMaterials, query, maxResults]);

  const grouped = useMemo(() => {
    const favorite = dedupeById(favoriteMaterials.filter((item) => orderedMaterials.some((material) => material.id === item.id)));
    const recent = dedupeById(
      recentMaterials.filter(
        (item) =>
          orderedMaterials.some((material) => material.id === item.id) &&
          !favorite.some((fav) => fav.id === item.id),
      ),
    );
    const rest = orderedMaterials.filter(
      (item) => !favorite.some((fav) => fav.id === item.id) && !recent.some((rec) => rec.id === item.id),
    );

    return { favorite, recent, rest };
  }, [favoriteMaterials, recentMaterials, orderedMaterials]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setHighlight(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function onDocClick(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  useEffect(() => {
    if (highlight >= filtered.length) {
      setHighlight(0);
    }
  }, [filtered, highlight]);

  function pick(id: string) {
    onChange(id);
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((current) => Math.min(current + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const material = filtered[highlight];
      if (material) pick(material.id);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  function renderOption(item: MaterialOption, idx?: number) {
    const isSelected = item.id === value;
    const isActive = idx != null && idx === highlight;

    return (
      <button
        type="button"
        key={item.id}
        onMouseEnter={() => {
          if (idx != null) setHighlight(idx);
        }}
        onClick={() => pick(item.id)}
        className={`flex w-full items-center gap-2 px-2 py-2.5 text-left text-xs ${isActive ? "bg-[var(--bg-subtle)]" : ""}`}
      >
        <Check
          className={`h-3 w-3 shrink-0 ${isSelected ? "text-[var(--accent)]" : "text-transparent"}`}
        />
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
      </button>
    );
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex h-10 w-full items-center justify-between rounded-md border border-[var(--border)] bg-white px-3 text-left text-sm hover:bg-[var(--bg-subtle)]"
      >
        <span className="min-w-0 flex-1 truncate">
          {value === "custom"
            ? customLabel
            : selected?.label ?? <span className="text-[var(--text-tertiary)]">{placeholder}</span>}
        </span>
        <ChevronsUpDown className="ml-2 h-4 w-4 text-[var(--text-tertiary)]" />
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-50 w-full rounded-md border border-[var(--border)] bg-white shadow-lg">
          <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2">
            <Search className="h-4 w-4 text-[var(--text-tertiary)]" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setHighlight(0);
              }}
              onKeyDown={onKeyDown}
              placeholder="搜尋品牌 / 系列 / 色號 / 名稱 / 編號..."
              className="h-7 flex-1 bg-transparent text-sm outline-none"
            />
            <span className="text-[10px] text-[var(--text-tertiary)]">
              {filtered.length}
              {orderedMaterials.length > filtered.length && ` / ${orderedMaterials.length}`}
            </span>
          </div>

          <div className="max-h-80 overflow-y-auto py-1">
            {query.trim() ? (
              <>
                <button
                  type="button"
                  onClick={() => pick("custom")}
                  className={`flex w-full items-center gap-2 px-2 py-2.5 text-left text-xs ${value === "custom" ? "bg-[var(--bg-subtle)]" : ""}`}
                >
                  <Check className={`h-3 w-3 shrink-0 ${value === "custom" ? "text-[var(--accent)]" : "text-transparent"}`} />
                  <span className="min-w-0 flex-1 truncate">{customLabel}</span>
                </button>
                <div className="my-1 border-t border-[var(--border)]" />
                {filtered.length === 0 ? (
                  <div className="px-3 py-4 text-center text-xs text-[var(--text-tertiary)]">沒有符合的面料</div>
                ) : (
                  filtered.map((item, idx) => renderOption(item, idx))
                )}
              </>
            ) : (
              <>
                {grouped.favorite.length > 0 && (
                  <>
                    <div className="px-2 py-1.5 text-[11px] font-medium text-[var(--text-tertiary)]">★ 常用材質</div>
                    {grouped.favorite.map((item) => renderOption(item))}
                    <div className="my-1 border-t border-[var(--border)]" />
                  </>
                )}
                {grouped.recent.length > 0 && (
                  <>
                    <div className="px-2 py-1.5 text-[11px] font-medium text-[var(--text-tertiary)]">最近使用</div>
                    {grouped.recent.map((item) => renderOption(item))}
                    <div className="my-1 border-t border-[var(--border)]" />
                  </>
                )}
                <button
                  type="button"
                  onClick={() => pick("custom")}
                  className={`flex w-full items-center gap-2 px-2 py-2.5 text-left text-xs ${value === "custom" ? "bg-[var(--bg-subtle)]" : ""}`}
                >
                  <Check className={`h-3 w-3 shrink-0 ${value === "custom" ? "text-[var(--accent)]" : "text-transparent"}`} />
                  <span className="min-w-0 flex-1 truncate">{customLabel}</span>
                </button>
                <div className="my-1 border-t border-[var(--border)]" />
                <div className="px-2 py-1.5 text-[11px] font-medium text-[var(--text-tertiary)]">全部面料</div>
                {grouped.rest.length === 0 ? (
                  <div className="px-3 py-4 text-center text-xs text-[var(--text-tertiary)]">目前沒有可用面料</div>
                ) : (
                  grouped.rest.map((item) => renderOption(item))
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
