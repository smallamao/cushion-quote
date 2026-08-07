"use client";

import { useEffect, useState } from "react";

import { SignaturePad } from "@/components/sign/SignaturePad";
import type { PublicSigningView } from "@/lib/signing-types";

function mapError(code: string): string {
  switch (code) {
    case "expired":
      return "此連結已過期，請聯絡馬鈴薯沙發重新產生。";
    case "not_pending":
      return "此報價單已完成簽署或連結已失效。";
    case "invalid_signature":
      return "簽名內容無效，請重新簽名。";
    default:
      return "簽署失敗，請稍後再試或聯絡馬鈴薯沙發。";
  }
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-3xl px-4 py-3 text-sm font-semibold text-gray-800">
          馬鈴薯沙發 · 報價單線上簽署
        </div>
      </div>
      <div className="mx-auto max-w-3xl px-4 py-6">{children}</div>
    </div>
  );
}

function Notice({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
      <p className="text-lg font-semibold text-gray-800">{title}</p>
      <p className="mt-2 text-sm text-gray-500">{desc}</p>
    </div>
  );
}

export function SignClient({ token }: { token: string }) {
  const [view, setView] = useState<PublicSigningView | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [signerName, setSignerName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/public/sign/${token}`);
        const json = (await res.json()) as { ok: boolean; view?: PublicSigningView };
        if (cancelled) return;
        if (!json.ok || !json.view) {
          setLoadError(true);
          return;
        }
        setView(json.view);
        setSignerName(json.view.clientName ?? "");
      } catch {
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function submit() {
    if (!signatureData || !agreed || submitting) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const res = await fetch(`/api/public/sign/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signatureDataUrl: signatureData, signerName: signerName.trim() }),
      });
      const json = (await res.json()) as { ok: boolean; signedPdfUrl?: string; error?: string };
      if (!json.ok || !json.signedPdfUrl) throw new Error(mapError(json.error ?? ""));
      setSignedUrl(json.signedPdfUrl);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : mapError(""));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <Shell>
        <div className="py-20 text-center text-sm text-gray-400">載入中…</div>
      </Shell>
    );
  }

  if (loadError || !view) {
    return (
      <Shell>
        <Notice title="連結無效" desc="找不到這份報價單，請確認連結是否正確或聯絡馬鈴薯沙發。" />
      </Shell>
    );
  }

  const doneUrl = signedUrl ?? (view.status === "signed" ? view.signedPdfUrl : null);
  if (doneUrl) {
    return (
      <Shell>
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
          <p className="text-lg font-semibold text-green-600">✓ 簽署完成，感謝您！</p>
          <p className="mt-2 text-sm text-gray-500">您已完成報價單 {view.quoteId} 的線上簽署。</p>
          <a
            href={doneUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-block rounded-lg bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
          >
            下載已簽署合約 PDF
          </a>
        </div>
      </Shell>
    );
  }

  if (view.status === "expired") {
    return (
      <Shell>
        <Notice title="連結已過期" desc="請聯絡馬鈴薯沙發重新產生簽署連結。" />
      </Shell>
    );
  }
  if (view.status === "revoked") {
    return (
      <Shell>
        <Notice title="連結已失效" desc="此連結已被重新產生或作廢，請使用最新的簽署連結。" />
      </Shell>
    );
  }

  const canSubmit = Boolean(signatureData) && agreed && !submitting;

  return (
    <Shell>
      <div className="space-y-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="text-sm text-gray-500">
              報價編號 <span className="font-mono text-gray-800">{view.quoteId}</span>
            </div>
            <div className="text-sm text-gray-500">
              含稅合計{" "}
              <span className="font-semibold text-gray-900">
                NT$ {view.total.toLocaleString()}
              </span>
            </div>
          </div>
          {view.clientName && (
            <div className="mt-1 text-sm text-gray-500">客戶：{view.clientName}</div>
          )}
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-4 py-2 text-xs font-medium text-gray-500">
            報價單內容（請確認後於下方簽名）
          </div>
          <div className="max-h-[70vh] overflow-y-auto bg-gray-100">
            {view.unsignedImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={view.unsignedImageUrl} alt="報價單" className="block w-full" />
            ) : (
              <iframe src={view.unsignedPdfUrl} title="報價單" className="h-[60vh] w-full bg-white" />
            )}
          </div>
          <div className="border-t border-gray-100 px-4 py-2 text-center">
            <a
              href={view.unsignedPdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-gray-500 underline"
            >
              另開完整報價單 PDF
            </a>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <label className="mb-1 block text-xs font-medium text-gray-500">簽署人姓名</label>
          <input
            value={signerName}
            onChange={(e) => setSignerName(e.target.value)}
            placeholder="請輸入姓名"
            className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />

          <label className="mb-1 block text-xs font-medium text-gray-500">手寫簽名</label>
          <SignaturePad onChange={setSignatureData} />

          <label className="mt-4 flex items-start gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5"
            />
            <span>我已閱讀並同意上方報價單之內容與條款。</span>
          </label>

          {submitError && <p className="mt-3 text-sm text-red-600">{submitError}</p>}

          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canSubmit}
            className="mt-4 w-full rounded-lg bg-gray-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            {submitting ? "簽署處理中…" : "確認簽署"}
          </button>
          <p className="mt-2 text-center text-[11px] text-gray-400">
            送出即完成簽署，系統將記錄簽署時間與裝置資訊作為存證。
          </p>
        </div>
      </div>
    </Shell>
  );
}
