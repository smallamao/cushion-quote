"use client";

import * as Switch from "@radix-ui/react-switch";
import { useCallback, useState } from "react";
import { Check, Copy, X } from "lucide-react";

interface DisclosureDialogProps {
  open: boolean;
  onClose: () => void;
  header: string;
  items: string[];
  defaultChecked: boolean[];
}

export function DisclosureDialog({
  open,
  onClose,
  header,
  items,
  defaultChecked,
}: DisclosureDialogProps) {
  const [checked, setChecked] = useState<boolean[]>(defaultChecked);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const selected = items
      .map((item, i) => (checked[i] ? `${i + 1}. ${item}` : null))
      .filter(Boolean) as string[];

    const text = [header, "", ...selected].join("\n\n");

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [checked, header, items]);

  const toggle = useCallback((index: number) => {
    setChecked((prev) => {
      const next = [...prev];
      next[index] = !next[index];
      return next;
    });
  }, []);

  const selectedCount = checked.filter(Boolean).length;
  const allSelected = selectedCount === items.length;

  const toggleAll = useCallback(() => {
    setChecked(allSelected ? items.map(() => false) : items.map(() => true));
  }, [allSelected, items]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative z-10 flex max-h-[85vh] w-full max-w-2xl flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              告知事項
            </h2>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              勾選欲納入的條款，按下複製即可貼到對話中
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            aria-label="關閉"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          <button
            type="button"
            onClick={toggleAll}
            className="mb-2 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-[var(--accent)] transition-colors hover:bg-[var(--accent-light)]"
          >
            <Check
              className="h-3.5 w-3.5"
              strokeWidth={2}
              style={{
                opacity: allSelected ? 1 : 0.4,
              }}
            />
            {allSelected ? "取消全選" : "全選"}
          </button>
          <div className="space-y-1">
            {items.map((item, i) => (
              <label
                key={i}
                className="flex cursor-pointer items-start gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-[var(--bg-subtle)]"
              >
                <Switch.Root
                  checked={checked[i]}
                  onCheckedChange={() => toggle(i)}
                  className="mt-0.5 flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full bg-[var(--border-strong)] data-[state=checked]:bg-[var(--accent)]"
                >
                  <Switch.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform duration-100 will-change-transform data-[state=checked]:translate-x-[18px]" />
                </Switch.Root>
                <span className="text-sm leading-6 text-[var(--text-secondary)]">
                  <span className="mr-1.5 font-medium text-[var(--text-primary)]">
                    #{i + 1}
                  </span>
                  {item}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between border-t border-[var(--border)] px-5 py-4">
          <span className="text-xs text-[var(--text-tertiary)]">
            已選取 {selectedCount} / {items.length} 條
          </span>
          <button
            type="button"
            onClick={handleCopy}
            disabled={selectedCount === 0}
            className={[
              "flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-colors",
              copied
                ? "bg-[var(--success)] text-white"
                : selectedCount === 0
                  ? "cursor-not-allowed bg-[var(--bg-subtle)] text-[var(--text-tertiary)]"
                  : "bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]",
            ].join(" ")}
          >
            {copied ? (
              <>
                <Check className="h-4 w-4" strokeWidth={1.5} />
                已複製
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" strokeWidth={1.5} />
                複製至剪貼簿
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
