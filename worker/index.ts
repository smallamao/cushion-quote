/// <reference lib="webworker" />

/**
 * 自訂 service worker：只負責「收推播、點通知」。
 *
 * 🔴 不要改 public/sw.js——那是 @ducanh2912/next-pwa 建置時產生的，改了會被蓋掉。
 * 這支檔案會被套件編譯成 public/worker-<hash>.js 並 importScripts 進 sw.js
 * （解析規則：customWorkerSrc 目錄下的 index.ts 或 index.js，預設目錄就是 worker/）。
 *
 * 本檔不吃主 tsconfig（已於 exclude 排除），型別走 worker/tsconfig.json 的 webworker lib。
 */
declare const self: ServiceWorkerGlobalScope;

export {};

interface PushPayload {
  title?: string;
  body?: string;
  link?: string;
  tag?: string;
}

self.addEventListener("push", (event: PushEvent) => {
  if (!event.data) return;

  let data: PushPayload = {};
  try {
    data = event.data.json() as PushPayload;
  } catch {
    // 不是 JSON 就當純文字內容，至少讓通知還是跳得出來
    data = { body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "馬鈴薯沙發", {
      body: data.body ?? "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      // 同 tag 會互相取代：同一筆訂單連續更新不要洗出一排通知
      tag: data.tag || undefined,
      data: { link: data.link || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const link = (event.notification.data as { link?: string } | undefined)?.link ?? "/";

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // 已經有開著的視窗就帶它過去，不要每點一次就開一個新分頁
      for (const client of windows) {
        await client.focus();
        try {
          await client.navigate(link);
        } catch {
          /* 跨來源或已關閉時 navigate 會失敗，聚焦到視窗就夠了 */
        }
        return;
      }
      await self.clients.openWindow(link);
    })(),
  );
});
