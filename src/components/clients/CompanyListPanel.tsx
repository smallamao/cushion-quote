"use client";

import { Loader2, Plus, Upload } from "lucide-react";
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

  function handleCardRecognized(data: BusinessCardData, _imageUrl: string) {
    const newCompany: CompanyWithPrimaryContact = {
      ...EMPTY_COMPANY,
      id: `CLI-${Date.now()}`,
      companyName: data.companyName,
      address: data.address,
    };

    const contactData = {
      name: data.name,
      role: data.role,
      phone: data.phone,
      phone2: data.phone2,
      lineId: data.lineId,
      email: data.email,
    };
    sessionStorage.setItem("pendingContact", JSON.stringify(contactData));

    setShowCardUpload(false);
    setSelectedCompany(newCompany);
    setIsNewCompany(true);
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
