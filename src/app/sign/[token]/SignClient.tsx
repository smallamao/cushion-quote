"use client";

import { useEffect, useState } from "react";

import { SignatureModal } from "@/components/sign/SignatureModal";
import { DEPOSIT_PAYMENT_INFO } from "@/lib/deposit-payment";
import type { PublicSigningView } from "@/lib/signing-types";

function mapError(code: string): string {
  switch (code) {
    case "expired":
      return "此連結已過期，請聯絡馬鈴薯沙發重新產生。";
    case "not_pending":
      return "此報價單已完成簽署或連結已失效。";
    case "invalid_signature":
      return "簽名內容無效，請重新簽名。";
    case "missing_orderer_info":
      return "請填寫完整的訂貨人姓名、電話與地址。";
    case "missing_invoice_info":
      return "勾選開立發票時，請填寫統一編號與發票抬頭。";
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
  // LINE 內建瀏覽器簽名容易失敗：偵測到就自動補 ?openExternalBrowser=1 重導，
  // 讓 LINE 改用手機原生瀏覽器開啟。連結本身不必帶參數（越短越好貼）。
  useEffect(() => {
    if (typeof window === "undefined") return;
    const ua = navigator.userAgent;
    const isLine = /\bLine\//i.test(ua);
    if (isLine && !window.location.search.includes("openExternalBrowser")) {
      const sep = window.location.search ? "&" : "?";
      window.location.replace(`${window.location.href}${sep}openExternalBrowser=1`);
    }
  }, []);

  const [view, setView] = useState<PublicSigningView | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [signerName, setSignerName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [issueInvoice, setIssueInvoice] = useState(false);
  const [taxId, setTaxId] = useState("");
  const [invoiceTitle, setInvoiceTitle] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [signModalOpen, setSignModalOpen] = useState(false);
  const [inAppBrowser, setInAppBrowser] = useState(false);

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
        // 訂貨人姓名預填「聯絡人」；散客沒有公司名，clientName 會是空的。
        setSignerName(json.view.contactName || json.view.clientName || "");
        setPhone(json.view.contactPhone ?? "");
        setAddress(json.view.contactAddress ?? "");
        // 客戶主檔查到統編＝這是長期配合的公司戶，一定要開發票。
        // 直接帶入並預先勾選，客人只要簽名；散客查不到就維持空白自行填寫。
        const masterTaxId = json.view.taxId ?? "";
        if (masterTaxId) {
          setTaxId(masterTaxId);
          setInvoiceTitle(json.view.invoiceTitle ?? json.view.clientName ?? "");
          setIssueInvoice(true);
        }
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

  useEffect(() => {
    setInAppBrowser(/Line|FBAN|FBAV|FB_IAB|Instagram/i.test(navigator.userAgent));
  }, []);

  async function submit() {
    const name = signerName.trim();
    const phoneV = phone.trim();
    const addressV = address.trim();
    const taxIdV = taxId.trim();
    const invoiceTitleV = invoiceTitle.trim();
    // 含稅報價：統編為選填（有填＝開公司統編發票，沒填＝個人發票）；未稅報價維持原本「勾選才加稅開票」。
    const alreadyTaxed = (view?.taxRate ?? 0) > 0;
    const wantInvoice = alreadyTaxed ? Boolean(taxIdV) : issueInvoice;
    if (!signatureData || !agreed || submitting) return;
    if (!name || !phoneV || !addressV) return;
    if (wantInvoice && (!taxIdV || !invoiceTitleV)) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const res = await fetch(`/api/public/sign/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signatureDataUrl: signatureData,
          signerName: name,
          ordererPhone: phoneV,
          ordererAddress: addressV,
          issueInvoice: wantInvoice,
          taxId: taxIdV,
          invoiceTitle: invoiceTitleV,
        }),
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
            href={`/api/public/sign/${token}/download`}
            download
            className="mt-5 inline-block rounded-lg bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
          >
            下載已簽署合約 PDF
          </a>
          <div className="mt-6 whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-50 p-4 text-left text-sm leading-relaxed text-gray-700">
            <p className="mb-2 font-semibold text-gray-800">訂金匯款資訊</p>
            {DEPOSIT_PAYMENT_INFO}
          </div>
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

  // 含稅：統編選填（填了才需一併填抬頭）；未稅：沿用勾選才必填。
  const wantInvoiceGate = ((view.taxRate ?? 0) > 0) ? Boolean(taxId.trim()) : issueInvoice;
  const canSubmit =
    Boolean(signatureData) &&
    agreed &&
    !submitting &&
    Boolean(signerName.trim()) &&
    Boolean(phone.trim()) &&
    Boolean(address.trim()) &&
    (!wantInvoiceGate || (Boolean(taxId.trim()) && Boolean(invoiceTitle.trim())));

  // 開發票加稅預覽：未稅報價（taxRate 0）以未稅小計外加 5% 營業稅；已含稅則沿用原總價。
  const invoiceAlreadyTaxed = (view.taxRate ?? 0) > 0;
  const invoiceBase = view.subtotal ?? view.total;
  const invoiceTax = Math.round(invoiceBase * 0.05);
  const invoiceTotal = invoiceBase + invoiceTax;

  return (
    <Shell>
      <div className="space-y-4">
        {inAppBrowser && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            ⚠️ 目前用 App 內建瀏覽器開啟，簽名可能不順。請點右上角「⋯」選「用預設瀏覽器開啟」，或改用 Safari／Chrome 開此連結。
          </div>
        )}
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
          <p className="mb-1 text-sm font-semibold text-gray-800">訂貨人資訊</p>
          <p className="mb-3 text-xs text-gray-400">簽名的人即為訂貨人，以下為出貨聯絡用</p>

          <label className="mb-1 block text-xs font-medium text-gray-500">
            姓名 <span className="text-red-500">*</span>
          </label>
          <input
            value={signerName}
            onChange={(e) => setSignerName(e.target.value)}
            placeholder="請輸入姓名"
            className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />

          <label className="mb-1 block text-xs font-medium text-gray-500">
            電話 <span className="text-red-500">*</span>
          </label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            placeholder="請輸入聯絡電話"
            className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />

          <label className="mb-1 block text-xs font-medium text-gray-500">
            地址 <span className="text-red-500">*</span>
          </label>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="請輸入地址"
            className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />

          {invoiceAlreadyTaxed ? (
            /* 已含稅：一定會開發票，統編為選填（公司報帳才填、個人免填），不再用勾選框藏起來 */
            <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="mb-1 text-sm font-medium text-gray-700">統一發票</p>
              <p className="mb-3 text-xs text-gray-400">
                本報價已含營業稅，將為您開立發票。
                <span className="text-gray-600">公司報帳請填統編（個人免填）。</span>
              </p>
              <label className="mb-1 block text-xs font-medium text-gray-500">
                統一編號 <span className="text-gray-400">（公司報帳才填）</span>
              </label>
              <input
                value={taxId}
                onChange={(e) => setTaxId(e.target.value)}
                inputMode="numeric"
                placeholder="個人免填；公司請填 8 碼統編"
                className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              {taxId.trim() && (
                <>
                  <label className="mb-1 block text-xs font-medium text-gray-500">
                    發票抬頭 <span className="text-red-500">*</span>
                  </label>
                  <input
                    value={invoiceTitle}
                    onChange={(e) => setInvoiceTitle(e.target.value)}
                    placeholder="請輸入公司抬頭"
                    className="mb-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  {!invoiceTitle.trim() && (
                    <p className="text-xs text-red-500">填了統編請一併填發票抬頭</p>
                  )}
                </>
              )}
            </div>
          ) : (
            /* 未稅：維持原本「勾選才開票並外加 5% 稅」 */
            <>
              <label className="mb-3 flex items-start gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={issueInvoice}
                  onChange={(e) => setIssueInvoice(e.target.checked)}
                  className="mt-0.5"
                />
                <span>需要開立統一發票（未稅價需另加 5% 營業稅）</span>
              </label>

              {issueInvoice && (
                <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <label className="mb-1 block text-xs font-medium text-gray-500">
                    統一編號 <span className="text-red-500">*</span>
                  </label>
                  <input
                    value={taxId}
                    onChange={(e) => setTaxId(e.target.value)}
                    inputMode="numeric"
                    placeholder="請輸入統一編號"
                    className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />

                  <label className="mb-1 block text-xs font-medium text-gray-500">
                    發票抬頭 <span className="text-red-500">*</span>
                  </label>
                  <input
                    value={invoiceTitle}
                    onChange={(e) => setInvoiceTitle(e.target.value)}
                    placeholder="請輸入發票抬頭"
                    className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />

                  <p className="text-xs text-gray-600">
                    未稅 NT$ {invoiceBase.toLocaleString()}／營業稅5% NT$ {invoiceTax.toLocaleString()}／
                    <span className="font-semibold text-gray-900">
                      含稅總計 NT$ {invoiceTotal.toLocaleString()}
                    </span>
                  </p>
                </div>
              )}
            </>
          )}

          <label className="mb-1 block text-xs font-medium text-gray-500">手寫簽名</label>
          {signatureData ? (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={signatureData}
                alt="簽名"
                className="h-20 w-auto rounded-lg border border-gray-300 bg-white"
              />
              <button
                type="button"
                onClick={() => setSignModalOpen(true)}
                className="text-xs text-gray-500 underline"
              >
                重新簽名
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setSignModalOpen(true)}
              className="flex h-24 w-full items-center justify-center rounded-lg border-2 border-dashed border-gray-300 text-sm text-gray-500"
            >
              ✍️ 點此開啟簽名板
            </button>
          )}

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
      {signModalOpen && (
        <SignatureModal
          onDone={(d) => {
            setSignatureData(d);
            setSignModalOpen(false);
          }}
          onClose={() => setSignModalOpen(false)}
        />
      )}
    </Shell>
  );
}
