"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ExternalLink, Loader2, Maximize2, X } from "lucide-react";

import type { PurchaseOrder, QuoteVersionRecord, VersionLineRecord } from "@/lib/types";
import { buildSignLink } from "@/lib/sign-link";
import { buildSignShareMessage } from "@/lib/deposit-payment";
import { formatCurrency } from "@/lib/utils";
import { createQuoteLoadRequest, writeQuoteLoadRequest } from "@/lib/quote-draft-session";
import { generatePDFBlob, generateJpgBlob, buildPdfFileName, type QuotePDFProps } from "@/components/pdf/QuotePDF";
import { PDFPreviewModal } from "@/components/pdf/PDFPreviewModal";
import { toFlexItemsFromVersion } from "@/lib/quote-mappers";
import { useSettings } from "@/hooks/useSettings";
import { DEFAULT_TERMS } from "@/lib/constants";
import { displayAmountOf } from "@/lib/quote-options";
import { applyTaxModeToTerms } from "@/lib/quote-terms";

interface Props {
  versionId: string | null;
  onClose: () => void;
}

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  draft:        { label: "草稿",   cls: "bg-gray-100 text-gray-700" },
  sent:         { label: "已發送", cls: "bg-blue-100 text-blue-700" },
  following_up: { label: "追蹤中", cls: "bg-blue-100 text-blue-700" },
  negotiating:  { label: "議價中", cls: "bg-amber-100 text-amber-700" },
  accepted:     { label: "已接受", cls: "bg-green-100 text-green-700" },
  rejected:     { label: "已拒絕", cls: "bg-red-100 text-red-700" },
  superseded:   { label: "已取代", cls: "bg-gray-100 text-gray-500" },
};

const PO_STATUS_MAP: Record<string, { label: string; cls: string }> = {
  draft:     { label: "草稿",   cls: "bg-gray-100 text-gray-700" },
  sent:      { label: "已送出", cls: "bg-blue-100 text-blue-700" },
  confirmed: { label: "已確認", cls: "bg-amber-100 text-amber-700" },
  received:  { label: "已到貨", cls: "bg-green-100 text-green-700" },
  cancelled: { label: "已取消", cls: "bg-red-100 text-red-500" },
};

export function QuotePreviewDrawer({ versionId, onClose }: Props) {
  const [version, setVersion] = useState<QuoteVersionRecord | null>(null);
  const [lines, setLines] = useState<VersionLineRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<"quote" | "purchases">("quote");
  const [purchases, setPurchases] = useState<PurchaseOrder[]>([]);
  const [purchasesLoading, setPurchasesLoading] = useState(false);
  const { settings, loading: settingsLoading } = useSettings();
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState(false);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const [signLink, setSignLink] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [pdfPropsForLink, setPdfPropsForLink] = useState<QuotePDFProps | null>(null);

  useEffect(() => {
    setTab("quote");
    setPurchases([]);
    setPdfModalOpen(false);
    setSignLink(null);
    setLinkCopied(false);
    setPdfPropsForLink(null);
  }, [versionId]);

  useEffect(() => {
    const caseId = version?.caseId;
    if (!caseId) { setPurchases([]); return; }
    setPurchasesLoading(true);
    void fetch(`/api/sheets/purchases?caseId=${encodeURIComponent(caseId)}`)
      .then((r) => r.json() as Promise<{ orders: PurchaseOrder[] }>)
      .then((data) => setPurchases(data.orders ?? []))
      .catch(() => setPurchases([]))
      .finally(() => setPurchasesLoading(false));
  }, [version?.caseId]);

  useEffect(() => {
    if (!versionId) {
      setVersion(null);
      setLines([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(false);
    setVersion(null);
    setLines([]);
    void fetch(`/api/sheets/versions/${encodeURIComponent(versionId)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("load");
        return r.json() as Promise<{ version: QuoteVersionRecord; lines: VersionLineRecord[] }>;
      })
      .then((data) => {
        if (cancelled) return;
        setVersion(data.version);
        setLines(data.lines.filter((l) => l.showOnQuote).sort((a, b) => a.lineNo - b.lineNo));
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [versionId]);

  // 產生報價單 PDF（用 version + lines + settings 組 QuotePDFProps），供底部內嵌預覽
  useEffect(() => {
    if (!version || settingsLoading) return;
    let cancelled = false;
    setPdfLoading(true);
    setPdfError(false);
    setPdfBlob(null);
    const props: QuotePDFProps = {
      quoteId: version.quoteId,
      quoteDate: version.quoteDate || new Date().toISOString().slice(0, 10),
      validityDays: settings.quoteValidityDays,
      validUntil: version.validUntil || undefined,
      pdfMode: "a4",
      client: {
        companyName: version.clientNameSnapshot || "",
        contactName: version.contactNameSnapshot || "",
        phone: version.clientPhoneSnapshot || "",
        email: "",
        address: version.projectAddressSnapshot || "",
        taxId: "",
      },
      projectName: version.projectNameSnapshot || "",
      quoteName: version.quoteNameSnapshot || undefined,
      channel: version.channel || "retail",
      items: toFlexItemsFromVersion(lines),
      description: version.publicDescription || "",
      descriptionImageUrl: version.descriptionImageUrl || undefined,
      includeTax: (version.taxRate ?? 0) > 0,
      subtotal: version.subtotalBeforeTax,
      tax: version.taxAmount,
      total: version.totalAmount,
      multiOption: Boolean(version.isMultiOption),
      termsTemplate: (version.termsTemplate || applyTaxModeToTerms(DEFAULT_TERMS, version.taxRate > 0)).replace(/(\d+\.)\s/g, "$1 "),
      settings,
    };
    setPdfPropsForLink(props);
    void generatePDFBlob(props)
      .then((blob) => { if (!cancelled) setPdfBlob(blob); })
      .catch(() => { if (!cancelled) setPdfError(true); })
      .finally(() => { if (!cancelled) setPdfLoading(false); });
    return () => { cancelled = true; };
  }, [version, lines, settings, settingsLoading]);

  // 內嵌預覽用的 object URL
  useEffect(() => {
    if (!pdfBlob) { setPdfUrl(null); return; }
    const url = URL.createObjectURL(pdfBlob);
    setPdfUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pdfBlob]);

  // 產生客戶線上簽署連結：把已產生的報價單 PDF 當「待簽 PDF」上傳，再建立 token 連結
  async function handleGenerateSignLink() {
    if (!version || !pdfBlob || linkBusy) return;
    setLinkBusy(true);
    try {
      const fileName = buildPdfFileName({
        quoteId: version.quoteId,
        projectName: version.projectNameSnapshot,
        quoteName: version.quoteNameSnapshot,
      });
      const fd = new FormData();
      fd.append("file", new File([pdfBlob], fileName, { type: "application/pdf" }));
      fd.append("folder", "signing-unsigned");
      const up = await fetch("/api/upload", { method: "POST", body: fd });
      const upJson = (await up.json()) as { ok: boolean; url?: string; error?: string };
      if (!upJson.ok || !upJson.url) throw new Error(upJson.error ?? "待簽 PDF 上傳失敗");

      // 另產一張長圖給客戶頁顯示（iOS Safari 的 iframe 不吃 PDF）；失敗則客戶頁回退用 PDF
      let unsignedImageUrl = "";
      if (pdfPropsForLink) {
        try {
          const jpg = await generateJpgBlob(pdfPropsForLink);
          const fdImg = new FormData();
          fdImg.append("file", new File([jpg], fileName.replace(/\.pdf$/i, ".jpg"), { type: "image/jpeg" }));
          fdImg.append("folder", "signing-unsigned");
          const upImg = await fetch("/api/upload", { method: "POST", body: fdImg });
          const upImgJson = (await upImg.json()) as { ok: boolean; url?: string };
          if (upImgJson.ok && upImgJson.url) unsignedImageUrl = upImgJson.url;
        } catch {
          /* 回退 PDF 顯示 */
        }
      }

      const res = await fetch("/api/sheets/signing-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: version.versionId, unsignedPdfUrl: upJson.url, unsignedImageUrl }),
      });
      const json = (await res.json()) as { ok: boolean; token?: string; error?: string };
      if (!json.ok || !json.token) throw new Error(json.error ?? "建立簽署連結失敗");

      const url = buildSignLink(json.token);
      setSignLink(url);
      try {
        await navigator.clipboard.writeText(buildSignShareMessage(url));
        setLinkCopied(true);
      } catch {
        setLinkCopied(false);
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "產生簽署連結失敗");
    } finally {
      setLinkBusy(false);
    }
  }

  const open = Boolean(versionId);
  const status = version ? (STATUS_MAP[version.versionStatus] ?? STATUS_MAP.draft) : null;
  const alreadySigned = Boolean(
    version && (version.signedBack || (version.signedContractUrls?.length ?? 0) > 0),
  );

  return (
    <>
      <div
        className={[
          "fixed inset-0 z-40 bg-black/30 transition-opacity duration-200",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        ].join(" ")}
        onClick={onClose}
      />

      <div
        className={[
          "fixed right-0 top-0 z-50 flex h-full w-full max-w-[520px] flex-col bg-[var(--bg-elevated)] shadow-2xl transition-transform duration-200",
          open ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm font-semibold text-[var(--text-primary)]">
              {version ? `${version.quoteId} V${version.versionNo}` : (versionId ?? "")}
            </span>
            {status && (
              <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] ${status.cls}`}>
                {status.label}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {version && (
              <Link
                href="/"
                onClick={() => {
                  writeQuoteLoadRequest(
                    window.sessionStorage,
                    createQuoteLoadRequest({
                      source: "quotes-list",
                      caseId: version.caseId,
                      quoteId: version.quoteId,
                      versionId: version.versionId,
                    }),
                  );
                }}
                className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                完整編輯
              </Link>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--border)] px-5">
          {(["quote", "purchases"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={[
                "py-2.5 px-1 mr-5 text-xs font-medium border-b-2 -mb-px transition-colors",
                tab === t
                  ? "border-[var(--accent)] text-[var(--accent)]"
                  : "border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-primary)]",
              ].join(" ")}
            >
              {t === "quote" ? "報價明細" : `採購單${purchases.length > 0 ? ` (${purchases.length})` : ""}`}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {tab === "purchases" ? (
            <>
              {purchasesLoading && (
                <div className="flex items-center justify-center py-16 text-[var(--text-tertiary)]">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              )}
              {!purchasesLoading && purchases.length === 0 && (
                <p className="py-16 text-center text-sm text-[var(--text-tertiary)]">此案場無相關採購單</p>
              )}
              {!purchasesLoading && purchases.length > 0 && (
                <div className="space-y-2">
                  {purchases.map((po) => {
                    const poStatus = PO_STATUS_MAP[po.status] ?? PO_STATUS_MAP.draft;
                    return (
                      <div key={po.orderId} className="rounded-lg border border-[var(--border)] p-3 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono font-semibold text-[var(--text-primary)]">{po.orderId}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] ${poStatus.cls}`}>{poStatus.label}</span>
                        </div>
                        <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 text-[var(--text-secondary)]">
                          <span>廠商</span>
                          <span className="text-[var(--text-primary)]">{po.supplierSnapshot.shortName || po.supplierSnapshot.name}</span>
                          <span>採購日期</span>
                          <span className="text-[var(--text-primary)]">{po.orderDate}</span>
                          {po.expectedDeliveryDate && (
                            <>
                              <span>預計到貨</span>
                              <span className="text-[var(--text-primary)]">{po.expectedDeliveryDate}</span>
                            </>
                          )}
                          <span>合計</span>
                          <span className="font-mono font-medium text-[var(--text-primary)]">{formatCurrency(po.totalAmount)}</span>
                        </div>
                        {po.notes && (
                          <p className="mt-1.5 text-[10px] text-[var(--text-tertiary)]">{po.notes}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <>
          {loading && (
            <div className="flex items-center justify-center py-16 text-[var(--text-tertiary)]">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}

          {!loading && error && (
            <p className="py-16 text-center text-sm text-[var(--text-tertiary)]">載入失敗，請重試</p>
          )}

          {!loading && version && (
            <>
              {/* Meta */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                <div className="text-[var(--text-tertiary)]">客戶</div>
                <div className="text-[var(--text-primary)]">
                  {version.clientNameSnapshot || "—"}
                  {version.contactNameSnapshot && (
                    <span className="ml-1 text-[var(--text-tertiary)]">({version.contactNameSnapshot})</span>
                  )}
                </div>
                <div className="text-[var(--text-tertiary)]">方案名稱</div>
                <div className="text-[var(--text-primary)]">{version.quoteNameSnapshot || "—"}</div>
                <div className="text-[var(--text-tertiary)]">案場</div>
                <div className="text-[var(--text-primary)]">{version.projectNameSnapshot || "—"}</div>
                {version.projectAddressSnapshot && (
                  <>
                    <div className="text-[var(--text-tertiary)]">地址</div>
                    <div className="text-[var(--text-primary)]">{version.projectAddressSnapshot}</div>
                  </>
                )}
                <div className="text-[var(--text-tertiary)]">報價日期</div>
                <div className="text-[var(--text-primary)]">{version.quoteDate || "—"}</div>
                {version.internalNotes && (
                  <>
                    <div className="text-[var(--text-tertiary)]">內部備註</div>
                    <div className="text-[var(--text-primary)]">{version.internalNotes}</div>
                  </>
                )}
              </div>

              {/* Line items */}
              <div className="overflow-hidden rounded-lg border border-[var(--border)]">
                <table className="w-full text-xs">
                  <thead className="bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">品項</th>
                      <th className="px-3 py-2 text-right font-medium">數量</th>
                      <th className="px-3 py-2 text-right font-medium">單價</th>
                      <th className="px-3 py-2 text-right font-medium">小計</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {lines.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-center text-[var(--text-tertiary)]">
                          無明細
                        </td>
                      </tr>
                    )}
                    {lines.map((line) => (
                      <tr key={line.itemId} className="hover:bg-[var(--bg-hover)]">
                        <td className="px-3 py-2">
                          <div className="font-medium text-[var(--text-primary)]">{line.itemName}</div>
                          {line.spec && (
                            <div className="whitespace-pre-line text-[10px] text-[var(--text-tertiary)]">
                              {line.spec.split(/\s*[｜|]\s*/).filter(Boolean).join("\n")}
                            </div>
                          )}
                          {line.notes && (
                            <div className="text-[10px] text-[var(--text-tertiary)]">{line.notes}</div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-[var(--text-secondary)]">
                          {line.qty} {line.unit}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-[var(--text-secondary)]">
                          {formatCurrency(line.unitPrice)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-[var(--text-primary)]">
                          {formatCurrency(line.lineAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div className="space-y-1 text-right text-xs">
                {version.discountAmount !== 0 && (
                  <div className="text-[var(--text-secondary)]">
                    折扣 <span className="font-mono">{formatCurrency(-version.discountAmount)}</span>
                  </div>
                )}
                {version.taxAmount > 0 && (
                  <div className="text-[var(--text-secondary)]">
                    稅額 <span className="font-mono">{formatCurrency(version.taxAmount)}</span>
                  </div>
                )}
                {version.isMultiOption ? (
                  <div className="text-sm font-semibold text-[var(--text-primary)]">
                    多方案 · 最低方案 <span className="font-mono">{formatCurrency(displayAmountOf(version))}</span> 起
                    <div className="mt-0.5 text-[11px] font-normal text-[var(--text-tertiary)]">
                      PDF 不顯示合計；客人定案後請建立「確認方案」新版本
                    </div>
                  </div>
                ) : (
                  <div className="text-sm font-semibold text-[var(--text-primary)]">
                    含稅合計 <span className="font-mono">{formatCurrency(version.totalAmount)}</span>
                  </div>
                )}
              </div>

              {/* 報價單 PDF 預覽（底部）*/}
              <div className="space-y-2 border-t border-[var(--border)] pt-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-medium text-[var(--text-secondary)]">報價單</div>
                  {pdfBlob && (
                    <button
                      type="button"
                      onClick={() => setPdfModalOpen(true)}
                      className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]"
                    >
                      <Maximize2 className="h-3.5 w-3.5" />
                      放大 / 下載
                    </button>
                  )}
                </div>
                {pdfLoading && (
                  <div className="flex items-center justify-center gap-2 rounded-lg border border-[var(--border)] py-10 text-xs text-[var(--text-tertiary)]">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    產生報價單中…
                  </div>
                )}
                {!pdfLoading && pdfError && (
                  <p className="rounded-lg border border-[var(--border)] py-6 text-center text-xs text-[var(--text-tertiary)]">
                    報價單產生失敗
                  </p>
                )}
                {!pdfLoading && pdfUrl && (
                  <div
                    onClick={() => setPdfModalOpen(true)}
                    title="點擊放大"
                    className="w-full cursor-pointer overflow-hidden rounded-lg border border-[var(--border)]"
                  >
                    <iframe
                      src={`${pdfUrl}#toolbar=0&view=FitH`}
                      title="報價單預覽"
                      className="pointer-events-none h-[560px] w-full bg-white"
                    />
                  </div>
                )}

                {/* 產生客戶線上簽署連結；已回簽的版本停用（一版一合約，要改請建新版本） */}
                <button
                  type="button"
                  onClick={() => void handleGenerateSignLink()}
                  disabled={!pdfBlob || linkBusy || alreadySigned}
                  className="w-full rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
                >
                  {alreadySigned
                    ? "此版本已回簽，如需修改請建立新版本"
                    : linkBusy
                      ? "產生中…"
                      : "產生線上簽署連結"}
                </button>
                {signLink && (
                  <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] p-2 text-[11px]">
                    <div className="mb-1 text-[var(--text-secondary)]">
                      {linkCopied ? "✓ 已複製（含訂金匯款帳號），貼給客戶即可簽署：" : "簽署連結（複製給客戶，含訂金匯款帳號）："}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input
                        readOnly
                        value={signLink}
                        onFocus={(e) => e.currentTarget.select()}
                        className="min-w-0 flex-1 rounded border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1 font-mono text-[10px]"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(buildSignShareMessage(signLink));
                          setLinkCopied(true);
                        }}
                        className="shrink-0 rounded bg-[var(--bg-hover)] px-2 py-1 text-[var(--text-secondary)]"
                      >
                        複製
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
            </>
          )}
        </div>
      </div>

      <PDFPreviewModal
        open={pdfModalOpen}
        onOpenChange={setPdfModalOpen}
        pdfBlob={pdfBlob}
        fileName={buildPdfFileName({
          quoteId: version?.quoteId ?? "",
          projectName: version?.projectNameSnapshot ?? "",
          quoteName: version?.quoteNameSnapshot ?? "",
        })}
        loading={pdfLoading}
      />
    </>
  );
}
