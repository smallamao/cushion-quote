"use client";

import { useEffect, useMemo, useState } from "react";
import { MapPin, Pencil, Plus, RotateCw, Scissors, Search, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { usePurchaseProducts } from "@/hooks/usePurchaseProducts";
import type { FabricRemnant, FabricRemnantPieceType, PurchaseProduct } from "@/lib/types";

const today = () => new Date().toISOString().slice(0, 10);
const fmtLen = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""));

interface FormState {
  id?: string;
  productId: string;
  lengthYd: string;
  pieceType: FabricRemnantPieceType;
  receivedDate: string;
  source: string;
  location: string;
  notes: string;
}

const emptyForm = (): FormState => ({
  productId: "",
  lengthYd: "",
  pieceType: "裁剩",
  receivedDate: today(),
  source: "",
  location: "",
  notes: "",
});

export function FabricRemnantsClient() {
  const { products } = usePurchaseProducts();
  const [remnants, setRemnants] = useState<FabricRemnant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [productSearch, setProductSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<FabricRemnant | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/sheets/fabric-remnants", { cache: "no-store" });
      const json = (await res.json()) as { ok: boolean; remnants?: FabricRemnant[] };
      setRemnants(json.remnants ?? []);
    } catch {
      setRemnants([]);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);

  const productById = useMemo(() => {
    const m = new Map<string, PurchaseProduct>();
    for (const p of products) m.set(p.id, p);
    return m;
  }, [products]);

  // 依色號分組
  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? remnants.filter((r) =>
          `${r.productCode} ${r.productName} ${r.specification} ${r.supplierName} ${r.series} ${r.location}`
            .toLowerCase()
            .includes(q),
        )
      : remnants;
    const map = new Map<string, FabricRemnant[]>();
    for (const r of filtered) {
      const key = r.productCode || r.productId || "(未指定)";
      const list = map.get(key) ?? [];
      list.push(r);
      map.set(key, list);
    }
    return [...map.entries()]
      .map(([code, list]) => ({
        code,
        list: list.slice().sort((a, b) => {
          if (a.pieceType !== b.pieceType) return a.pieceType === "整支" ? -1 : 1;
          return b.lengthYd - a.lengthYd;
        }),
        head: list[0],
        count: list.length,
        total: list.reduce((s, r) => s + r.lengthYd, 0),
      }))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [remnants, search]);

  const totalPieces = remnants.length;
  const totalYd = remnants.reduce((s, r) => s + r.lengthYd, 0);

  function openNew() {
    setForm(emptyForm());
    setProductSearch("");
    setFormError("");
    setModalOpen(true);
  }
  function openEdit(r: FabricRemnant) {
    setForm({
      id: r.id,
      productId: r.productId,
      lengthYd: String(r.lengthYd),
      pieceType: r.pieceType,
      receivedDate: r.receivedDate || today(),
      source: r.source,
      location: r.location,
      notes: r.notes,
    });
    setProductSearch("");
    setFormError("");
    setModalOpen(true);
  }

  async function save() {
    if (!form.productId) {
      setFormError("請選擇布料色號");
      return;
    }
    if (!(Number(form.lengthYd) > 0)) {
      setFormError("請填長度（大於 0）");
      return;
    }
    setBusy(true);
    setFormError("");
    try {
      const isEdit = Boolean(form.id);
      const p = productById.get(form.productId);
      const payload: Partial<FabricRemnant> = {
        id: form.id,
        productId: form.productId,
        productCode: p?.productCode ?? "",
        productName: p?.productName ?? "",
        specification: p?.specification ?? "",
        supplierName: p?.supplierName || p?.supplierId || "",
        series: p?.series ?? "",
        lengthYd: Number(form.lengthYd),
        pieceType: form.pieceType,
        receivedDate: form.receivedDate,
        source: form.source,
        location: form.location,
        notes: form.notes,
      };
      const res = await fetch("/api/sheets/fabric-remnants", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) throw new Error(json.error ?? "儲存失敗");
      setModalOpen(false);
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "儲存失敗");
    } finally {
      setBusy(false);
    }
  }

  async function doDelete(r: FabricRemnant) {
    setBusy(true);
    try {
      await fetch("/api/sheets/fabric-remnants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: r.id, isActive: false }),
      });
      setDeleteTarget(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  const activeProducts = useMemo(
    () =>
      products
        .filter((p) => p.isActive !== false)
        .filter((p) => {
          const q = productSearch.trim().toLowerCase();
          if (!q) return true;
          return `${p.productCode} ${p.productName} ${p.specification}`.toLowerCase().includes(q);
        })
        .sort((a, b) => a.productCode.localeCompare(b.productCode))
        .slice(0, 60),
    [products, productSearch],
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <Scissors className="h-5 w-5 text-[var(--accent)]" />
            裁剩庫存
          </h1>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            碎布架的鏡子 · 一塊布一列，同色號可多塊（不同批次/長度分開記）
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
            <RotateCw className={`mr-1 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            重新整理
          </Button>
          <Button size="sm" onClick={openNew}>
            <Plus className="mr-1 h-4 w-4" />
            登記裁剩
          </Button>
        </div>
      </div>

      {/* Summary + search */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs">
          <span className="text-[var(--text-secondary)]">在庫塊數 </span>
          <span className="font-mono font-semibold">{totalPieces}</span>
          <span className="mx-2 text-[var(--border)]">|</span>
          <span className="text-[var(--text-secondary)]">合計 </span>
          <span className="font-mono font-semibold">{fmtLen(totalYd)}</span>
          <span className="text-[var(--text-secondary)]"> 碼</span>
        </div>
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <Input
            className="pl-8"
            placeholder="搜尋色號、品名、供應商、位置…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* List grouped by 色號 */}
      {loading ? (
        <div className="py-16 text-center text-sm text-[var(--text-tertiary)]">載入中…</div>
      ) : groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] py-16 text-center text-sm text-[var(--text-tertiary)]">
          {search ? "沒有符合的裁剩" : "還沒有裁剩紀錄。師傅裁完布，點右上角「登記裁剩」加一塊。"}
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.code} className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]">
              {/* group header */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--bg-subtle)] px-4 py-2.5">
                <div className="min-w-0">
                  <span className="font-mono text-sm font-semibold text-[var(--accent)]">{g.code}</span>
                  <span className="ml-2 text-sm">{g.head?.productName}</span>
                  {g.head?.supplierName ? (
                    <span className="ml-2 text-xs text-[var(--text-tertiary)]">{g.head.supplierName}</span>
                  ) : null}
                </div>
                <div className="text-xs text-[var(--text-secondary)]">
                  共 <span className="font-mono font-semibold text-[var(--text-primary)]">{g.count}</span> 塊 · 合計{" "}
                  <span className="font-mono font-semibold text-[var(--text-primary)]">{fmtLen(g.total)}</span> 碼
                </div>
              </div>
              {/* pieces */}
              <div className="divide-y divide-[var(--border)]">
                {g.list.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${
                        r.pieceType === "整支"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                      }`}
                    >
                      {r.pieceType}
                    </span>
                    <span className="font-mono text-lg font-semibold tabular-nums">{fmtLen(r.lengthYd)}</span>
                    <span className="text-xs text-[var(--text-tertiary)]">碼</span>
                    <div className="min-w-0 flex-1 truncate text-xs text-[var(--text-secondary)]">
                      {r.location ? (
                        <span className="mr-3 inline-flex items-center gap-0.5">
                          <MapPin className="h-3 w-3" />
                          {r.location}
                        </span>
                      ) : null}
                      {r.source ? <span className="mr-3">來源：{r.source}</span> : null}
                      {r.receivedDate ? <span className="mr-3">進貨 {r.receivedDate}</span> : null}
                      {r.notes ? <span className="text-[var(--text-tertiary)]">· {r.notes}</span> : null}
                    </div>
                    <button
                      type="button"
                      title="修改（用掉就改長度）"
                      onClick={() => openEdit(r)}
                      className="shrink-0 text-[var(--text-tertiary)] transition-colors hover:text-blue-500"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      title="刪除（用完/建錯）"
                      onClick={() => setDeleteTarget(r)}
                      className="shrink-0 text-[var(--text-tertiary)] transition-colors hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[var(--radius-lg)] bg-[var(--bg-elevated)] p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">{form.id ? "修改裁剩" : "登記裁剩"}</h2>
              <button type="button" onClick={() => setModalOpen(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <Label>布料色號</Label>
                {form.id ? (
                  <div className="rounded-md bg-[var(--bg-subtle)] px-3 py-2 text-sm">
                    <span className="font-mono text-[var(--accent)]">{productById.get(form.productId)?.productCode}</span>{" "}
                    {productById.get(form.productId)?.productName}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Input
                      placeholder="搜尋色號、品名…"
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                    />
                    <Select value={form.productId} onValueChange={(v) => setForm((f) => ({ ...f, productId: v }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="選擇布料色號（自動帶供應商/系列）" />
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        {activeProducts.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.productCode} {p.productName} {p.specification}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>長度（碼）</Label>
                  <Input
                    type="number"
                    step="0.1"
                    inputMode="decimal"
                    placeholder="例 2.5"
                    value={form.lengthYd}
                    onChange={(e) => setForm((f) => ({ ...f, lengthYd: e.target.value }))}
                    autoFocus={!form.id}
                  />
                </div>
                <div>
                  <Label>類型</Label>
                  <Select
                    value={form.pieceType}
                    onValueChange={(v) => setForm((f) => ({ ...f, pieceType: v as FabricRemnantPieceType }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="裁剩">裁剩（碎布）</SelectItem>
                      <SelectItem value="整支">整支（完整未裁）</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>進貨日</Label>
                  <Input
                    type="date"
                    value={form.receivedDate}
                    onChange={(e) => setForm((f) => ({ ...f, receivedDate: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>擺放位置</Label>
                  <Input
                    placeholder="例 A架第3格"
                    value={form.location}
                    onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <Label>來源（選填）</Label>
                <Input
                  placeholder="哪張採購單 / 工單裁剩，例 S958、採購單 #P5570"
                  value={form.source}
                  onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
                />
              </div>

              <div>
                <Label>備註（選填）</Label>
                <Textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>

              {formError && <p className="text-sm text-red-600">{formError}</p>}

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={() => setModalOpen(false)} disabled={busy}>
                  取消
                </Button>
                <Button size="sm" onClick={() => void save()} disabled={busy}>
                  {busy ? "儲存中…" : form.id ? "儲存修改" : "登記入庫"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-[var(--radius-lg)] bg-[var(--bg-elevated)] p-5 shadow-xl">
            <h2 className="text-base font-semibold">刪除這塊裁剩？</h2>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              <span className="font-mono text-[var(--accent)]">{deleteTarget.productCode}</span>{" "}
              {deleteTarget.pieceType} <span className="font-mono">{fmtLen(deleteTarget.lengthYd)}</span> 碼
              {deleteTarget.location ? `（${deleteTarget.location}）` : ""}
              <br />
              用完或建錯就刪掉，之後清單不再顯示。
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)} disabled={busy}>
                取消
              </Button>
              <Button
                size="sm"
                className="bg-red-600 text-white hover:bg-red-700"
                onClick={() => void doDelete(deleteTarget)}
                disabled={busy}
              >
                {busy ? "刪除中…" : "確定刪除"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
