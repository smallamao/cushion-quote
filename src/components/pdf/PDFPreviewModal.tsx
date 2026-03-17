"use client";

import { Download, Loader2, Printer, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

interface PDFPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pdfBlob: Blob | null;
  fileName: string;
  loading: boolean;
}

export function PDFPreviewModal({
  open,
  onOpenChange,
  pdfBlob,
  fileName,
  loading,
}: PDFPreviewModalProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (pdfBlob) {
      const url = URL.createObjectURL(pdfBlob);
      setBlobUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setBlobUrl(null);
  }, [pdfBlob]);

  const handleDownload = useCallback(() => {
    if (!blobUrl) return;
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [blobUrl, fileName]);

  const handlePrint = useCallback(() => {
    if (!iframeRef.current) return;
    iframeRef.current.contentWindow?.print();
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => onOpenChange(false)}
      />
      <div className="relative flex h-[90vh] w-[90vw] max-w-4xl flex-col rounded-[var(--radius-lg)] bg-[var(--bg-elevated)] shadow-[var(--shadow-lg)]">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
          <span className="text-sm font-semibold text-[var(--text-primary)]">
            PDF 預覽 — {fileName}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
              disabled={!blobUrl}
            >
              <Printer className="h-3.5 w-3.5" />
              列印
            </Button>
            <Button
              size="sm"
              onClick={handleDownload}
              disabled={!blobUrl}
            >
              <Download className="h-3.5 w-3.5" />
              下載
            </Button>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="ml-2 rounded-[var(--radius-sm)] p-1 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-hidden bg-[#525659] p-4">
          {loading ? (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-white">
              <Loader2 className="h-5 w-5 animate-spin" />
              生成 PDF 中...
            </div>
          ) : blobUrl ? (
            <iframe
              ref={iframeRef}
              src={blobUrl}
              className="h-full w-full rounded-[var(--radius-sm)]"
              title="PDF 預覽"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-white">
              無法生成 PDF
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
