"use client";

import { useRef, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, MapPin, Phone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAfterSales } from "@/hooks/useAfterSales";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import type { AfterSalesService } from "@/lib/types";
import { buildMapsUrl, groupByDate, sortDateGroups } from "@/lib/schedule-utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface CompletionState {
  serviceId: string;
  notes: string;
  photos: string[];
  uploading: boolean;
  saving: boolean;
}

interface ServiceCardProps {
  service: AfterSalesService;
  stationNumber: number;
  isFirst: boolean;
  isLast: boolean;
  isAdmin: boolean;
  startingId: string | null;
  onStart: (id: string) => void;
  onComplete: (id: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDateLabel(date: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  if (date === today) return `今天 ${date}`;
  if (date === tomorrow) return `明天 ${date}`;
  return date;
}

// ─── ServiceCard component ────────────────────────────────────────────────────

function ServiceCard({
  service,
  stationNumber,
  isFirst,
  isLast,
  isAdmin,
  startingId,
  onStart,
  onComplete,
  onMoveUp,
  onMoveDown,
}: ServiceCardProps) {
  const {
    serviceId,
    clientName,
    clientPhone,
    deliveryAddress,
    modelNameSnapshot,
    issueDescription,
    issueCategories,
    dispatchNotes,
    status,
    completedDate,
  } = service;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4 shadow-sm space-y-3">
      {/* Station badge + client name + phone + reorder arrows */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex-shrink-0 w-7 h-7 rounded-full bg-orange-100 text-orange-700 text-sm font-bold flex items-center justify-center">
            {stationNumber}
          </span>
          <span className="font-semibold text-[var(--text-primary)]">{clientName}</span>
        </div>
        <div className="flex items-center gap-1">
          {clientPhone && (
            <a
              href={`tel:${clientPhone}`}
              className="flex items-center gap-1 text-[var(--accent)] text-sm"
            >
              <Phone size={14} />
              {clientPhone}
            </a>
          )}
          {isAdmin && (
            <div className="flex flex-col ml-2">
              <button
                disabled={isFirst}
                onClick={onMoveUp}
                className="text-[var(--text-secondary)] disabled:opacity-30 hover:text-[var(--text-primary)] p-0.5"
                aria-label="上移"
              >
                <ChevronUp size={16} />
              </button>
              <button
                disabled={isLast}
                onClick={onMoveDown}
                className="text-[var(--text-secondary)] disabled:opacity-30 hover:text-[var(--text-primary)] p-0.5"
                aria-label="下移"
              >
                <ChevronDown size={16} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Address */}
      {deliveryAddress && (
        <a
          href={`https://www.google.com/maps/search/${encodeURIComponent(deliveryAddress)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-start gap-1 text-sm text-[var(--text-secondary)] hover:underline"
        >
          <MapPin size={14} className="mt-0.5 shrink-0" />
          <span>{deliveryAddress}</span>
        </a>
      )}

      {/* Model name */}
      {modelNameSnapshot && (
        <p className="text-sm text-[var(--text-secondary)]">{modelNameSnapshot}</p>
      )}

      {/* Issue description */}
      {issueDescription && (
        <p className="text-sm text-[var(--text-primary)] line-clamp-3">{issueDescription}</p>
      )}

      {/* Issue category chips */}
      {issueCategories && issueCategories.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {issueCategories.map((cat) => (
            <span
              key={cat}
              className="bg-orange-100 text-orange-700 rounded-full px-2 py-0.5 text-[10px]"
            >
              {cat}
            </span>
          ))}
        </div>
      )}

      {/* Dispatch notes */}
      {dispatchNotes && (
        <div className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700">
          {dispatchNotes}
        </div>
      )}

      {/* Action area */}
      <div className="flex items-center gap-2 pt-1">
        {status === "scheduled" && (
          <Button
            variant="outline"
            size="sm"
            disabled={startingId === serviceId}
            onClick={() => onStart(serviceId)}
          >
            {startingId === serviceId ? (
              <Loader2 size={14} className="animate-spin mr-1" />
            ) : null}
            開始維修
          </Button>
        )}

        {(status === "scheduled" || status === "in_progress") && (
          <Button size="sm" onClick={() => onComplete(serviceId)}>
            完成維修
          </Button>
        )}

        {status === "completed" && (
          <span className="flex items-center gap-1 text-sm text-green-600 font-medium">
            ✓ 已完成
            {completedDate && (
              <span className="text-[var(--text-secondary)] font-normal">（{completedDate}）</span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function MyScheduleClient() {
  const { services, loading, error, reload } = useAfterSales();
  const { user, loading: userLoading } = useCurrentUser();

  const [completion, setCompletion] = useState<CompletionState | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const myName = user?.displayName ?? "";
  const isAdmin = user?.role === "admin";

  // ── Derived data ──────────────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);

  // Admin sees all dispatched orders; technician sees only their own.
  // Only show today and future — past dates are hidden.
  const myServices = services.filter((s) =>
    s.status !== "cancelled" &&
    s.scheduledDate >= today &&
    (isAdmin || s.assignedTo === myName),
  );
  const dateGroups = sortDateGroups(groupByDate(myServices));

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleStart = (serviceId: string) => {
    setStartingId(serviceId);
    void (async () => {
      try {
        const res = await fetch(`/api/sheets/after-sales/${serviceId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "in_progress" }),
        });
        if (!res.ok) throw new Error(`伺服器錯誤 ${res.status}`);
        reload();
      } finally {
        setStartingId(null);
      }
    })();
  };

  const handleOpenCompletion = (serviceId: string) => {
    setCompletion({ serviceId, notes: "", photos: [], uploading: false, saving: false });
  };

  const handleCloseCompletion = () => {
    if (completion?.saving) return;
    setCompletion(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    // Reset input so the same file can be re-selected
    e.target.value = "";

    void (async () => {
      setCompletion((prev) => (prev ? { ...prev, uploading: true } : prev));
      try {
        // Upload sequentially to avoid race on state
        for (const file of files) {
          const form = new FormData();
          form.append("file", file);
          try {
            const res = await fetch("/api/upload", { method: "POST", body: form });
            const json = (await res.json()) as { ok: boolean; url?: string };
            if (json.ok && json.url) {
              setCompletion((prev) =>
                prev ? { ...prev, photos: [...prev.photos, json.url!] } : prev,
              );
            }
          } catch {
            // silently continue with remaining files
          }
        }
      } finally {
        setCompletion((prev) => (prev ? { ...prev, uploading: false } : prev));
      }
    })();
  };

  const handleConfirmCompletion = () => {
    if (!completion) return;
    const { serviceId, notes, photos } = completion;
    const today = new Date().toISOString().slice(0, 10);
    setCompletion((prev) => (prev ? { ...prev, saving: true } : prev));
    void (async () => {
      try {
        const res = await fetch(`/api/sheets/after-sales/${serviceId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "completed",
            completionNotes: notes,
            completionPhotos: photos,
            completedDate: today,
          }),
        });
        if (!res.ok) throw new Error(`伺服器錯誤 ${res.status}`);
        setCompletion(null);
        reload();
      } catch {
        setCompletion((prev) => (prev ? { ...prev, saving: false } : prev));
      }
    })();
  };

  const handleReorder = (
    groupItems: AfterSalesService[],
    index: number,
    direction: "up" | "down",
  ) => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= groupItems.length) return;

    // Auto-assign sequential dispatchOrder for items that have none yet
    const itemsWithOrder = groupItems.map((s, i) => ({
      ...s,
      dispatchOrder: s.dispatchOrder ?? i + 1,
    }));

    const itemA = itemsWithOrder[index];
    const itemB = itemsWithOrder[targetIndex];

    void (async () => {
      await Promise.all([
        fetch(`/api/sheets/after-sales/${itemA.serviceId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dispatchOrder: itemB.dispatchOrder }),
        }),
        fetch(`/api/sheets/after-sales/${itemB.serviceId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dispatchOrder: itemA.dispatchOrder }),
        }),
      ]);
      reload();
    })();
  };

  // ── Loading / error / empty ───────────────────────────────────────────────

  if (loading || userLoading || (!isAdmin && !myName)) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-[var(--text-secondary)]" size={32} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 text-red-500 text-sm px-4">
        {error}
      </div>
    );
  }

  const completingService = completion
    ? (services.find((s) => s.serviceId === completion.serviceId) ?? null)
    : null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
      <h1 className="text-xl font-bold text-[var(--text-primary)]">我的行程</h1>

      {dateGroups.length === 0 ? (
        <p className="text-[var(--text-secondary)] text-sm">目前沒有派工給您的行程</p>
      ) : (
        dateGroups.map((group) => {
          // Sort by dispatchOrder ascending; items with no order go last
          const sortedItems = [...group.items].sort((a, b) => {
            if (a.dispatchOrder == null && b.dispatchOrder == null) return 0;
            if (a.dispatchOrder == null) return 1;
            if (b.dispatchOrder == null) return -1;
            return a.dispatchOrder - b.dispatchOrder;
          });

          const addressesWithValue = sortedItems
            .map((s) => s.deliveryAddress)
            .filter((a): a is string => Boolean(a));
          const showRouteLink = addressesWithValue.length > 1;

          return (
            <section key={group.date} className="space-y-3">
              {/* Date header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[var(--text-primary)]">
                    {formatDateLabel(group.date)}
                  </span>
                  <span className="text-xs text-[var(--text-secondary)]">
                    {sortedItems.length} 個工單
                  </span>
                </div>
                {showRouteLink && (
                  <a
                    href={buildMapsUrl(addressesWithValue)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[var(--accent)] hover:underline"
                  >
                    查看路線
                  </a>
                )}
              </div>

              {/* Service cards */}
              {sortedItems.map((service, idx) => (
                <ServiceCard
                  key={service.serviceId}
                  service={service}
                  stationNumber={idx + 1}
                  isFirst={idx === 0}
                  isLast={idx === sortedItems.length - 1}
                  isAdmin={isAdmin}
                  startingId={startingId}
                  onStart={handleStart}
                  onComplete={handleOpenCompletion}
                  onMoveUp={() => handleReorder(sortedItems, idx, "up")}
                  onMoveDown={() => handleReorder(sortedItems, idx, "down")}
                />
              ))}
            </section>
          );
        })
      )}

      {/* Completion modal (bottom-sheet) */}
      {completion && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
          onClick={handleCloseCompletion}
        >
          <div
            className="w-full max-w-lg rounded-t-2xl bg-white p-5 space-y-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-[var(--text-primary)]">
                完成維修 — {completingService?.clientName ?? ""}
              </h2>
            </div>

            {/* Notes */}
            <Textarea
              placeholder="完工備註（選填）"
              rows={4}
              value={completion.notes}
              onChange={(e) =>
                setCompletion((prev) => (prev ? { ...prev, notes: e.target.value } : prev))
              }
              disabled={completion.saving}
            />

            {/* Photo thumbnails */}
            {completion.photos.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {completion.photos.map((url) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={url}
                    src={url}
                    alt="完工照片"
                    className="h-16 w-16 rounded object-cover border border-[var(--border)]"
                  />
                ))}
              </div>
            )}

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              capture="environment"
              className="hidden"
              onChange={handleFileChange}
            />

            {/* Upload button */}
            <Button
              variant="outline"
              size="sm"
              disabled={completion.uploading || completion.saving}
              onClick={() => fileInputRef.current?.click()}
            >
              {completion.uploading ? (
                <Loader2 size={14} className="animate-spin mr-1" />
              ) : null}
              拍照 / 選擇照片
            </Button>

            {/* Action buttons */}
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                className="flex-1"
                disabled={completion.saving}
                onClick={handleCloseCompletion}
              >
                取消
              </Button>
              <Button
                className="flex-1"
                disabled={completion.uploading || completion.saving}
                onClick={handleConfirmCompletion}
              >
                {completion.saving ? (
                  <Loader2 size={14} className="animate-spin mr-1" />
                ) : null}
                確認完工
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
