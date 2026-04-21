"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

const ERROR_MESSAGES: Record<string, string> = {
  missing_code: "登入流程異常,請重試",
  invalid_state: "驗證失敗,請重新登入",
  token_exchange_failed: "Google 授權失敗,請重試",
  unauthorized: "您的 Google 帳號未被授權,請聯繫管理員",
  bootstrap_failed: "初始化管理員失敗",
  disallowed_useragent: "請用 Safari 或 Chrome 開啟,LINE/FB 等內建瀏覽器無法登入 Google",
};

type EmbeddedBrowser = "line" | "fb" | "ig" | "messenger" | "wechat" | "other" | null;

function detectEmbeddedBrowser(): EmbeddedBrowser {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("line/")) return "line";
  if (ua.includes("fban") || ua.includes("fbav")) return "fb";
  if (ua.includes("instagram")) return "ig";
  if (ua.includes("messenger")) return "messenger";
  if (ua.includes("micromessenger")) return "wechat";
  // Generic WebView heuristic: mobile + no common browser id
  const isMobile = /iphone|ipad|ipod|android/.test(ua);
  const hasStandardBrowser =
    ua.includes("safari") || ua.includes("chrome") || ua.includes("firefox") || ua.includes("edg");
  if (isMobile && !hasStandardBrowser) return "other";
  return null;
}

function LoginContent() {
  const searchParams = useSearchParams();
  const errorCode = searchParams.get("error") ?? "";
  const returnTo = searchParams.get("returnTo") ?? "/";
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] ?? `登入失敗: ${errorCode}` : null;

  const [embedded, setEmbedded] = useState<EmbeddedBrowser>(null);
  const [currentUrl, setCurrentUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setEmbedded(detectEmbeddedBrowser());
    setCurrentUrl(window.location.href);
  }, []);

  const loginUrl = `/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`;

  async function handleCopyUrl() {
    try {
      await navigator.clipboard.writeText(currentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  // LINE supports ?openExternalBrowser=1 to force external browser
  const lineExternalUrl = embedded === "line"
    ? `${currentUrl}${currentUrl.includes("?") ? "&" : "?"}openExternalBrowser=1`
    : "";

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-subtle)] p-4">
      <div className="w-full max-w-md rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-elevated)] p-8 shadow-[var(--shadow-lg)]">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">
            馬鈴薯沙發
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            報價系統登入
          </p>
        </div>

        {errorMessage && (
          <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        {embedded && (
          <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-900">
            <div className="mb-2 font-semibold">
              ⚠️ 請改用 Safari 或 Chrome 開啟
            </div>
            <p className="mb-2 text-xs leading-relaxed">
              您目前在
              {embedded === "line"
                ? " LINE"
                : embedded === "fb" || embedded === "messenger"
                  ? " Facebook/Messenger"
                  : embedded === "ig"
                    ? " Instagram"
                    : embedded === "wechat"
                      ? " 微信"
                      : ""}
              {" 內建瀏覽器中,Google 基於安全政策會拒絕在這裡登入。"}
            </p>
            {embedded === "line" && lineExternalUrl && (
              <a
                href={lineExternalUrl}
                className="mb-2 block w-full rounded-md bg-amber-600 px-3 py-2 text-center text-sm font-medium text-white hover:bg-amber-700"
              >
                以外部瀏覽器開啟
              </a>
            )}
            <button
              type="button"
              onClick={() => void handleCopyUrl()}
              className="w-full rounded-md border border-amber-400 bg-white px-3 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100"
            >
              {copied ? "✓ 已複製網址" : "複製網址到 Safari/Chrome 開啟"}
            </button>
            <p className="mt-2 text-[11px] text-amber-800">
              複製後請開啟 Safari 或 Chrome,貼上網址再登入。
            </p>
          </div>
        )}

        <a
          href={loginUrl}
          className={[
            "flex w-full items-center justify-center gap-3 rounded-md border border-[var(--border)] bg-white px-4 py-3 text-sm font-medium text-[var(--text-primary)] shadow-sm transition-colors",
            embedded ? "pointer-events-none opacity-50" : "hover:bg-[var(--bg-subtle)]",
          ].join(" ")}
          aria-disabled={embedded !== null}
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          使用 Google 登入
        </a>

        <p className="mt-6 text-center text-xs text-[var(--text-tertiary)]">
          僅限授權使用者登入。如需新增使用者請聯繫管理員。
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm">載入中...</div>}>
      <LoginContent />
    </Suspense>
  );
}
