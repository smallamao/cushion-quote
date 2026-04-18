"use client";

import { Check, Loader2, Plus, Upload, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CLIENT_TYPE_LABELS, CHANNEL_LABELS } from "@/lib/constants";
import type { ClientType, Channel } from "@/lib/types";
import type { Company, CompanyWithPrimaryContact } from "@/lib/types/company";
import type { BusinessCardData } from "@/lib/gemini-client";
import { useCompanies, type SortField } from "@/hooks/useCompanies";
import { BusinessCardUpload } from "./BusinessCardUpload";
import { CompanyDetailPanel } from "./CompanyDetailPanel";

const EMPTY_COMPANY: CompanyWithPrimaryContact = {
  id: "",
  companyName: "",
  shortName: "",
  clientType: "other",
  channel: "wholesale",
  address: "",
  taxId: "",
  commissionMode: "default",
  commissionRate: 0,
  commissionFixedAmount: 0,
  paymentTerms: "",
  defaultNotes: "",
  isActive: true,
  createdAt: "",
  updatedAt: "",
  notes: "",
  primaryContact: null,
};

export function CompanyListPanel() {
  const { companies, loading, filters, setFilters, reload, addCompany, updateCompany } =
    useCompanies();

  const [selectedCompany, setSelectedCompany] =
    useState<CompanyWithPrimaryContact | null>(null);
  const [isNewCompany, setIsNewCompany] = useState(false);
  const [showCardUpload, setShowCardUpload] = useState(false);

  // OCR preview state
  const [ocrPreview, setOcrPreview] = useState<{
    company: { companyName: string; address: string };
    contact: { name: string; role: string; phone: string; phone2: string; lineId: string; email: string };
    imageUrl: string;
  } | null>(null);
  const [ocrSaving, setOcrSaving] = useState(false);

  function handleOpenNew() {
    setSelectedCompany({ ...EMPTY_COMPANY, id: `CLI-${Date.now()}` });
    setIsNewCompany(true);
  }

  function handleOpenExisting(company: CompanyWithPrimaryContact) {
    setSelectedCompany(company);
    setIsNewCompany(false);
  }

  function handleClose() {
    setSelectedCompany(null);
  }

  async function handleSave(company: Company) {
    if (isNewCompany) {
      await addCompany(company);
      handleClose();
    } else {
      await updateCompany(company);
    }
    await reload();
  }

  function handleCardRecognized(data: BusinessCardData, imageUrl: string) {
    setOcrPreview({
      company: { companyName: data.companyName, address: data.address },
      contact: {
        name: data.name,
        role: data.role,
        phone: data.phone,
        phone2: data.phone2,
        lineId: data.lineId,
        email: data.email,
      },
      imageUrl,
    });
    setShowCardUpload(false);
  }

  function updateOcrCompany(patch: Partial<{ companyName: string; address: string }>) {
    setOcrPreview((prev) => prev ? { ...prev, company: { ...prev.company, ...patch } } : prev);
  }

  function updateOcrContact(patch: Partial<{ name: string; role: string; phone: string; phone2: string; lineId: string; email: string }>) {
    setOcrPreview((prev) => prev ? { ...prev, contact: { ...prev.contact, ...patch } } : prev);
  }

  async function handleOcrConfirm() {
    if (!ocrPreview || !ocrPreview.company.companyName.trim()) return;
    setOcrSaving(true);
    try {
      const companyId = `CLI-${Date.now()}`;
      const company: Company = {
        ...EMPTY_COMPANY,
        id: companyId,
        companyName: ocrPreview.company.companyName,
        address: ocrPreview.company.address,
      };
      await addCompany(company);

      if (ocrPreview.contact.name.trim()) {
        const contact = {
          id: `CON-${Date.now()}`,
          companyId,
          name: ocrPreview.contact.name,
          role: ocrPreview.contact.role,
          phone: ocrPreview.contact.phone,
          phone2: ocrPreview.contact.phone2,
          lineId: ocrPreview.contact.lineId,
          email: ocrPreview.contact.email,
          businessCardUrl: ocrPreview.imageUrl,
          isPrimary: true,
          createdAt: "",
          updatedAt: "",
        };
        await fetch("/api/sheets/contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(contact),
        });
      }

      setOcrPreview(null);
      await reload();
    } finally {
      setOcrSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-[var(--text-secondary)]">
          共{" "}
          <span className="font-medium text-[var(--text-primary)]">
            {companies.length}
          </span>{" "}
          家公司
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCardUpload((v) => !v)}
          >
            <Upload className="h-3.5 w-3.5" />
            名片建檔
          </Button>
          <Button size="sm" onClick={handleOpenNew}>
            <Plus className="h-3.5 w-3.5" />
            新增公司
          </Button>
        </div>
      </div>

      {/* Card upload area */}
      {showCardUpload && (
        <div className="card-surface space-y-3 p-4">
          <p className="text-xs text-[var(--text-secondary)]">
            上傳名片圖片，系統將自動辨識並建立公司及聯絡人資料。
          </p>
          <BusinessCardUpload onRecognized={handleCardRecognized} />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowCardUpload(false)}
          >
            取消
          </Button>
        </div>
      )}

      {/* OCR Preview */}
      {ocrPreview && (
        <div className="card-surface space-y-4 rounded-[var(--radius-lg)] p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              名片辨識結果
            </h3>
            <span className="text-xs text-[var(--text-secondary)]">
              請確認資料是否正確，修正後按「確認建檔」
            </span>
          </div>

          {ocrPreview.imageUrl && (
            <img
              src={ocrPreview.imageUrl}
              alt="名片"
              className="h-auto max-w-[300px] rounded-[var(--radius)] border border-[var(--border)]"
            />
          )}

          <div className="space-y-3">
            <h4 className="text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">
              公司資訊
            </h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>公司名稱 *</Label>
                <Input
                  value={ocrPreview.company.companyName}
                  onChange={(e) => updateOcrCompany({ companyName: e.target.value })}
                />
              </div>
              <div>
                <Label>地址</Label>
                <Input
                  value={ocrPreview.company.address}
                  onChange={(e) => updateOcrCompany({ address: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">
              聯絡人
            </h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>姓名</Label>
                <Input
                  value={ocrPreview.contact.name}
                  onChange={(e) => updateOcrContact({ name: e.target.value })}
                />
              </div>
              <div>
                <Label>職稱</Label>
                <Input
                  value={ocrPreview.contact.role}
                  onChange={(e) => updateOcrContact({ role: e.target.value })}
                />
              </div>
              <div>
                <Label>電話</Label>
                <Input
                  value={ocrPreview.contact.phone}
                  onChange={(e) => updateOcrContact({ phone: e.target.value })}
                />
              </div>
              <div>
                <Label>電話 2</Label>
                <Input
                  value={ocrPreview.contact.phone2}
                  onChange={(e) => updateOcrContact({ phone2: e.target.value })}
                />
              </div>
              <div>
                <Label>LINE</Label>
                <Input
                  value={ocrPreview.contact.lineId}
                  onChange={(e) => updateOcrContact({ lineId: e.target.value })}
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  value={ocrPreview.contact.email}
                  onChange={(e) => updateOcrContact({ email: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOcrPreview(null)}
            >
              <X className="h-3.5 w-3.5" />
              取消
            </Button>
            <Button
              size="sm"
              disabled={ocrSaving || !ocrPreview.company.companyName.trim()}
              onClick={handleOcrConfirm}
            >
              {ocrSaving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              {ocrSaving ? "建檔中..." : "確認建檔"}
            </Button>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          className="max-w-[200px]"
          placeholder="搜尋公司名稱..."
          value={filters.keyword}
          onChange={(e) => setFilters({ ...filters, keyword: e.target.value })}
        />

        <Select
          value={filters.clientType || "__all__"}
          onValueChange={(v) =>
            setFilters({
              ...filters,
              clientType: v === "__all__" ? "" : v,
            })
          }
        >
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="所有類型" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">所有類型</SelectItem>
            {(Object.entries(CLIENT_TYPE_LABELS) as [ClientType, string][]).map(
              ([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>

        <Select
          value={filters.channel || "__all__"}
          onValueChange={(v) =>
            setFilters({
              ...filters,
              channel: v === "__all__" ? "" : v,
            })
          }
        >
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="所有通路" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">所有通路</SelectItem>
            {(Object.entries(CHANNEL_LABELS) as [Channel, { label: string; description: string }][]).map(
              ([key, { label }]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>

        <Select
          value={filters.sortBy}
          onValueChange={(v) =>
            setFilters({ ...filters, sortBy: v as SortField })
          }
        >
          <SelectTrigger className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">名稱排序</SelectItem>
            <SelectItem value="createdAt">建立時間</SelectItem>
            <SelectItem value="updatedAt">更新時間</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <Checkbox
            id="showInactive"
            checked={filters.showInactive}
            onCheckedChange={(checked) =>
              setFilters({ ...filters, showInactive: checked === true })
            }
          />
          <Label htmlFor="showInactive" className="cursor-pointer text-sm">
            顯示停用
          </Label>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-[var(--text-secondary)]">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : companies.length === 0 ? (
        <div className="py-12 text-center text-sm text-[var(--text-secondary)]">
          {filters.keyword || filters.clientType || filters.channel
            ? "無符合搜尋條件的公司"
            : "尚無公司資料"}
        </div>
      ) : (
        <div className="data-table overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left">公司名稱</th>
                <th className="text-left">類型</th>
                <th className="text-left">通路</th>
                <th className="text-left">主要聯絡人</th>
                <th className="text-left">電話</th>
                <th className="text-left">狀態</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((company) => (
                <tr
                  key={company.id}
                  className="cursor-pointer"
                  onClick={() => handleOpenExisting(company)}
                >
                  <td>
                    <div className="font-medium text-[var(--text-primary)]">
                      {company.companyName}
                    </div>
                    {company.shortName && (
                      <div className="text-xs text-[var(--text-secondary)]">
                        {company.shortName}
                      </div>
                    )}
                  </td>
                  <td className="text-[var(--text-secondary)]">
                    {CLIENT_TYPE_LABELS[company.clientType]}
                  </td>
                  <td className="text-[var(--text-secondary)]">
                    {CHANNEL_LABELS[company.channel]?.label ?? company.channel}
                  </td>
                  <td className="text-[var(--text-secondary)]">
                    {company.primaryContact?.name ?? "—"}
                  </td>
                  <td className="text-[var(--text-secondary)]">
                    {company.primaryContact?.phone ?? "—"}
                  </td>
                  <td>
                    {company.isActive ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        啟用
                      </span>
                    ) : (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                        停用
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail panel */}
      {selectedCompany && (
        <CompanyDetailPanel
          company={selectedCompany}
          onClose={handleClose}
          onSave={handleSave}
          isNew={isNewCompany}
        />
      )}
    </div>
  );
}
