const NOTION_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

// ── Types ─────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NotionProp = Record<string, any>;

export interface NotionOrderRow {
  name: string;
  orderDate: string;    // "下單日" YYYY-MM-DD or ""
  cost: number | null;  // "成本"
  shippingDate: string; // "出貨日" YYYY-MM-DD or ""
  quote: number | null; // "報價"
}

// ── Property extractors ───────────────────────────────────

function extractTitle(prop: NotionProp | undefined): string {
  if (!prop || prop.type !== "title") return "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (prop.title as any[]).map((t) => t.plain_text ?? "").join("");
}

function extractDate(prop: NotionProp | undefined): string {
  if (!prop || prop.type !== "date" || !prop.date) return "";
  return prop.date.start ?? "";
}

function extractNumber(prop: NotionProp | undefined): number | null {
  if (!prop || prop.type !== "number") return null;
  return typeof prop.number === "number" ? prop.number : null;
}

// ── Notion API ────────────────────────────────────────────

async function queryAll(
  token: string,
  dbId: string,
  since: string,
  until: string,
): Promise<NotionProp[]> {
  const pages: NotionProp[] = [];
  let cursor: string | undefined;

  do {
    const body: Record<string, unknown> = {
      filter: {
        and: [
          { property: "出貨日", date: { on_or_after: since } },
          { property: "出貨日", date: { on_or_before: until } },
        ],
      },
      sorts: [{ property: "出貨日", direction: "ascending" }],
      page_size: 100,
    };
    if (cursor) body.start_cursor = cursor;

    const res = await fetch(`${NOTION_BASE}/databases/${dbId}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Notion API ${res.status}: ${text}`);
    }

    const data = (await res.json()) as {
      results: NotionProp[];
      has_more: boolean;
      next_cursor: string | null;
    };
    pages.push(...data.results);
    cursor = data.has_more && data.next_cursor ? data.next_cursor : undefined;
  } while (cursor);

  return pages;
}

// ── Public export ─────────────────────────────────────────

export async function fetchNotionOrders(
  dbId: string,
  since: string,
  until: string,
): Promise<NotionOrderRow[]> {
  const token = process.env.NOTION_TOKEN?.trim();
  if (!token) throw new Error("NOTION_TOKEN not configured");

  const pages = await queryAll(token, dbId, since, until);

  return pages.map((p) => {
    const props = p.properties as Record<string, NotionProp>;
    return {
      name:         extractTitle(props["Name"]),
      orderDate:    extractDate(props["下單日"]),
      cost:         extractNumber(props["成本"]),
      shippingDate: extractDate(props["出貨日"]),
      quote:        extractNumber(props["報價"]),
    };
  });
}
