"use client";

import { useMemo, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  REWORK_CAUSES,
  REWORK_FOUND_AT,
  REWORK_SYMPTOMS,
  newReworkId,
} from "@/lib/order-rework";
import type { CustomOrder, OrderRework, ReworkCause, ReworkFoundAt, ReworkSymptom } from "@/lib/types";

/**
 * 記一筆「這張單做錯了」。
 *
 * 🔴 三下點完就能送出，是這個表單唯一的設計目標。
 *    老闆說「人工太常出錯了」，但他不會為了記錄錯誤再多花五分鐘打字——
 *    同一個系統裡十一個要人主動填的欄位，填寫率全部在 12% 以下。
 *    所以：症狀、何時發現各點一下，歸因可以先不點，補充欄選填。
 *
 * 🔴 為什麼保留補充文字欄：老闆問「不需要文字補充嗎？！」——他是對的。
 *    選項給得出「尺寸錯了幾次」，但給不出「背墊做成 40 高」。
 *    統計防不了重複發生，具體那句話可以。
 */

interface Props {
  order: CustomOrder | null;
  onClose: () => void;
  /** 回傳整個新的 reworks 陣列；由呼叫端負責存檔與樂觀更新 */
  onSave: (order: CustomOrder, reworks: OrderRework[]) => Promise<void>;
}

const chip = (active: boolean) =>
  `rounded-full border px-3 py-1.5 text-xs transition-colors ${
    active
      ? "border-[var(--accent)] bg-[var(--accent)] text-white"
      : "border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
  }`;

export function ReworkDialog({ order, onClose, onSave }: Props) {
  const [itemId, setItemId] = useState("");
  const [symptom, setSymptom] = useState<ReworkSymptom | "">("");
  const [cause, setCause] = useState<ReworkCause | "">("");
  const [foundAt, setFoundAt] = useState<ReworkFoundAt | "">("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  // 標題列（itemType === "header"）是分隔用的，不是真的品項，不給選
  const items = useMemo(
    () => (order?.items ?? []).filter((i) => i.itemType !== "header" && i.name.trim()),
    [order],
  );
  const existing = order?.reworks ?? [];

  function reset() {
    setItemId("");
    setSymptom("");
    setCause("");
    setFoundAt("");
    setNote("");
  }

  async function handleSubmit() {
    if (!order || !symptom || !foundAt) return;
    const picked = items.find((i) => i.id === itemId);
    const entry: OrderRework = {
      id: newReworkId(),
      at: new Date().toISOString(),
      itemId,
      itemName: picked?.name ?? "",
      symptom,
      cause,
      foundAt,
      note: note.trim(),
      recordedBy: "", // 由 API 以登入身分補上，前端不自己填（比照 createdBy 的教訓）
    };
    setSaving(true);
    try {
      await onSave(order, [...existing, entry]);
      reset();
      onClose();
    } catch {
      // 存檔失敗時呼叫端已經跳過錯誤訊息並回滾；這裡維持視窗開著、資料留著，
      // 讓老闆可以直接按第二次，不用把剛才點的三下重點一遍
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(id: string) {
    if (!order) return;
    setRemoving(id);
    try {
      await onSave(order, existing.filter((r) => r.id !== id));
    } catch {
      // 同上：錯誤訊息與回滾都在呼叫端
    } finally {
      setRemoving(null);
    }
  }

  return (
    <Dialog open={!!order} onOpenChange={(o) => { if (!o && !saving) { reset(); onClose(); } }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>記一筆重做</DialogTitle>
          <DialogDescription>
            {order?.clientName}　{order?.orderNumber || order?.orderId}
            {order?.orderTitle ? `　${order.orderTitle}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-6 py-4">
          {existing.length > 0 && (
            <div className="rounded border border-[var(--border)] bg-[var(--bg-subtle,transparent)] p-2">
              <div className="mb-1 text-xs font-medium text-[var(--text-secondary)]">
                這張單已記錄 {existing.length} 筆
              </div>
              <ul className="space-y-1">
                {existing.map((r) => (
                  <li key={r.id} className="flex items-start gap-2 text-xs">
                    <span className="flex-1">
                      {r.at.slice(0, 10)}　{r.itemName || "整張單"}　{r.symptom}
                      {r.cause ? ` ← ${r.cause}` : "　← 根因未查"}
                      {r.note && <span className="text-[var(--text-secondary)]">　{r.note}</span>}
                    </span>
                    <button
                      type="button"
                      title="刪掉這筆（記錯時用）"
                      disabled={removing === r.id}
                      onClick={() => void handleRemove(r.id)}
                      className="shrink-0 text-[var(--text-tertiary)] hover:text-red-500"
                    >
                      {removing === r.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <div className="mb-1.5 text-xs font-medium">哪個品項？</div>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" className={chip(itemId === "")} onClick={() => setItemId("")}>
                整張單
              </button>
              {items.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  className={chip(itemId === i.id)}
                  onClick={() => setItemId(i.id)}
                  title={i.dimensions}
                >
                  {i.name}
                </button>
              ))}
            </div>
            {items.length === 0 && (
              <div className="mt-1 text-xs text-[var(--text-tertiary)]">
                這張單沒有品項明細，會記成整張單
              </div>
            )}
          </div>

          <div>
            <div className="mb-1.5 text-xs font-medium">
              症狀 <span className="text-red-500">*</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {REWORK_SYMPTOMS.map((s) => (
                <button key={s} type="button" className={chip(symptom === s)} onClick={() => setSymptom(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-xs font-medium">
              哪一關出錯
              <span className="ml-1 font-normal text-[var(--text-tertiary)]">
                現在不知道就先跳過，查到再回來補
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {REWORK_CAUSES.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={chip(cause === c)}
                  onClick={() => setCause(cause === c ? "" : c)}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-xs font-medium">
              何時發現 <span className="text-red-500">*</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {REWORK_FOUND_AT.map((f) => (
                <button key={f} type="button" className={chip(foundAt === f)} onClick={() => setFoundAt(f)}>
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-xs font-medium">
              補充 <span className="font-normal text-[var(--text-tertiary)]">選填</span>
            </div>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="例：背墊做成 40 高，圖面寫 35"
              className="text-sm"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => { reset(); onClose(); }} disabled={saving}>
            取消
          </Button>
          <Button size="sm" onClick={() => void handleSubmit()} disabled={saving || !symptom || !foundAt}>
            {saving && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            記錄
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
