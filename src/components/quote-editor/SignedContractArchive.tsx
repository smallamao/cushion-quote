"use client";

import { FileText, Image as ImageIcon, Loader2, Upload, X } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface SignedContractArchiveProps {
  versionId: string;
  signedBack: boolean;
  signedBackDate: string;
  signedContractUrls: string[];
  signedNotes: string;
  readOnly?: boolean;
  onChange: (patch: {
    signedBack: boolean;
    signedBackDate: string;
    signedContractUrls: string[];
    signedNotes: string;
  }) => void;
}

interface UploadResponse {
  ok: boolean;
  url?: string;
  fileName?: string;
  mimeType?: string;
  error?: string;
}

function isPdfUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.endsWith(".pdf") || lower.includes("/raw/");
}

function fileNameFromUrl(url: string): string {
  try {
    const parts = url.split("/");
    return parts[parts.length - 1] ?? "file";
  } catch {
    return "file";
  }
}

export function SignedContractArchive({
  versionId,
  signedBack,
  signedBackDate,
  signedContractUrls,
  signedNotes,
  readOnly = false,
  onChange,
}: SignedContractArchiveProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadError("");

    try {
      const newUrls: string[] = [];
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("folder", "signed-contracts");

        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });
        const data = (await res.json()) as UploadResponse;
        if (!res.ok || !data.ok || !data.url) {
          throw new Error(data.error || "上傳失敗");
        }
        newUrls.push(data.url);
      }

      onChange({
        signedBack: true,
        signedBackDate: signedBackDate || new Date().toISOString().slice(0, 10),
        signedContractUrls: [...signedContractUrls, ...newUrls],
        signedNotes,
      });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "上傳失敗");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleRemove(index: number) {
    const confirmRemove = window.confirm(
      "確定要移除這個合約檔案？\n\n注意：已上傳的合約為法律憑據，移除前請確認並保留本地備份。",
    );
    if (!confirmRemove) return;

    const nextUrls = signedContractUrls.filter((_, i) => i !== index);
    onChange({
      signedBack,
      signedBackDate,
      signedContractUrls: nextUrls,
      signedNotes,
    });
  }

  const hasVersionId = Boolean(versionId);

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">合約歸檔（回簽存證）</h3>
        <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
          <Checkbox
            checked={signedBack}
            disabled={readOnly}
            onCheckedChange={(checked) =>
              onChange({
                signedBack: checked === true,
                signedBackDate: checked === true
                  ? signedBackDate || new Date().toISOString().slice(0, 10)
                  : signedBackDate,
                signedContractUrls,
                signedNotes,
              })
            }
          />
          已回簽
        </label>
      </div>

      {!hasVersionId && (
        <div className="mb-3 rounded bg-amber-50 px-3 py-2 text-xs text-amber-700">
          請先儲存報價版本，才能上傳合約檔案。
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <Label className="mb-1 block text-xs">回簽日期</Label>
          <Input
            type="date"
            value={signedBackDate}
            disabled={readOnly}
            onChange={(e) =>
              onChange({
                signedBack,
                signedBackDate: e.target.value,
                signedContractUrls,
                signedNotes,
              })
            }
          />
        </div>
        <div>
          <Label className="mb-1 block text-xs">合約檔案（支援圖片 / PDF，可多檔）</Label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            className="hidden"
            disabled={readOnly || !hasVersionId || uploading}
            onChange={(e) => void handleFiles(e.target.files)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={readOnly || !hasVersionId || uploading}
            onClick={() => fileInputRef.current?.click()}
            className="w-full"
          >
            {uploading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                上傳中…
              </>
            ) : (
              <>
                <Upload className="h-3.5 w-3.5" />
                上傳合約掃描檔
              </>
            )}
          </Button>
          {uploadError && (
            <p className="mt-1 text-xs text-red-600">{uploadError}</p>
          )}
        </div>
      </div>

      {signedContractUrls.length > 0 && (
        <div className="mt-3">
          <Label className="mb-2 block text-xs">已上傳檔案（{signedContractUrls.length}）</Label>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
            {signedContractUrls.map((url, index) => {
              const isPdf = isPdfUrl(url);
              return (
                <div
                  key={`${url}-${index}`}
                  className="group relative rounded border border-[var(--border)] bg-[var(--bg-subtle)] p-2"
                >
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    {isPdf ? (
                      <div className="flex h-24 flex-col items-center justify-center gap-1 text-[var(--text-secondary)]">
                        <FileText className="h-8 w-8" />
                        <span className="text-[11px] truncate max-w-full">
                          {fileNameFromUrl(url)}
                        </span>
                      </div>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={url}
                        alt={`合約檔案 ${index + 1}`}
                        className="h-24 w-full rounded object-cover"
                      />
                    )}
                  </a>
                  <div className="mt-1 flex items-center justify-between text-[10px] text-[var(--text-tertiary)]">
                    <span className="flex items-center gap-1">
                      {isPdf ? (
                        <FileText className="h-3 w-3" />
                      ) : (
                        <ImageIcon className="h-3 w-3" />
                      )}
                      檔案 {index + 1}
                    </span>
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => handleRemove(index)}
                        className="text-[var(--text-tertiary)] hover:text-red-500"
                        title="移除"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-3">
        <Label className="mb-1 block text-xs">回簽備註</Label>
        <Textarea
          value={signedNotes}
          disabled={readOnly}
          placeholder="例：客戶手寫修改第3條保固期、缺章頁已補傳"
          rows={2}
          onChange={(e) =>
            onChange({
              signedBack,
              signedBackDate,
              signedContractUrls,
              signedNotes: e.target.value,
            })
          }
        />
      </div>
    </div>
  );
}
