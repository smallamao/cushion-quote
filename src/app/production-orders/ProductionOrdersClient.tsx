"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, RefreshCw } from "lucide-react";

import { CraftsmanTabBar } from "@/components/layout/CraftsmanTabBar";
import { ProductionOrderDetail } from "@/app/production-orders/ProductionOrderDetail";
import { ProductionListSkeleton, ProductionOrderList } from "@/app/production-orders/ProductionOrderList";
import { CompleteConfirmSheet, ImageLightbox } from "@/app/production-orders/ProductionSheets";
import type { ProductionOrderView, ProductionSettableStatus } from "@/lib/production-orders";
import { taipeiDateStr } from "@/lib/production-groups";

// 工廠師傅的生產訂單。資料來自 /api/sheets/production-orders 的白名單投影：
// 沒有客戶姓名、訂單標題、地址電話、金額——畫面也就不會有。
//
// 清單 → 詳細頁用網址 ?order=<orderId> 切換，手機的「返回」手勢回得到清單，
// 也能把某一張單的網址傳給同事。

export function ProductionOrdersClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("order");

  const [orders, setOrders] = useState<ProductionOrderView[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<ProductionSettableStatus | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [viewingPdf, setViewingPdf] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  // 台灣日期；跨午夜不重新整理也會在下次載入時更新
  const [today, setToday] = useState(() => taipeiDateStr());

  // 從清單點進來的才用 router.back()；直接開網址進來的沒有上一頁可回
  const openedFromList = useRef(false);
  const listScrollY = useRef(0);

  const load = useCallback(async () => {
    setLoading(true);
    setToday(taipeiDateStr());
    try {
      const res = await fetch("/api/sheets/production-orders", { cache: "no-store" });
      const json = (await res.json()) as { ok: boolean; orders?: ProductionOrderView[]; error?: string };
      if (!json.ok) {
        setError(json.error ?? "載入失敗");
        return;
      }
      setError(null);
      setOrders(json.orders ?? []);
      setLoaded(true);
    } catch {
      setError("載入失敗，請檢查網路");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // 換頁（清單 ↔ 詳細）時收掉浮層與錯誤訊息；回到清單時捲回原本的位置
  useEffect(() => {
    setConfirmOpen(false);
    setLightboxUrl(null);
    setActionError(null);
    if (selectedId) {
      window.scrollTo(0, 0);
    } else if (listScrollY.current) {
      const y = listScrollY.current;
      requestAnimationFrame(() => window.scrollTo(0, y));
    }
  }, [selectedId]);

  function openOrder(order: ProductionOrderView) {
    listScrollY.current = window.scrollY;
    openedFromList.current = true;
    router.push(`/production-orders?order=${encodeURIComponent(order.orderId)}`, { scroll: false });
  }

  function backToList() {
    if (openedFromList.current) {
      openedFromList.current = false;
      router.back();
    } else {
      router.replace("/production-orders", { scroll: false });
    }
  }

  async function setStatus(order: ProductionOrderView, status: ProductionSettableStatus) {
    setSaving(status);
    setActionError(null);
    try {
      const res = await fetch(`/api/sheets/production-orders/${encodeURIComponent(order.orderId)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = (await res.json()) as { ok: boolean; order?: ProductionOrderView; error?: string };
      if (!json.ok || !json.order) throw new Error(json.error ?? `伺服器錯誤 ${res.status}`);
      const updated = json.order;
      setOrders((prev) => prev.map((o) => (o.orderId === updated.orderId ? updated : o)));
      setConfirmOpen(false);
    } catch (err) {
      setConfirmOpen(false);
      setActionError(err instanceof Error ? `更新失敗：${err.message}` : "更新失敗");
    } finally {
      setSaving(null);
    }
  }

  // 同「我的行程」：先抓成 blob 再開，iOS 才不會直接下載檔案
  async function openWorkOrderPdf(order: ProductionOrderView) {
    if (!order.workOrderPdfUrl) return;
    setViewingPdf(true);
    setActionError(null);
    try {
      const res = await fetch(order.workOrderPdfUrl);
      if (!res.ok) throw new Error("讀取工單失敗");
      const buf = await res.arrayBuffer();
      const url = URL.createObjectURL(new Blob([buf], { type: "application/pdf" }));
      window.open(url, "_blank");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "讀取工單失敗");
    } finally {
      setViewingPdf(false);
    }
  }

  const activeCount = orders.filter((o) => o.status !== "completed").length;
  const selected = selectedId ? orders.find((o) => o.orderId === selectedId) ?? null : null;

  const errorBanner = error && (
    <button
      type="button"
      onClick={() => void load()}
      disabled={loading}
      className="mb-4 flex w-full items-center gap-2.5 rounded-[var(--radius-md)] border border-[var(--error)] bg-[var(--error-light)] p-3 text-left text-[19px] font-bold text-[var(--error)]"
    >
      <AlertTriangle className="h-6 w-6 shrink-0" aria-hidden />
      <span className="flex-1">{error}，點這裡重試</span>
      <RefreshCw className={`h-5 w-5 shrink-0 ${loading ? "animate-spin" : ""}`} aria-hidden />
    </button>
  );

  const actionBanner = actionError && (
    <div
      role="alert"
      className="mb-4 flex items-start gap-2.5 rounded-[var(--radius-md)] border border-[var(--error)] bg-[var(--error-light)] p-3 text-[19px] font-bold text-[var(--error)]"
    >
      <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0" aria-hidden />
      <span>{actionError}</span>
    </div>
  );

  // ── 詳細頁 ──────────────────────────────────────────────────────────────
  if (selectedId) {
    return (
      <div className="mx-auto max-w-lg">
        {errorBanner}
        {actionBanner}
        {selected ? (
          <ProductionOrderDetail
            order={selected}
            today={today}
            saving={saving}
            viewingPdf={viewingPdf}
            onBack={backToList}
            onSetProduction={() => void setStatus(selected, "production")}
            onRequestComplete={() => setConfirmOpen(true)}
            onOpenPdf={() => void openWorkOrderPdf(selected)}
            onViewImage={setLightboxUrl}
          />
        ) : !loaded ? (
          loading ? <ProductionListSkeleton /> : null
        ) : (
          // 已完成超過 7 天、被取消或網址打錯：清單上已經沒有這張
          <div className="flex flex-col items-center gap-4 py-14 text-center">
            <div className="text-[22px] font-bold">找不到這張單</div>
            <div className="text-[17px] text-[var(--text-secondary)]">可能已完成超過 7 天，或已不在生產清單上</div>
            <button
              type="button"
              onClick={backToList}
              className="flex h-14 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-5 text-[19px] font-bold"
            >
              <ArrowLeft className="h-5 w-5" />
              回清單
            </button>
          </div>
        )}
        {confirmOpen && selected && (
          <CompleteConfirmSheet
            orderNumber={selected.orderNumber || selected.orderId}
            itemCategory={selected.itemCategory}
            saving={saving === "completed"}
            onConfirm={() => void setStatus(selected, "completed")}
            onCancel={() => setConfirmOpen(false)}
          />
        )}
        {lightboxUrl && <ImageLightbox url={lightboxUrl} alt="照片" onClose={() => setLightboxUrl(null)} />}
      </div>
    );
  }

  // ── 清單 ────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-lg">
      <CraftsmanTabBar active="production" productionCount={loaded ? activeCount : undefined} />
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-black leading-tight">生產訂單</h1>
          <p className="mt-0.5 text-[17px] font-medium text-[var(--text-secondary)]">
            {loaded ? `待製作 ${activeCount} 張` : "載入中…"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          aria-label="重新整理"
          className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--text-primary)] disabled:opacity-60"
        >
          <RefreshCw className={`h-6 w-6 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {errorBanner}
      {actionBanner}
      {!loaded ? (
        loading ? <ProductionListSkeleton /> : null
      ) : (
        <ProductionOrderList orders={orders} today={today} onOpen={openOrder} />
      )}
    </div>
  );
}
