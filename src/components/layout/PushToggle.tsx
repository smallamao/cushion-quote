"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, Loader2 } from "lucide-react";

/**
 * 「開啟手機推播」開關，掛在通知面板底部。
 *
 * 每個瀏覽器／裝置要各自訂閱一次（手機一次、電腦一次），因為推播是綁在
 * 瀏覽器產生的 endpoint 上，不是綁帳號。伺服器端存成多筆，送的時候全部送。
 *
 * iOS 限制：Safari 只有在「已加入主畫面」的 standalone 模式才給 PushManager，
 * 純瀏覽器開啟時下面的能力偵測會是 false——這不是壞掉，要引導使用者先安裝。
 */
const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

// 回傳型別要綁死 ArrayBuffer：applicationServerKey 只收 ArrayBufferView<ArrayBuffer>，
// 預設的 Uint8Array<ArrayBufferLike> 會因為可能是 SharedArrayBuffer 而被拒絕。
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

/** 給人看的裝置名稱，之後在訂閱清單上才分得出是哪一台。 */
function deviceLabel(): string {
  if (typeof navigator === "undefined") return "未知裝置";
  const ua = navigator.userAgent;
  const os = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Macintosh/.test(ua)
          ? "Mac"
          : /Windows/.test(ua)
            ? "Windows"
            : "其他";
  // 判斷順序有講究：Chrome 的 UA 也含 Safari，Edge 也含 Chrome
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "瀏覽器";
  return `${os} · ${browser}`;
}

type State = "checking" | "unsupported" | "needs-install" | "off" | "on" | "denied";

export function PushToggle() {
  const [state, setState] = useState<State>("checking");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const refresh = useCallback(async () => {
    if (typeof window === "undefined") return;
    const hasSW = "serviceWorker" in navigator;
    const hasPush = "PushManager" in window;
    const hasNotif = "Notification" in window;

    if (!hasSW || !hasPush || !hasNotif) {
      // iOS 要加到主畫面才給這些 API；其他平台則是真的不支援
      const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
      setState(isIOS ? "needs-install" : "unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    } catch {
      setState("off");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function enable() {
    setBusy(true);
    setMsg("");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
        }));

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON(), label: deviceLabel() }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) {
        setMsg(json.error ?? "訂閱失敗");
        return;
      }
      setState("on");
      setMsg("已開啟，這台裝置會收到推播");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "開啟失敗");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMsg("");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("off");
      setMsg("已關閉這台裝置的推播");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "關閉失敗");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test" }),
      });
      const json = (await res.json()) as { ok: boolean; sent?: number; error?: string };
      setMsg(json.ok ? `已送出到 ${json.sent ?? 0} 台裝置` : (json.error ?? "測試失敗"));
    } catch {
      setMsg("測試失敗");
    } finally {
      setBusy(false);
    }
  }

  if (state === "checking") return null;

  return (
    <div className="border-t border-[var(--border)] px-4 py-3">
      {state === "unsupported" && (
        <p className="text-[11px] text-[var(--text-tertiary)]">這個瀏覽器不支援推播通知。</p>
      )}

      {state === "needs-install" && (
        <p className="text-[11px] leading-relaxed text-[var(--text-tertiary)]">
          iPhone 要先把系統「加入主畫面」，再從主畫面的圖示開啟，才能開啟推播。
        </p>
      )}

      {state === "denied" && (
        <p className="text-[11px] leading-relaxed text-[var(--text-tertiary)]">
          通知權限已被封鎖，請到瀏覽器的網站設定改回「允許」再回來開啟。
        </p>
      )}

      {(state === "off" || state === "on") && (
        <div className="flex items-center gap-2">
          <BellRing className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" />
          <span className="text-[11px] text-[var(--text-secondary)]">
            {state === "on" ? "這台裝置已開啟推播" : "開啟後手機／電腦會跳通知"}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            {state === "on" && (
              <button
                type="button"
                onClick={() => void test()}
                disabled={busy}
                className="rounded-md border border-[var(--border)] px-2 py-1 text-[11px] hover:bg-[var(--bg-subtle)] disabled:opacity-50"
              >
                測試
              </button>
            )}
            <button
              type="button"
              onClick={() => void (state === "on" ? disable() : enable())}
              disabled={busy}
              className={
                state === "on"
                  ? "rounded-md border border-[var(--border)] px-2 py-1 text-[11px] hover:bg-[var(--bg-subtle)] disabled:opacity-50"
                  : "rounded-md bg-[var(--accent)] px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-50"
              }
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : state === "on" ? "關閉" : "開啟通知"}
            </button>
          </div>
        </div>
      )}

      {msg && <p className="mt-2 text-[11px] text-[var(--text-tertiary)]">{msg}</p>}
    </div>
  );
}
