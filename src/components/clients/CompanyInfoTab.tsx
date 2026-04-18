"use client";

import { Loader2, Save } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CLIENT_TYPE_LABELS, CHANNEL_LABELS, LEAD_SOURCE_LABELS } from "@/lib/constants";
import type { Channel, ClientType, CommissionMode, LeadSource } from "@/lib/types";
import type { Company } from "@/lib/types/company";
import { clampCommissionRate } from "@/lib/utils";

interface CompanyInfoTabProps {
  company: Company;
  onSave: (company: Company) => Promise<void>;
}

export function CompanyInfoTab({ company, onSave }: CompanyInfoTabProps) {
  const [draft, setDraft] = useState<Company>(company);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (draft.id !== company.id) {
    setDraft(company);
  }

  const hasChanges = JSON.stringify(draft) !== JSON.stringify(company);

  function update(patch: Partial<Company>) {
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  async function handleSave() {
    if (!draft.companyName.trim()) {
      setError("公司名稱為必填");
      return;
    }
    setError("");
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* 基本資訊 */}
      <section className="space-y-3">
        <h4 className="text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">
          基本資訊
        </h4>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>
              公司名稱 <span className="text-[var(--error)]">*</span>
            </Label>
            <Input
              value={draft.companyName}
              onChange={(e) => update({ companyName: e.target.value })}
              placeholder="輸入公司名稱"
            />
          </div>
          <div>
            <Label>簡稱</Label>
            <Input
              value={draft.shortName}
              onChange={(e) => update({ shortName: e.target.value })}
              placeholder="選填"
            />
          </div>
          <div>
            <Label>客戶類型</Label>
            <Select
              value={draft.clientType}
              onValueChange={(v) =>
                update({ clientType: v as Company["clientType"] })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(
                  Object.entries(CLIENT_TYPE_LABELS) as [
                    Company["clientType"],
                    string,
                  ][]
                ).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>通路</Label>
            <Select
              value={draft.channel}
              onValueChange={(v) =>
                update({ channel: v as Company["channel"] })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(
                  ["wholesale", "designer", "retail"] as const
                ).map((key) => (
                  <SelectItem key={key} value={key}>
                    {CHANNEL_LABELS[key].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>客戶來源</Label>
            <Select
              value={draft.leadSource ?? "unknown"}
              onValueChange={(v) => update({ leadSource: v as LeadSource })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(LEAD_SOURCE_LABELS).map(([key, { label }]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      {/* 商務設定 */}
      <section className="space-y-3">
        <h4 className="text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">
          商務設定
        </h4>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>統一編號</Label>
            <Input
              value={draft.taxId}
              onChange={(e) => update({ taxId: e.target.value })}
              placeholder="選填"
            />
          </div>
          <div>
            <Label>佣金模式</Label>
            <Select
              value={draft.commissionMode}
              onValueChange={(v) =>
                update({ commissionMode: v as Company["commissionMode"] })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">預設</SelectItem>
                <SelectItem value="price_gap">價差</SelectItem>
                <SelectItem value="rebate">回扣 %</SelectItem>
                <SelectItem value="fixed">固定金額</SelectItem>
                <SelectItem value="none">無</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {draft.commissionMode === "rebate" && (
            <div>
              <Label>回扣率 (%)</Label>
              <Input
                type="number"
                min={0}
                max={50}
                value={draft.commissionRate}
                onChange={(e) =>
                  update({
                    commissionRate: clampCommissionRate(
                      parseFloat(e.target.value) || 0,
                    ),
                  })
                }
              />
            </div>
          )}
          {draft.commissionMode === "fixed" && (
            <div>
              <Label>固定佣金金額</Label>
              <Input
                type="number"
                min={0}
                value={draft.commissionFixedAmount}
                onChange={(e) =>
                  update({
                    commissionFixedAmount: parseFloat(e.target.value) || 0,
                  })
                }
              />
            </div>
          )}
          <div>
            <Label>付款條件</Label>
            <Input
              value={draft.paymentTerms}
              onChange={(e) => update({ paymentTerms: e.target.value })}
              placeholder="例：貨到付款、月結 30 天"
            />
          </div>
          <div className="sm:col-span-2">
            <Label>預設備註</Label>
            <Input
              value={draft.defaultNotes}
              onChange={(e) => update({ defaultNotes: e.target.value })}
              placeholder="每次報價預設帶入的備註"
            />
          </div>
        </div>
      </section>

      {/* 地址 & 備註 */}
      <section className="space-y-3">
        <h4 className="text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">
          地址 & 備註
        </h4>
        <div className="space-y-3">
          <div>
            <Label>地址</Label>
            <Input
              value={draft.address}
              onChange={(e) => update({ address: e.target.value })}
              placeholder="公司地址"
            />
          </div>
          <div>
            <Label>備註</Label>
            <Textarea
              rows={3}
              value={draft.notes}
              onChange={(e) => update({ notes: e.target.value })}
              placeholder="其他備註"
            />
          </div>
        </div>
      </section>

      {error && <p className="text-xs text-[var(--error)]">{error}</p>}

      {hasChanges && (
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving} size="sm">
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {saving ? "儲存中..." : "儲存"}
          </Button>
        </div>
      )}
    </div>
  );
}
