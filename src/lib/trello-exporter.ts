import { LIST_NAMES, TRELLO } from "@/lib/trello-constants";
import { getCustomFieldNumber, getCustomFieldText } from "@/lib/trello-helpers";
import type { CustomFieldItem, TrelloCard } from "@/lib/trello-helpers";

const TRELLO_BASE = "https://api.trello.com/1";

const TARGET_LIST_IDS = [
  TRELLO.LISTS.ORDER,
  TRELLO.LISTS.PRODUCTION,
  TRELLO.LISTS.WAIT_SHIPPING,
  TRELLO.LISTS.SHIPPED,
  TRELLO.LISTS.WAIT_REVIEW,
  TRELLO.LISTS.COMPLETED,
];

// ── Public types ──────────────────────────────────────────

export interface ExportedCard {
  id: string;
  name: string;           // full Trello card name, e.g. "P5970黃立偉"
  orderNumber: string;
  customerName: string;
  address: string;
  due: Date;
  orderDate: Date | null;
  listId: string;
  listName: string;
  productCode: string;
  sourceChannel: string;  // from 分析/XXX label
  sofaAmount: number;
  furnitureAmount: number;
  beddingAmount: number;
  total: number;
}

export interface PivotChartPoint {
  productCode: string;
  sofa: number;
  furniture: number;
  bedding: number;
  count: number;
}

export interface SourceChartPoint {
  channel: string;
  count: number;
}

export interface ExportResult {
  cards: ExportedCard[];
  cardCount: number;
  pivotData: PivotChartPoint[];
  sourceData: SourceChartPoint[];
}

// ── TrelloExporter ────────────────────────────────────────

export class TrelloExporter {
  private key: string;
  private token: string;

  constructor(key: string, token: string) {
    this.key = key;
    this.token = token;
  }

  private async trelloGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${TRELLO_BASE}/${path}`);
    url.searchParams.set("key", this.key);
    url.searchParams.set("token", this.token);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) throw new Error(`Trello API ${res.status}: ${path}`);
    return res.json() as Promise<T>;
  }

  private async fetchAllCardsFromBoard(): Promise<TrelloCard[]> {
    const all: TrelloCard[] = [];
    for (const listId of TARGET_LIST_IDS) {
      const cards = await this.trelloGet<TrelloCard[]>(`lists/${listId}/cards`, {
        customFieldItems: "true",
        fields: "id,name,desc,due,dueComplete,idList,idBoard,labels,badges",
      });
      all.push(...cards);
    }
    return all;
  }

  private filterCardsByDate(cards: TrelloCard[], since: Date, until: Date): TrelloCard[] {
    return cards.filter((c) => {
      if (!c.due) return false;
      const d = new Date(c.due);
      return d >= since && d <= until;
    });
  }

  private deduplicateCards(cards: TrelloCard[]): TrelloCard[] {
    const seen = new Set<string>();
    return cards.filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
  }

  private parseCards(cards: TrelloCard[]): ExportedCard[] {
    return cards
      .filter((c) => !c.labels.some((l) => l.name === "成交/訂製維修"))
      .map((c) => {
        const fields = (c.customFieldItems ?? []) as CustomFieldItem[];
        const due = new Date(c.due!);

        const orderDateRaw = getCustomFieldText(fields, TRELLO.CUSTOM_FIELDS.ORDER_DATE);
        let orderDate: Date | null = null;
        if (orderDateRaw) {
          const d = new Date(orderDateRaw.replace(/\//g, "-") + "T00:00:00+08:00");
          if (!isNaN(d.getTime())) orderDate = d;
        }

        const orderNumber = c.name.match(/P\d{4,6}/)?.[0] ?? "";
        const customerName = c.name.replace(orderNumber, "").trim();
        const descLines = c.desc.split("\n").map((l) => l.trim()).filter(Boolean);
        const address = descLines[0] ?? "";
        const productLabel = c.labels.find((l) => l.name?.startsWith("成交/"));
        const productCode = productLabel?.name?.replace("成交/", "") ?? "";
        const sourceLabel = c.labels.find((l) => l.name?.startsWith("分析/"));
        const sourceChannel = sourceLabel?.name?.split("/")[1] ?? "";
        const sofaAmount = getCustomFieldNumber(fields, TRELLO.CUSTOM_FIELDS.SOFA_AMOUNT);
        const furnitureAmount = getCustomFieldNumber(fields, TRELLO.CUSTOM_FIELDS.FURNITURE_AMOUNT);
        const beddingAmount = getCustomFieldNumber(fields, TRELLO.CUSTOM_FIELDS.BEDDING_AMOUNT);

        return {
          id: c.id,
          name: c.name,
          orderNumber,
          customerName,
          address,
          due,
          orderDate,
          listId: c.idList,
          listName: LIST_NAMES[c.idList] ?? c.idList,
          productCode,
          sourceChannel,
          sofaAmount,
          furnitureAmount,
          beddingAmount,
          total: sofaAmount + furnitureAmount + beddingAmount,
        };
      });
  }

  private buildPivotData(cards: ExportedCard[]): PivotChartPoint[] {
    const codes = Array.from(new Set(cards.map((c) => c.productCode || "未標記"))).sort();
    const map = new Map<string, PivotChartPoint>(
      codes.map((code) => [code, { productCode: code, sofa: 0, furniture: 0, bedding: 0, count: 0 }])
    );
    for (const c of cards) {
      const code = c.productCode || "未標記";
      const entry = map.get(code)!;
      entry.sofa += c.sofaAmount;
      entry.furniture += c.furnitureAmount;
      entry.bedding += c.beddingAmount;
      entry.count += 1;
    }
    return codes.map((code) => map.get(code)!);
  }

  private buildSourceData(cards: ExportedCard[]): SourceChartPoint[] {
    const groups = new Map<string, number>();
    for (const c of cards) {
      if (!c.sourceChannel) continue;
      groups.set(c.sourceChannel, (groups.get(c.sourceChannel) ?? 0) + 1);
    }
    return Array.from(groups.keys())
      .sort()
      .map((channel) => ({ channel, count: groups.get(channel)! }));
  }

  async startExport(sinceStr: string, untilStr: string, labelNames?: string[]): Promise<ExportResult> {
    const since = new Date(sinceStr.replace(/\//g, "-") + "T00:00:00+08:00");
    const until = new Date(untilStr.replace(/\//g, "-") + "T00:00:00+08:00");
    until.setDate(until.getDate() + 1);

    let cards = await this.fetchAllCardsFromBoard();
    cards = this.filterCardsByDate(cards, since, until);
    cards = this.deduplicateCards(cards);
    if (labelNames && labelNames.length > 0) {
      cards = cards.filter((c) => c.labels.some((l) => labelNames.includes(l.name)));
    }

    const exported = this.parseCards(cards);
    exported.sort((a, b) => a.due.getTime() - b.due.getTime());

    return {
      cards: exported,
      cardCount: exported.length,
      pivotData: this.buildPivotData(exported),
      sourceData: this.buildSourceData(exported),
    };
  }
}

export function exporterMouthReport(
  sinceStr: string,
  untilStr: string,
  labelNames?: string[],
): Promise<ExportResult> {
  const key   = process.env.TRELLO_KEY?.trim();
  const token = process.env.TRELLO_TOKEN?.trim();
  if (!key || !token) throw new Error("Trello credentials not configured");
  return new TrelloExporter(key, token).startExport(sinceStr, untilStr, labelNames);
}
