"use client";

import { Loader2, Save } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";

import { useSettings } from "@/hooks/useSettings";
import type { CommissionMode, SystemSettings } from "@/lib/types";
import { clampCommissionRate } from "@/lib/utils";
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
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TemplateManager } from "@/components/settings/TemplateManager";
import { BackupPanel } from "@/components/admin/BackupPanel";
import { CaseClientIdMigrationPanel } from "@/components/clients/CaseClientIdMigrationPanel";
import { CaseReferrerBackfillPanel } from "@/components/clients/CaseReferrerBackfillPanel";
import { CompanyListPanel } from "@/components/clients/CompanyListPanel";
import { EquipmentCatalogPanel } from "@/components/equipment/EquipmentCatalogPanel";
import { SuppliersManagementPanel } from "@/components/suppliers/SuppliersManagementPanel";
import { UsersManagementPanel } from "@/components/users/UsersManagementPanel";
import { DriversManagementPanel } from "@/components/settings/DriversManagementPanel";

type SettingsTab = "general" | "clients" | "equipment" | "suppliers" | "users" | "drivers";

const VALID_TABS: readonly SettingsTab[] = [
  "general",
  "clients",
  "equipment",
  "suppliers",
  "users",
  "drivers",
];

function NumberField({
  label,
  value,
  suffix,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  value: number;
  suffix?: string;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          value={value}
          onChange={(e) => {
            const raw = Number(e.target.value);
            const next = Number.isNaN(raw)
              ? 0
              : max != null || min != null
                ? Math.min(max ?? raw, Math.max(min ?? raw, raw))
                : raw;
            onChange(next);
          }}
          className="max-w-[120px]"
          min={min}
          max={max}
          step={step}
        />
        {suffix ? (
          <span className="text-xs text-[var(--text-secondary)]">
            {suffix}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function SettingsClient() {
  const { settings, loading, saving, error, save } = useSettings();
  const [draft, setDraft] = useState<SystemSettings | null>(null);
  const current = draft ?? settings;
  const dirty = draft !== null;

  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab");
  const activeTab: SettingsTab = (VALID_TABS as readonly string[]).includes(rawTab ?? "")
    ? (rawTab as SettingsTab)
    : "general";

  const handleTabChange = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === "general") {
        params.delete("tab");
      } else {
        params.set("tab", value);
      }
      const qs = params.toString();
      router.replace(qs ? `/settings?${qs}` : "/settings", { scroll: false });
    },
    [router, searchParams],
  );

  function update(patch: Partial<SystemSettings>) {
    setDraft({ ...current, ...patch });
  }

  function updateMultiplier(
    ch: "wholesale" | "designer" | "retail" | "luxury_retail",
    value: number,
  ) {
    setDraft({
      ...current,
      channelMultipliers: { ...current.channelMultipliers, [ch]: value },
    });
  }

  async function handleSave() {
    await save(current);
    setDraft(null);
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-12 text-sm text-[var(--text-secondary)]">
        <Loader2 className="h-4 w-4 animate-spin" />
        讀取設定中...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">
            系統設定
          </h1>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            修改後按儲存寫入 Google Sheets
          </p>
        </div>
        <div className="flex items-center gap-3">
          {error && (
            <span className="text-xs text-[var(--error)]">{error}</span>
          )}
          {dirty && activeTab === "general" && (
            <Button size="sm" disabled={saving} onClick={handleSave}>
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              {saving ? "儲存中..." : "儲存設定"}
            </Button>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="general">一般設定</TabsTrigger>
          <TabsTrigger value="clients">客戶主檔</TabsTrigger>
          <TabsTrigger value="equipment">設備型錄</TabsTrigger>
          <TabsTrigger value="suppliers">廠商管理</TabsTrigger>
          <TabsTrigger value="users">使用者與權限</TabsTrigger>
          <TabsTrigger value="drivers">司機管理</TabsTrigger>
          <TabsTrigger value="maintenance">系統維護</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="card-surface rounded-[var(--radius-lg)]">
              <div className="border-b border-[var(--border)] px-6 py-3">
                <span className="text-sm font-medium">通路倍率</span>
              </div>
              <div className="space-y-5 px-6 py-4">
                {(["wholesale", "designer", "retail", "luxury_retail"] as const).map((ch) => {
                  const labels = {
                    wholesale: "批發",
                    designer: "設計師",
                    retail: "屋主",
                    luxury_retail: "豪華屋主",
                  } as const;
                  return (
                    <div key={ch} className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-[var(--text-secondary)]">
                          {labels[ch]}
                        </span>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-[var(--text-tertiary)]">
                            ×
                          </span>
                          <Input
                            type="number"
                            value={current.channelMultipliers[ch]}
                            onChange={(e) =>
                              updateMultiplier(
                                ch,
                                Math.round(Number(e.target.value) * 100) / 100,
                              )
                            }
                            min={1}
                            max={4}
                            step={0.05}
                            className="h-7 w-20 text-right text-sm font-medium"
                          />
                        </div>
                      </div>
                      <Slider
                        value={[current.channelMultipliers[ch]]}
                        onValueChange={([v]) => updateMultiplier(ch, v)}
                        min={1}
                        max={4}
                        step={0.05}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="card-surface rounded-[var(--radius-lg)]">
              <div className="border-b border-[var(--border)] px-6 py-3">
                <span className="text-sm font-medium">定價參數</span>
              </div>
              <div className="space-y-4 px-6 py-4">
                <NumberField
                  label="品質溢價"
                  value={current.qualityPremium}
                  suffix="%"
                  onChange={(v) => update({ qualityPremium: v })}
                />
                <NumberField
                  label="損耗率"
                  value={current.wasteRate}
                  suffix="%"
                  onChange={(v) => update({ wasteRate: v })}
                />
                <NumberField
                  label="布料折數（牌價 ×）"
                  value={current.fabricDiscount}
                  suffix=""
                  onChange={(v) => update({ fabricDiscount: Math.round(v * 100) / 100 })}
                />
                <NumberField
                  label="營業稅"
                  value={current.taxRate}
                  suffix="%"
                  onChange={(v) => update({ taxRate: v })}
                />
                <div>
                  <Label>佣金模式</Label>
                  <Select
                    value={current.commissionMode}
                    onValueChange={(v) =>
                      update({ commissionMode: v as CommissionMode })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="price_gap">賺價差（模式 A）</SelectItem>
                      <SelectItem value="rebate">返佣（模式 B）</SelectItem>
                      <SelectItem value="fixed">固定金額</SelectItem>
                      <SelectItem value="none">無佣金</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {current.commissionMode === "rebate" && (
                  <NumberField
                    label="返佣比例"
                    value={current.commissionRate}
                    suffix="%"
                    min={0}
                    max={50}
                    step={0.1}
                    onChange={(v) =>
                      update({ commissionRate: clampCommissionRate(v) })
                    }
                  />
                )}
                {current.commissionMode === "fixed" && (
                  <NumberField
                    label="固定佣金金額"
                    value={current.commissionFixedAmount}
                    min={0}
                    max={500000}
                    onChange={(v) =>
                      update({ commissionFixedAmount: Math.max(0, Math.round(v)) })
                    }
                  />
                )}
                <NumberField
                  label="報價有效天數"
                  value={current.quoteValidityDays}
                  suffix="天"
                  onChange={(v) => update({ quoteValidityDays: v })}
                />
              </div>
            </div>

            <div className="card-surface rounded-[var(--radius-lg)] lg:col-span-2">
              <div className="border-b border-[var(--border)] px-6 py-3">
                <span className="text-sm font-medium">公司資訊</span>
                <span className="ml-2 text-xs text-[var(--text-secondary)]">
                  顯示於 PDF 報價單
                </span>
              </div>
              <div className="grid gap-4 px-6 py-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <Label>公司簡稱</Label>
                  <Input
                    value={current.companyName}
                    onChange={(e) => update({ companyName: e.target.value })}
                  />
                </div>
                <div>
                  <Label>公司全名</Label>
                  <Input
                    value={current.companyFullName}
                    onChange={(e) =>
                      update({ companyFullName: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>統一編號：</Label>
                  <Input
                    value={current.companyTaxId}
                    onChange={(e) =>
                      update({ companyTaxId: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>電話</Label>
                  <Input
                    value={current.companyPhone}
                    onChange={(e) =>
                      update({ companyPhone: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>傳真</Label>
                  <Input
                    value={current.companyFax}
                    onChange={(e) => update({ companyFax: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    value={current.companyEmail}
                    onChange={(e) =>
                      update({ companyEmail: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>LINE</Label>
                  <Input
                    value={current.companyLine}
                    onChange={(e) =>
                      update({ companyLine: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>地址</Label>
                  <Input
                    value={current.companyAddress}
                    onChange={(e) =>
                      update({ companyAddress: e.target.value })
                    }
                  />
                </div>
                <div className="md:col-span-2">
                  <Label>工廠 / 採購交貨地址</Label>
                  <Input
                    value={current.factoryAddress}
                    onChange={(e) =>
                      update({ factoryAddress: e.target.value })
                    }
                    placeholder="236新北市土城區廣福街77巷6-6號"
                  />
                  <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">
                    新增採購單時會自動填入作為預設交貨地址
                  </p>
                </div>
              </div>
            </div>

            <div className="card-surface rounded-[var(--radius-lg)] lg:col-span-2">
              <div className="border-b border-[var(--border)] px-6 py-3">
                <span className="text-sm font-medium">報價範本管理</span>
              </div>
              <div className="px-6 py-4">
                <TemplateManager />
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="clients">
          <div className="space-y-4">
            <div className="card-surface rounded-[var(--radius-lg)]">
              <div className="border-b border-[var(--border)] px-6 py-3">
                <span className="text-sm font-medium">客戶主檔</span>
              </div>
              <div className="px-6 py-4">
                <CompanyListPanel />
              </div>
            </div>
            <div className="card-surface rounded-[var(--radius-lg)]">
              <div className="border-b border-[var(--border)] px-6 py-3">
                <span className="text-sm font-medium">資料維護工具</span>
              </div>
              <div className="space-y-6 px-6 py-4">
                <CaseClientIdMigrationPanel />
                <CaseReferrerBackfillPanel />
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="equipment">
          <div className="card-surface rounded-[var(--radius-lg)]">
            <div className="border-b border-[var(--border)] px-6 py-3">
              <span className="text-sm font-medium">設備型錄</span>
            </div>
            <div className="px-6 py-4">
              <EquipmentCatalogPanel />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="suppliers">
          <div className="card-surface rounded-[var(--radius-lg)]">
            <div className="border-b border-[var(--border)] px-6 py-3">
              <span className="text-sm font-medium">廠商管理</span>
            </div>
            <div className="px-6 py-4">
              <SuppliersManagementPanel />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="users">
          <div className="card-surface rounded-[var(--radius-lg)]">
            <div className="border-b border-[var(--border)] px-6 py-3">
              <span className="text-sm font-medium">使用者與權限</span>
            </div>
            <div className="px-6 py-4">
              <UsersManagementPanel />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="drivers">
          <div className="card-surface rounded-[var(--radius-lg)]">
            <div className="border-b border-[var(--border)] px-6 py-3">
              <span className="text-sm font-medium">司機管理</span>
              <span className="ml-2 text-xs text-[var(--text-secondary)]">出貨通知使用的司機資料</span>
            </div>
            <div className="px-6 py-4">
              <DriversManagementPanel />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="maintenance">
          <div className="card-surface rounded-[var(--radius-lg)]">
            <div className="border-b border-[var(--border)] px-6 py-3">
              <span className="text-sm font-medium">系統維護</span>
            </div>
            <div className="px-6 py-4">
              <BackupPanel />
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
