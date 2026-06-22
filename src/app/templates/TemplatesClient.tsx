"use client";

import { useCallback, useState } from "react";
import { Check, ChevronDown, Copy, FileText } from "lucide-react";

import type { TemplateCategory, TemplateItem } from "./data/templates";
import { templateCategories } from "./data/templates";
import { DisclosureDialog } from "./DisclosureDialog";

function TemplateActionSheet({
  item,
  onClose,
}: {
  item: { title: string; content: string };
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(item.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = item.content;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [item.content]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative z-10 w-full max-w-lg rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        <div className="border-b border-[var(--border)] px-5 py-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              {item.title}
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              aria-label="關閉"
            >
              <ChevronDown className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>
        </div>
        <div className="px-5 py-4">
          <div className="max-h-60 overflow-y-auto whitespace-pre-wrap rounded-lg bg-[var(--bg-subtle)] px-4 py-3 text-sm leading-7 text-[var(--text-secondary)]">
            {item.content}
          </div>
        </div>
        <div className="border-t border-[var(--border)] px-5 py-4">
          <button
            type="button"
            onClick={handleCopy}
            className={[
              "flex w-full items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-colors",
              copied
                ? "bg-[var(--success)] text-white"
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
                複製內容
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function CategorySection({
  category,
  defaultOpen,
}: {
  category: TemplateCategory;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [activeDisclosure, setActiveDisclosure] =
    useState<DisclosureTemplateData | null>(null);
  const [activeSheet, setActiveSheet] = useState<{
    title: string;
    content: string;
  } | null>(null);

  return (
    <div className="card-surface rounded-[var(--radius-lg)] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-[var(--bg-subtle)]"
      >
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          {category.name}
        </h2>
        <ChevronDown
          className="h-4 w-4 text-[var(--text-tertiary)] transition-transform duration-200"
          style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
          strokeWidth={1.5}
        />
      </button>

      {open && (
        <div className="border-t border-[var(--border)]">
          {category.items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (item.type === "disclosure") {
                  setActiveDisclosure(item);
                } else {
                  setActiveSheet({ title: item.title, content: item.content });
                }
              }}
              className="flex w-full items-center gap-3 border-b border-[var(--border)] px-5 py-3.5 text-left transition-colors last:border-b-0 hover:bg-[var(--bg-subtle)]"
            >
              <FileText
                className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]"
                strokeWidth={1.5}
              />
              <span className="text-sm text-[var(--text-primary)]">
                {item.title}
              </span>
            </button>
          ))}
        </div>
      )}

      {activeDisclosure && (
        <DisclosureDialog
          open={!!activeDisclosure}
          onClose={() => setActiveDisclosure(null)}
          header={activeDisclosure.header}
          items={activeDisclosure.items}
          defaultChecked={activeDisclosure.defaultChecked}
        />
      )}

      {activeSheet && (
        <TemplateActionSheet
          item={activeSheet}
          onClose={() => setActiveSheet(null)}
        />
      )}
    </div>
  );
}

type DisclosureTemplateData = Extract<
  TemplateItem,
  { type: "disclosure" }
>;

export function TemplatesClient() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">
          快速回覆工具箱
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          點選分類展開，點擊項目即可預覽內容並複製到剪貼簿
        </p>
      </div>

      {templateCategories.map((cat) => (
        <CategorySection
          key={cat.name}
          category={cat}
          defaultOpen={cat.name === "【訂單相關】"}
        />
      ))}
    </div>
  );
}
