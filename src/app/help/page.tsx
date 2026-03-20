import fs from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "使用說明 | 馬鈴薯沙發報價系統",
  description: "系統內建操作說明",
};

type MarkdownBlock =
  | { type: "heading"; level: 1 | 2 | 3; text: string; id: string }
  | { type: "paragraph"; lines: string[] }
  | { type: "unordered-list"; items: string[] }
  | { type: "ordered-list"; items: string[] }
  | { type: "code"; language: string; content: string }
  | { type: "image"; alt: string; src: string };

function parseMarkdown(markdown: string): MarkdownBlock[] {
  const lines = markdown.replace(/\r/g, "").split("\n");
  const blocks: MarkdownBlock[] = [];
  let index = 0;
  let headingCount = 0;

  function isBlockStart(line: string) {
    return (
      /^#{1,3}\s+/.test(line) ||
      /^- /.test(line) ||
      /^\d+\.\s/.test(line) ||
      line.startsWith("```") ||
      /^!\[.*\]\(.*\)$/.test(line.trim())
    );
  }

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (line.startsWith("```")) {
      const language = line.slice(3).trim();
      const content: string[] = [];
      index += 1;

      while (index < lines.length && !lines[index].startsWith("```")) {
        content.push(lines[index]);
        index += 1;
      }

      if (index < lines.length) {
        index += 1;
      }

      blocks.push({
        type: "code",
        language,
        content: content.join("\n"),
      });
      continue;
    }

    const imageMatch = /^!\[(.*?)\]\((.+?)\)$/.exec(line.trim());
    if (imageMatch) {
      blocks.push({ type: "image", alt: imageMatch[1], src: imageMatch[2] });
      index += 1;
      continue;
    }

    const headingMatch = /^(#{1,3})\s+(.*)$/.exec(line);
    if (headingMatch) {
      headingCount += 1;
      blocks.push({
        type: "heading",
        level: headingMatch[1].length as 1 | 2 | 3,
        text: headingMatch[2],
        id: `help-section-${headingCount}`,
      });
      index += 1;
      continue;
    }

    if (/^- /.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^- /.test(lines[index])) {
        items.push(lines[index].replace(/^- /, ""));
        index += 1;
      }
      blocks.push({ type: "unordered-list", items });
      continue;
    }

    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s/.test(lines[index])) {
        items.push(lines[index].replace(/^\d+\.\s/, ""));
        index += 1;
      }
      blocks.push({ type: "ordered-list", items });
      continue;
    }

    const paragraphLines: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !isBlockStart(lines[index])
    ) {
      paragraphLines.push(lines[index]);
      index += 1;
    }

    blocks.push({ type: "paragraph", lines: paragraphLines });
  }

  return blocks;
}

function renderInline(text: string): ReactNode[] {
  const parts = text.split(/(`[^`]+`)/g).filter(Boolean);
  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={`${part}-${index}`}
          className="rounded bg-[var(--bg-subtle)] px-1.5 py-0.5 font-mono text-[0.92em] text-[var(--text-primary)]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={`${part}-${index}`}>{part}</span>;
  });
}

async function readHelpDocument() {
  const filePath = path.join(process.cwd(), "docs", "使用說明.md");
  return fs.readFile(filePath, "utf8");
}

export default async function HelpPage() {
  let markdown = "";

  try {
    markdown = await readHelpDocument();
  } catch {
    markdown = "# 使用說明\n\n找不到 `docs/使用說明.md`。";
  }

  const blocks = parseMarkdown(markdown);
  const headings = blocks.filter(
    (block): block is Extract<MarkdownBlock, { type: "heading" }> =>
      block.type === "heading" && block.level === 2,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
            使用說明
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            系統內建操作手冊，內容同步自 <code>docs/使用說明.md</code>
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="card-surface rounded-[var(--radius-lg)] px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
              正式資料
            </div>
            <div className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
              Google Sheets
            </div>
            <div className="mt-1 text-xs text-[var(--text-secondary)]">
              客戶、案件、報價、版本、材質、設定都會寫回雲端表單。
            </div>
          </div>
          <div className="card-surface rounded-[var(--radius-lg)] px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
              本機暫存
            </div>
            <div className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
              localStorage / sessionStorage
            </div>
            <div className="mt-1 text-xs text-[var(--text-secondary)]">
              草稿、快取、收藏、欄寬與頁面跳轉資料只存在目前瀏覽器。
            </div>
          </div>
        </div>
      </div>

      {headings.length > 0 && (
        <div className="card-surface rounded-[var(--radius-lg)] px-5 py-4">
          <div className="text-sm font-medium text-[var(--text-primary)]">
            目錄
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {headings.map((heading) => (
              <a
                key={heading.id}
                href={`#${heading.id}`}
                className="rounded-full border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                {heading.text}
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="card-surface rounded-[var(--radius-lg)] px-6 py-6">
        <article className="space-y-4">
          {blocks.map((block, blockIndex) => {
            if (block.type === "heading") {
              if (block.level === 1) {
                return (
                  <div
                    key={block.id}
                    className={blockIndex === 0 ? "" : "pt-2"}
                    id={block.id}
                  >
                    <h2 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">
                      {block.text}
                    </h2>
                  </div>
                );
              }

              if (block.level === 2) {
                return (
                  <section key={block.id} id={block.id} className="pt-3">
                    <h3
                      className={[
                        "text-lg font-semibold text-[var(--text-primary)]",
                        blockIndex > 0
                          ? "border-t border-[var(--border)] pt-5"
                          : "",
                      ].join(" ")}
                    >
                      {block.text}
                    </h3>
                  </section>
                );
              }

              return (
                <h4
                  key={block.id}
                  id={block.id}
                  className="pt-2 text-sm font-semibold text-[var(--text-primary)]"
                >
                  {block.text}
                </h4>
              );
            }

            if (block.type === "paragraph") {
              return (
                <p
                  key={`p-${blockIndex}`}
                  className="text-sm leading-7 text-[var(--text-secondary)]"
                >
                  {block.lines.map((line, lineIndex) => (
                    <span key={`${line}-${lineIndex}`}>
                      {renderInline(line)}
                      {lineIndex < block.lines.length - 1 ? <br /> : null}
                    </span>
                  ))}
                </p>
              );
            }

            if (block.type === "unordered-list") {
              return (
                <ul
                  key={`ul-${blockIndex}`}
                  className="space-y-2 pl-5 text-sm leading-7 text-[var(--text-secondary)]"
                >
                  {block.items.map((item, itemIndex) => (
                    <li key={`${item}-${itemIndex}`} className="list-disc">
                      {renderInline(item)}
                    </li>
                  ))}
                </ul>
              );
            }

            if (block.type === "ordered-list") {
              return (
                <ol
                  key={`ol-${blockIndex}`}
                  className="space-y-2 pl-5 text-sm leading-7 text-[var(--text-secondary)]"
                >
                  {block.items.map((item, itemIndex) => (
                    <li key={`${item}-${itemIndex}`} className="list-decimal">
                      {renderInline(item)}
                    </li>
                  ))}
                </ol>
              );
            }

            if (block.type === "image") {
              return (
                <figure key={`img-${blockIndex}`} className="py-2">
                  <img
                    src={block.src}
                    alt={block.alt}
                    className="w-full rounded-[var(--radius-md)] border border-[var(--border)]"
                    loading="lazy"
                  />
                  {block.alt && (
                    <figcaption className="mt-2 text-center text-xs text-[var(--text-tertiary)]">
                      {block.alt}
                    </figcaption>
                  )}
                </figure>
              );
            }

            return (
              <pre
                key={`code-${blockIndex}`}
                className="overflow-x-auto rounded-[var(--radius-md)] bg-[#111111] px-4 py-3 text-xs leading-6 text-white"
              >
                <code data-language={block.language || undefined}>
                  {block.content}
                </code>
              </pre>
            );
          })}
        </article>
      </div>
    </div>
  );
}
