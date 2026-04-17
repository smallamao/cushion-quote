"use client";

import { Ban, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { CLIENT_TYPE_LABELS, CHANNEL_LABELS } from "@/lib/constants";
import type { Company, CompanyWithPrimaryContact } from "@/lib/types/company";
import { CompanyInfoTab } from "./CompanyInfoTab";
import { ContactsTab } from "./ContactsTab";
import { QuoteHistoryTab } from "./QuoteHistoryTab";

interface CompanyDetailPanelProps {
  company: CompanyWithPrimaryContact;
  onClose: () => void;
  onSave: (company: Company) => Promise<void>;
  isNew?: boolean;
}

export function CompanyDetailPanel({
  company,
  onClose,
  onSave,
  isNew = false,
}: CompanyDetailPanelProps) {
  async function handleDeactivate() {
    const confirmed = confirm(`確定要停用「${company.companyName}」嗎？`);
    if (!confirmed) return;
    await onSave({ ...company, isActive: false });
    onClose();
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[480px] flex-col bg-[var(--bg-primary)] shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[var(--border)] px-6 py-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              {isNew ? "新增公司" : company.companyName}
            </h2>
            {!isNew && (
              <div className="flex flex-wrap gap-1.5">
                <span className="rounded-full bg-[var(--bg-secondary)] px-2 py-0.5 text-xs text-[var(--text-secondary)]">
                  {CLIENT_TYPE_LABELS[company.clientType]}
                </span>
                <span className="rounded-full bg-[var(--bg-secondary)] px-2 py-0.5 text-xs text-[var(--text-secondary)]">
                  {CHANNEL_LABELS[company.channel]?.label ?? company.channel}
                </span>
                {company.createdAt && (
                  <span className="rounded-full bg-[var(--bg-secondary)] px-2 py-0.5 text-xs text-[var(--text-secondary)]">
                    建立 {company.createdAt.slice(0, 10)}
                  </span>
                )}
              </div>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="info" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="w-full justify-start border-b border-[var(--border)] bg-transparent px-6">
            <TabsTrigger value="info">公司資料</TabsTrigger>
            {!isNew && (
              <TabsTrigger value="contacts">聯絡人</TabsTrigger>
            )}
            {!isNew && (
              <TabsTrigger value="quotes">報價歷史</TabsTrigger>
            )}
          </TabsList>

          <div className="flex-1 overflow-y-auto">
            <TabsContent value="info" className="mt-0 px-6 py-4">
              <CompanyInfoTab company={company} onSave={onSave} />
            </TabsContent>

            {!isNew && (
              <TabsContent value="contacts" className="mt-0 px-6 py-4">
                <ContactsTab companyId={company.id} />
              </TabsContent>
            )}

            {!isNew && (
              <TabsContent value="quotes" className="mt-0 px-6 py-4">
                <QuoteHistoryTab
                  companyId={company.id}
                  companyName={company.companyName}
                />
              </TabsContent>
            )}
          </div>
        </Tabs>

        {/* Footer */}
        {!isNew && (
          <div className="border-t border-[var(--border)] px-6 py-3">
            <Button
              variant="ghost"
              size="sm"
              className="text-[var(--error)]"
              onClick={handleDeactivate}
            >
              <Ban className="h-3.5 w-3.5" />
              停用公司
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
