import { NextRequest, NextResponse } from "next/server";

import type { CustomFieldItem, TrelloCard } from "@/lib/trello-helpers";

const TRELLO_KEY = process.env.TRELLO_KEY?.trim();
const TRELLO_TOKEN = process.env.TRELLO_TOKEN?.trim();
const TRELLO_BASE = "https://api.trello.com/1";

const CARD_FIELDS = "name,desc,due,dueComplete,idList,idBoard,labels,badges";

function trelloUrl(path: string, params: Record<string, string> = {}): string {
  const qs = new URLSearchParams(params);
  if (TRELLO_KEY) qs.set("key", TRELLO_KEY);
  if (TRELLO_TOKEN) qs.set("token", TRELLO_TOKEN);
  return `${TRELLO_BASE}/${path}?${qs.toString()}`;
}

async function trelloGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const res = await fetch(trelloUrl(path, params), { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Trello ${path} 回應 ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// 候選卡片與 custom fields 的短期快取：切日期時整包候選卡其實沒變，
// 60 秒內重用讓日期切換近乎即時。（serverless 熱 instance 內有效）
const CACHE_TTL_MS = 60_000;
let candidateCache: { at: number; cards: TrelloCard[] } | null = null;
const cfCache = new Map<string, { at: number; items: CustomFieldItem[] }>();

/**
 * 撈出候選卡片（策略封裝於此，之後可換）。
 * 用 boards/{id}/cards/open 而非 search due: 運算子——search 的 due:month
 * 只涵蓋「未來 30 天」，當天已過時段的卡算 overdue、已標記完成的卡兩者皆漏，
 * 對「單日彙整」都是致命洞。板卡片端點回傳全部未封存卡，語意精確。
 */
async function fetchCandidateCards(force: boolean): Promise<TrelloCard[]> {
  if (!force && candidateCache && Date.now() - candidateCache.at < CACHE_TTL_MS) {
    return candidateCache.cards;
  }
  const boards = await trelloGet<{ id: string }[]>("members/me/boards", {
    filter: "open",
    fields: "id",
  });
  const perBoard = await Promise.all(
    boards.map((b) =>
      trelloGet<TrelloCard[]>(`boards/${b.id}/cards/open`, { fields: CARD_FIELDS }).catch(
        () => [] as TrelloCard[],
      ),
    ),
  );
  const cards = perBoard.flat();
  candidateCache = { at: Date.now(), cards };
  return cards;
}

/** due 是否落在台北時區的指定日（date 格式 YYYY-MM-DD）。伺服器時區無關。 */
function isDueOnDate(due: string | null, date: string): boolean {
  if (!due) return false;
  const start = new Date(`${date}T00:00:00+08:00`).getTime();
  const end = start + 24 * 3600 * 1000;
  const t = new Date(due).getTime();
  return Number.isFinite(t) && t >= start && t < end;
}

/** 以 Trello batch API 抓多卡 custom fields（每批 10 個 GET），帶 60 秒快取。 */
async function fetchCustomFieldsBatch(
  cardIds: string[],
  force: boolean,
): Promise<Map<string, CustomFieldItem[]>> {
  const now = Date.now();
  const result = new Map<string, CustomFieldItem[]>();
  const missing: string[] = [];
  for (const id of cardIds) {
    const hit = cfCache.get(id);
    if (!force && hit && now - hit.at < CACHE_TTL_MS) {
      result.set(id, hit.items);
    } else {
      missing.push(id);
    }
  }
  for (let i = 0; i < missing.length; i += 10) {
    const chunk = missing.slice(i, i + 10);
    const urls = chunk.map((id) => `/cards/${id}/customFieldItems`).join(",");
    const batch = await trelloGet<Array<Record<string, CustomFieldItem[]>>>("batch", { urls });
    batch.forEach((entry, idx) => {
      const items = entry["200"] ?? [];
      result.set(chunk[idx], items);
      cfCache.set(chunk[idx], { at: now, items });
    });
  }
  return result;
}

// GET /api/trello/day-shipments?date=YYYY-MM-DD
// 回傳指定日（台北時區）due 到期的全部卡片＋各卡 custom fields。
// 分組、訊息組裝都在前端做（重用 trello-helpers 的既有解析）。
export async function GET(req: NextRequest) {
  if (!TRELLO_KEY || !TRELLO_TOKEN) {
    return NextResponse.json({ ok: false, error: "Trello 未設定" }, { status: 503 });
  }
  const date = req.nextUrl.searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ ok: false, error: "date 格式須為 YYYY-MM-DD" }, { status: 400 });
  }

  const force = req.nextUrl.searchParams.get("refresh") === "1";

  try {
    const candidates = await fetchCandidateCards(force);
    const matched = candidates
      .filter((c) => isDueOnDate(c.due, date))
      .sort((a, b) => (a.due ?? "").localeCompare(b.due ?? ""));

    const fieldsByCard = await fetchCustomFieldsBatch(matched.map((c) => c.id), force);
    const cards = matched.map((card) => ({
      card,
      customFields: fieldsByCard.get(card.id) ?? [],
    }));

    return NextResponse.json({ ok: true, date, cards });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
