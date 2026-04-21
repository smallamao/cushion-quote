"use client";

import { Loader2, RefreshCw, Wallet } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PendingMonthlyRecord } from "@/lib/types";

interface ClientGroup {
  clientId: string;
  clientName: string;
  items: PendingMonthlyRecord[];
  total: number;
}

function fmt(n: number): string {
  return n.toLocaleString("zh-TW", { maximumFractionDigits: 0 });
}

function defaultDueDate(): string {
  // Next month's 10th by default (typical 月結 terms).
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + 1, 10);
  return d.toISOString().slice(0, 10);
}

export function PendingMonthlyPanel() {
  const [items, setItems] = useState<PendingMonthlyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsMigration, setNeedsMigration] = useState(false);

  const [selectedByClient, setSelectedByClient] = useState<Record<string, Set<string>>>({});
  const [dueDateByClient, setDueDateByClient] = useState<Record<string, string>>({});
  const [notesByClient, setNotesByClient] = useState<Record<string, string>>({});
  const [consolidatingClientId, setConsolidatingClientId] = useState("");
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNeedsMigration(false);
    try {
      const res = await fetch("/api/sheets/ar/pending-monthly?status=pending", {
        cache: "no-store",
      });
      const json = (await res.json()) as {
        ok: boolean;
        pending?: PendingMonthlyRecord[];
        error?: string;
        needsMigration?: boolean;
      };
      if (!json.ok) {
        setError(json.error ?? "載入失敗");
        return;
      }
      if (json.needsMigration) setNeedsMigration(true);
      setItems(json.pending ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const groups = useMemo<ClientGroup[]>(() => {
    const map = new Map<string, ClientGroup>();
    for (const item of items) {
      const key = item.clientId || "(未指定)";
      const group = map.get(key) ?? {
        clientId: key,
        clientName: item.clientNameSnapshot || key,
        items: [],
        total: 0,
      };
      group.items.push(item);
      group.total += item.amount;
      map.set(key, group);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [items]);

  function toggleItem(clientId: string, pendingId: string) {
    setSelectedByClient((prev) => {
      const next = { ...prev };
      const set = new Set(next[clientId] ?? []);
      if (set.has(pendingId)) set.delete(pendingId);
      else set.add(pendingId);
      next[clientId] = set;
      return next;
    });
  }

  function toggleAllForClient(group: ClientGroup) {
    setSelectedByClient((prev) => {
      const next = { ...prev };
      const current = new Set(next[group.clientId] ?? []);
      const allIds = group.items.map((i) => i.pendingId);
      const allSelected = allIds.every((id) => current.has(id));
      if (allSelected) {
        next[group.clientId] = new Set();
      } else {
        next[group.clientId] = new Set(allIds);
      }
      return next;
    });
  }

  async function consolidate(group: ClientGroup) {
    const selected = selectedByClient[group.clientId];
    const ids = selected ? Array.from(selected) : [];
    if (ids.length === 0) {
      setFlash("請至少勾選一筆");
      setTimeout(() => setFlash(null), 2000);
      return;
    }
    const dueDate = dueDateByClient[group.clientId] || defaultDueDate();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      setFlash("請選擇合理的到期日");
      return;
    }
    const totalAmount = group.items
      .filter((i) => ids.includes(i.pendingId))
      .reduce((sum, i) => sum + i.amount, 0);
    if (
      !confirm(
        `${group.clientName}:合併 ${ids.length} 筆案件,共 NT$ ${fmt(totalAmount)},到期日 ${dueDate}?`,
      )
    ) {
      return;
    }

    setConsolidatingClientId(group.clientId);
    try {
      const res = await fetch("/api/sheets/ar/pending-monthly/consolidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: group.clientId,
          pendingIds: ids,
          dueDate,
          notes: notesByClient[group.clientId] ?? "",
        }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        error?: string;
        consolidated?: number;
      };
      if (!json.ok) {
        setFlash(`失敗: ${json.error ?? "unknown"}`);
        return;
      }
      setFlash(`✓ 已合併 ${json.consolidated ?? ids.length} 筆成一張應收單`);
      // Reset the state for this client and reload.
      setSelectedByClient((prev) => ({ ...prev, [group.clientId]: new Set() }));
      setNotesByClient((prev) => ({ ...prev, [group.clientId]: "" }));
      await load();
    } catch (err) {
      setFlash(err instanceof Error ? err.message : "發生錯誤");
    } finally {
      setConsolidatingClientId("");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-[var(--text-secondary)]">
        <Loader2 className="h-4 w-4 animate-spin" />
        載入月結待出…
      </div>
    );
  }

  if (needsMigration) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        尚未建立「月結待出」工作表。請 admin 開啟一次以下網址以初始化:
        <br />
        <code className="mt-1 block font-mono text-xs">
          https://cushion-quote.vercel.app/api/sheets/migrate-v13
        </code>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
        載入失敗:{error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-[var(--accent)]" />
          <span className="text-sm font-semibold">月結待出</span>
          <span className="text-xs text-[var(--text-tertiary)]">
            {items.length} 筆 · {groups.length} 位月結客戶
          </span>
        </div>
        <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className="h-3.5 w-3.5" />
          重新載入
        </Button>
      </div>

      {flash && (
        <div className="rounded-md bg-[var(--bg-subtle)] px-3 py-2 text-sm">
          {flash}
        </div>
      )}

      {groups.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--text-tertiary)]">
          目前沒有待合併的月結案件
        </p>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => {
            const selected = selectedByClient[group.clientId] ?? new Set<string>();
            const selectedTotal = group.items
              .filter((i) => selected.has(i.pendingId))
              .reduce((sum, i) => sum + i.amount, 0);
            const dueDate = dueDateByClient[group.clientId] ?? defaultDueDate();
            const allSelected =
              group.items.length > 0 &&
              group.items.every((i) => selected.has(i.pendingId));

            return (
              <div
                key={group.clientId}
                className="overflow-hidden rounded-md border border-[var(--border)]"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 bg-[var(--bg-subtle)] px-4 py-2.5">
                  <div>
                    <div className="text-sm font-semibold">{group.clientName}</div>
                    <div className="text-xs text-[var(--text-secondary)]">
                      {group.items.length} 筆待結 · 累計 NT$ {fmt(group.total)}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div>
                      <Label className="text-[11px]">到期日</Label>
                      <Input
                        type="date"
                        value={dueDate}
                        onChange={(e) =>
                          setDueDateByClient((p) => ({
                            ...p,
                            [group.clientId]: e.target.value,
                          }))
                        }
                        className="h-8 w-36"
                      />
                    </div>
                    <Button
                      size="sm"
                      onClick={() => void consolidate(group)}
                      disabled={
                        selected.size === 0 || consolidatingClientId === group.clientId
                      }
                    >
                      {consolidatingClientId === group.clientId ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : null}
                      產生月結單
                      {selected.size > 0 && (
                        <span className="ml-1 text-xs opacity-80">
                          ({selected.size} 筆 / NT$ {fmt(selectedTotal)})
                        </span>
                      )}
                    </Button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-[var(--bg-subtle)]">
                      <tr>
                        <th className="w-10 px-2 py-2 text-center">
                          <Checkbox
                            checked={allSelected}
                            onCheckedChange={() => toggleAllForClient(group)}
                          />
                        </th>
                        <th className="px-2 py-2 text-left">成交日</th>
                        <th className="px-2 py-2 text-left">案件 / 版本</th>
                        <th className="px-2 py-2 text-left">專案 / 案件名</th>
                        <th className="px-2 py-2 text-right">金額</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {group.items.map((item) => (
                        <tr key={item.pendingId} className="hover:bg-[var(--bg-subtle)]">
                          <td className="px-2 py-1.5 text-center">
                            <Checkbox
                              checked={selected.has(item.pendingId)}
                              onCheckedChange={() =>
                                toggleItem(group.clientId, item.pendingId)
                              }
                            />
                          </td>
                          <td className="px-2 py-1.5 font-mono text-[var(--text-secondary)]">
                            {item.acceptedAt || "—"}
                          </td>
                          <td className="px-2 py-1.5 font-mono">
                            <div>{item.caseId}</div>
                            <div className="text-[var(--text-tertiary)]">
                              {item.versionId}
                            </div>
                          </td>
                          <td className="px-2 py-1.5">
                            {item.caseNameSnapshot || item.projectNameSnapshot || "—"}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono">
                            {fmt(item.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="border-t border-[var(--border)] px-4 py-2">
                  <Input
                    placeholder="備註(選填,會寫入產生的月結單)"
                    value={notesByClient[group.clientId] ?? ""}
                    onChange={(e) =>
                      setNotesByClient((p) => ({
                        ...p,
                        [group.clientId]: e.target.value,
                      }))
                    }
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
