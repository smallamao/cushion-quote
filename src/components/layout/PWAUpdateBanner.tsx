"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

export function PWAUpdateBanner() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    async function checkRegistration() {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return;

      if (reg.waiting) {
        setWaiting(reg.waiting);
      }

      reg.addEventListener("updatefound", () => {
        const newSW = reg.installing;
        if (!newSW) return;
        newSW.addEventListener("statechange", () => {
          if (newSW.state === "installed" && navigator.serviceWorker.controller) {
            setWaiting(newSW);
          }
        });
      });
    }

    void checkRegistration();

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      window.location.reload();
    });
  }, []);

  function handleUpdate() {
    if (!waiting) return;
    waiting.postMessage({ type: "SKIP_WAITING" });
  }

  if (!waiting) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-[9999] flex -translate-x-1/2 items-center gap-3 rounded-xl bg-[var(--text-primary)] px-4 py-3 shadow-xl">
      <RefreshCw className="h-4 w-4 shrink-0 text-white" />
      <span className="text-sm text-white">系統已更新</span>
      <button
        onClick={handleUpdate}
        className="rounded-lg bg-white px-3 py-1 text-sm font-medium text-[var(--text-primary)] hover:bg-gray-100"
      >
        點此重新載入
      </button>
    </div>
  );
}
