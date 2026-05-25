import type { AfterSalesService } from "@/lib/types";

const TECHNICIAN_WRITABLE = new Set([
  "status",
  "completionNotes",
  "completionPhotos",
  "completedDate",
]);

const TECHNICIAN_ALLOWED_STATUSES = new Set(["in_progress", "completed"]);

/**
 * Validates and sanitises a technician PATCH body.
 * Returns the filtered subset of allowed fields, or an error.
 */
export function filterTechnicianPatch(
  body: Record<string, unknown>,
): { ok: true; filtered: Record<string, unknown> } | { ok: false; error: string } {
  const forbidden = Object.keys(body).filter((k) => !TECHNICIAN_WRITABLE.has(k));
  if (forbidden.length > 0) {
    return { ok: false, error: `forbidden fields: ${forbidden.join(", ")}` };
  }
  if ("status" in body) {
    if (typeof body.status !== "string" || !TECHNICIAN_ALLOWED_STATUSES.has(body.status)) {
      return { ok: false, error: `forbidden status: ${String(body.status)}` };
    }
  }
  const filtered = Object.fromEntries(
    Object.entries(body).filter(([k]) => TECHNICIAN_WRITABLE.has(k)),
  );
  return { ok: true, filtered };
}

export interface DateGroup {
  date: string;
  items: AfterSalesService[];
}

/** Groups services by scheduledDate. Excludes services with no scheduledDate. */
export function groupByDate(services: AfterSalesService[]): DateGroup[] {
  const map = new Map<string, AfterSalesService[]>();
  for (const s of services) {
    if (!s.scheduledDate) continue;
    const existing = map.get(s.scheduledDate) ?? [];
    map.set(s.scheduledDate, [...existing, s]);
  }
  return Array.from(map.entries()).map(([date, items]) => ({ date, items }));
}

/**
 * Sorts date groups: today first, then future dates ascending, then past dates descending.
 */
export function sortDateGroups(
  groups: DateGroup[],
  today: string = new Date().toISOString().slice(0, 10),
): DateGroup[] {
  const todayGroups = groups.filter((g) => g.date === today);
  const future = groups
    .filter((g) => g.date > today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const past = groups
    .filter((g) => g.date < today)
    .sort((a, b) => b.date.localeCompare(a.date));
  return [...todayGroups, ...future, ...past];
}

/**
 * Builds a Google Maps multi-stop route URL from an array of addresses.
 * Uses /maps/dir/ format — works on mobile without an API key.
 */
export function buildMapsUrl(addresses: string[]): string {
  if (addresses.length === 0) return "https://www.google.com/maps";
  const encoded = addresses.map((a) => encodeURIComponent(a));
  return `https://www.google.com/maps/dir/${encoded.join("/")}`;
}
