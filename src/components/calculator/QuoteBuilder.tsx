"use client";

import { FilePlus, Loader2, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { useMaterials } from "@/hooks/useMaterials";
import { createEmptyLineItem, useQuote } from "@/hooks/useQuote";
import { useSettings } from "@/hooks/useSettings";
import { ADDON_DEFS, CATEGORY_LABELS, CHANNEL_LABELS, EXTRA_DEFS, METHODS, STOCK_STATUS_LABELS } from "@/lib/constants";
import type { AddonType, Channel, ExtraItem, Material, Method, QuoteLineItem, QuoteLineRecord, QuoteRecord } from "@/lib/types";
import { caiToYard, formatCurrency, formatNumber, slugDate, yardToCai } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

function updateLineItem(list: QuoteLineItem[], id: string, updater: (item: QuoteLineItem) => QuoteLineItem) {
  return list.map((item) => (item.id === id ? updater(item) : item));
}

function defaultThickness(method: Method) {
  return METHODS[method].baseThickness;
}

function materialLabel(material: Material) {
  return `${material.brand} ${material.series} / ${material.colorCode} ${material.colorName}`;
}

export function QuoteBuilder() {
  const { settings, setSettings, loading: settingsLoading } = useSettings();
  const { materials, loading: materialsLoading, source, reload } = useMaterials();
  const { channel, setChannel, lineItems, setLineItems, addons, setAddons, result } = useQuote(settings);
  const [clientName, setClientName] = useState("");
  const [clientContact, setClientContact] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectAddress, setProjectAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [includeTax, setIncludeTax] = useState(true);
  const [showCost, setShowCost] = useState(false);

  const materialsByCategory = useMemo(() => {
    return materials.reduce<Record<string, Material[]>>((acc, material) => {
      const category = material.category;
      const current = acc[category] ?? [];
      acc[category] = [...current, material];
      return acc;
    }, {});
  }, [materials]);

  function handleMethodChange(itemId: string, nextMethod: Method) {
    setLineItems(
      updateLineItem(lineItems, itemId, (item) => ({
        ...item,
        method: nextMethod,
        foamThickness: defaultThickness(nextMethod),
      })),
    );
  }

  function toggleExtra(itemId: string, extra: ExtraItem, checked: boolean) {
    setLineItems(
      updateLineItem(lineItems, itemId, (item) => ({
        ...item,
        extras: checked ? [...item.extras, extra] : item.extras.filter((entry) => entry !== extra),
      })),
    );
  }

  function toggleAddon(type: AddonType, checked: boolean) {
    if (checked) {
      setAddons([...addons, { type, qty: 1 }]);
      return;
    }
    setAddons(addons.filter((addon) => addon.type !== type));
  }

  function addNewLineItem() {
    setLineItems([...lineItems, createEmptyLineItem()]);
  }

  function duplicateLineItem(lineItem: QuoteLineItem) {
    setLineItems([
      ...lineItems,
      {
        ...lineItem,
        id: crypto.randomUUID(),
        itemName: `${lineItem.itemName} 複製`,
      },
    ]);
  }

  function removeLineItem(id: string) {
    if (lineItems.length === 1) {
      setLineItems([createEmptyLineItem()]);
      return;
    }
    setLineItems(lineItems.filter((item) => item.id !== id));
  }

  async function fetchNextQuoteId(): Promise<string> {
    try {
      const res = await fetch("/api/sheets/quotes/next-id");
      const data = (await res.json()) as { quoteId: string };
      return data.quoteId;
    } catch {
      return `CQ-${slugDate()}-001`;
    }
  }

  const [quoteSaving, setQuoteSaving] = useState(false);

  async function handleSaveQuote() {
    setQuoteSaving(true);
    try {
      const quoteId = await fetchNextQuoteId();
      const now = new Date().toISOString().slice(0, 10);

      const header: QuoteRecord = {
        quoteId,
        quoteDate: now,
        clientName,
        clientContact,
        clientPhone,
        projectName,
        projectAddress,
        channel,
        totalBeforeTax: result.subtotalBeforeTax,
        tax: includeTax ? result.tax : 0,
        total: includeTax ? result.grandTotal : result.subtotalBeforeTax,
        commissionMode: settings.commissionMode,
        commissionRate: settings.commissionRate,
        commissionAmount: result.commissionAmount,
        status: "draft",
        createdBy: "",
        notes,
        createdAt: now,
        updatedAt: now,
        clientId: "",
      };

      const lines: QuoteLineRecord[] = result.lineResults.map((line, idx) => ({
        quoteId,
        lineNumber: idx + 1,
        itemName: line.item.itemName,
        method: line.item.method,
        widthCm: line.item.widthCm,
        heightCm: line.item.heightCm,
        caiCount: line.caiCount,
        foamThickness: line.item.foamThickness ?? 0,
        materialId: line.item.material?.id ?? "",
        materialDesc: line.item.material ? `${line.item.material.brand} ${line.item.material.colorCode}` : "自訂面料",
        qty: line.item.qty,
        laborRate: line.laborRate,
        materialRate: line.materialRate,
        extras: line.item.extras.join(","),
        unitPrice: line.channelPrices[channel].perCai,
        piecePrice: line.channelPrices[channel].perPiece,
        subtotal: line.channelPrices[channel].total,
        notes: line.item.notes,
      }));

      const response = await fetch("/api/sheets/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ header, lines }),
      });

      if (!response.ok) throw new Error("儲存失敗");
      alert(`報價單 ${quoteId} 已儲存`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "儲存失敗");
    } finally {
      setQuoteSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="hero-grid">
        <Card className="overflow-hidden">
          <CardHeader className="bg-[linear-gradient(120deg,rgba(175,93,51,0.14),rgba(59,122,87,0.05))]">
            <CardTitle className="text-2xl">馬鈴薯沙發報價系統</CardTitle>
            <CardDescription>依 spec v2.1 建立的雙欄工作台，左側編輯，右側即時摘要與三通路價格。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl bg-white/70 p-4">
              <div className="text-sm text-[var(--muted)]">材質來源</div>
              <div className="mt-2 text-xl font-bold capitalize">{source}</div>
            </div>
            <div className="rounded-2xl bg-white/70 p-4">
              <div className="text-sm text-[var(--muted)]">品質溢價</div>
              <div className="mt-2 text-xl font-bold">+{settings.qualityPremium}%</div>
            </div>
            <div className="rounded-2xl bg-white/70 p-4">
              <div className="text-sm text-[var(--muted)]">預設損耗率</div>
              <div className="mt-2 text-xl font-bold">+{settings.wasteRate}%</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>報價資訊</CardTitle>
            <CardDescription>先填客戶與案場，後續串接 Sheet 3 / Sheet 4 時直接映射。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label htmlFor="clientName">客戶名稱</Label>
                <Input id="clientName" value={clientName} onChange={(event) => setClientName(event.target.value)} />
              </div>
              <div>
                <Label htmlFor="clientContact">聯絡人</Label>
                <Input id="clientContact" value={clientContact} onChange={(event) => setClientContact(event.target.value)} />
              </div>
              <div>
                <Label htmlFor="clientPhone">電話</Label>
                <Input id="clientPhone" value={clientPhone} onChange={(event) => setClientPhone(event.target.value)} />
              </div>
              <div>
                <Label htmlFor="projectName">案場名稱</Label>
                <Input id="projectName" value={projectName} onChange={(event) => setProjectName(event.target.value)} />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="projectAddress">案場地址</Label>
                <Input id="projectAddress" value={projectAddress} onChange={(event) => setProjectAddress(event.target.value)} />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="quoteNotes">備註</Label>
                <Textarea id="quoteNotes" value={notes} onChange={(event) => setNotes(event.target.value)} />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
                <Checkbox checked={includeTax} onCheckedChange={(checked) => setIncludeTax(checked === true)} />
                報價單含稅
              </label>
              <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
                <Checkbox checked={showCost} onCheckedChange={(checked) => setShowCost(checked === true)} />
                PDF 顯示進價
              </label>
              <div className="flex-1" />
              <Button type="button" variant="outline" onClick={() => reload()}>
                <RefreshCw className="mr-2 h-4 w-4" />
                重新載入材質
              </Button>
              <Button type="button" variant="outline" disabled={quoteSaving} onClick={handleSaveQuote}>
                {quoteSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {quoteSaving ? "儲存中..." : "儲存報價"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => {
                setLineItems([createEmptyLineItem()]);
                setAddons([]);
                setClientName("");
                setClientContact("");
                setClientPhone("");
                setProjectName("");
                setProjectAddress("");
                setNotes("");
              }}>
                <FilePlus className="mr-2 h-4 w-4" />
                新建報價
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      <Tabs value={channel} onValueChange={(value) => setChannel(value as Channel)}>
        <TabsList>
          {(["wholesale", "designer", "retail"] as const).map((entry) => (
            <TabsTrigger key={entry} value={entry}>
              {CHANNEL_LABELS[entry].label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <section className="calculator-grid">
        <div className="space-y-5">
          <div className="flex justify-end">
            <Button type="button" onClick={addNewLineItem}>
              <Plus className="mr-2 h-4 w-4" />
              新增項目
            </Button>
          </div>
          {lineItems.map((lineItem, index) => {
            const method = METHODS[lineItem.method];
            const calculation = result.lineResults[index];

            return (
              <Card key={lineItem.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <CardTitle>品項 {index + 1}</CardTitle>
                      <CardDescription>{method.label} / {formatNumber(calculation?.caiCount ?? 0)} 才</CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" variant="ghost" onClick={() => duplicateLineItem(lineItem)}>
                        <Plus className="mr-2 h-4 w-4" />
                        複製
                      </Button>
                      <Button type="button" variant="ghost" onClick={() => removeLineItem(lineItem.id)}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        刪除
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label>品項名稱</Label>
                      <Input
                        value={lineItem.itemName}
                        onChange={(event) =>
                          setLineItems(
                            updateLineItem(lineItems, lineItem.id, (item) => ({ ...item, itemName: event.target.value })),
                          )
                        }
                      />
                    </div>
                    <div>
                      <Label>作法</Label>
                      <Select value={lineItem.method} onValueChange={(value) => handleMethodChange(lineItem.id, value as Method)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.values(METHODS).map((entry) => (
                            <SelectItem key={entry.id} value={entry.id}>
                              {entry.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>寬度 cm</Label>
                      <Input
                        type="number"
                        value={lineItem.widthCm}
                        onChange={(event) =>
                          setLineItems(
                            updateLineItem(lineItems, lineItem.id, (item) => ({ ...item, widthCm: Number(event.target.value) })),
                          )
                        }
                      />
                    </div>
                    <div>
                      <Label>高度 cm</Label>
                      <Input
                        type="number"
                        value={lineItem.heightCm}
                        onChange={(event) =>
                          setLineItems(
                            updateLineItem(lineItems, lineItem.id, (item) => ({ ...item, heightCm: Number(event.target.value) })),
                          )
                        }
                      />
                    </div>
                    <div>
                      <Label>數量</Label>
                      <Input
                        type="number"
                        min={1}
                        value={lineItem.qty}
                        onChange={(event) =>
                          setLineItems(
                            updateLineItem(lineItems, lineItem.id, (item) => ({ ...item, qty: Math.max(1, Number(event.target.value)) })),
                          )
                        }
                      />
                    </div>
                    <div>
                      <Label>泡棉厚度</Label>
                      <Select
                        value={String(lineItem.foamThickness ?? 0)}
                        onValueChange={(value) =>
                          setLineItems(
                            updateLineItem(lineItems, lineItem.id, (item) => ({
                              ...item,
                              foamThickness: method.baseThickness === null ? null : Number(value),
                            })),
                          )
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(method.thicknessOptions.length > 0 ? method.thicknessOptions : [0]).map((option) => (
                            <SelectItem key={option} value={String(option)}>
                              {method.baseThickness === null ? "無泡棉" : `${option}"`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label>選擇材質</Label>
                    <Select
                      value={lineItem.material?.id ?? "custom"}
                      onValueChange={(value) =>
                        setLineItems(
                          updateLineItem(lineItems, lineItem.id, (item) => ({
                            ...item,
                            material: value === "custom" ? null : materials.find((material) => material.id === value) ?? null,
                          })),
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="選擇材質或自訂" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="custom">✏️ 自訂面料（手動輸入成本）</SelectItem>
                        {Object.entries(materialsByCategory).flatMap(([category, entries]) =>
                          entries.map((material) => (
                            <SelectItem key={`${category}-${material.id}`} value={material.id}>
                              {materialLabel(material)}
                            </SelectItem>
                          )),
                        )}
                      </SelectContent>
                    </Select>

                    {lineItem.material ? (
                      <div className="mt-3 rounded-2xl bg-white/70 p-4 text-sm">
                        <div className="font-semibold">{materialLabel(lineItem.material)}</div>
                        <div className="mt-1 flex flex-wrap gap-3 text-[var(--muted)]">
                          <span>{CATEGORY_LABELS[lineItem.material.category]}</span>
                          <span>{STOCK_STATUS_LABELS[lineItem.material.stockStatus]}</span>
                          <span>進價 {formatCurrency(caiToYard(lineItem.material.costPerCai, lineItem.material.widthCm))}/碼</span>
                            <span>牌價 {formatCurrency(caiToYard(lineItem.material.listPricePerCai, lineItem.material.widthCm))}/碼</span>
                        </div>
                        <label className="mt-3 flex items-center gap-2 text-sm text-[var(--muted)]">
                          <Checkbox
                            checked={lineItem.useListPrice}
                            onCheckedChange={(checked) =>
                              setLineItems(
                                updateLineItem(lineItems, lineItem.id, (item) => ({ ...item, useListPrice: checked === true })),
                              )
                            }
                          />
                          以牌價計算（預設用進價）
                        </label>
                      </div>
                    ) : (
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <div>
                          <Label>面料成本（元/碼）</Label>
                          <Input
                            type="number"
                            value={caiToYard(lineItem.customMaterialCost ?? 0, 135)}
                            onChange={(event) =>
                              setLineItems(
                                updateLineItem(lineItems, lineItem.id, (item) => ({
                                  ...item,
                                  customMaterialCost: yardToCai(Number(event.target.value), 135),
                                })),
                              )
                            }
                            placeholder="供應商報價/碼"
                          />
                          <div className="mt-1 text-xs text-[var(--muted)]">
                            ≈ {formatCurrency(lineItem.customMaterialCost ?? 0)}/才（以 135cm 門幅換算）
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-3">
                      <div className="section-title">其他加工</div>
                      {Object.entries(EXTRA_DEFS).map(([key, extra]) => (
                        <label key={key} className="flex items-center justify-between rounded-2xl bg-white/70 px-4 py-3 text-sm">
                          <span>{extra.label}</span>
                          <div className="flex items-center gap-3">
                            <span className="text-[var(--muted)]">{formatCurrency(extra.unitCost)}/{extra.unit}</span>
                            <Checkbox
                              checked={lineItem.extras.includes(key as ExtraItem)}
                              onCheckedChange={(checked) => toggleExtra(lineItem.id, key as ExtraItem, checked === true)}
                            />
                          </div>
                        </label>
                      ))}
                      {lineItem.extras.includes("power_hole") ? (
                        <div>
                          <Label>電源孔數量</Label>
                          <Input
                            type="number"
                            min={1}
                            value={lineItem.powerHoleCount}
                            onChange={(event) =>
                              setLineItems(
                                updateLineItem(lineItems, lineItem.id, (item) => ({
                                  ...item,
                                  powerHoleCount: Math.max(1, Number(event.target.value)),
                                })),
                              )
                            }
                          />
                        </div>
                      ) : null}
                    </div>

                    <div className="space-y-4">
                      <div className="section-title">品項備註</div>
                      <Textarea
                        value={lineItem.notes}
                        onChange={(event) =>
                          setLineItems(
                            updateLineItem(lineItems, lineItem.id, (item) => ({ ...item, notes: event.target.value })),
                          )
                        }
                      />
                      <div className="rounded-2xl bg-[rgba(59,122,87,0.08)] p-4">
                        <div className="text-sm text-[var(--muted)]">工資 / 才</div>
                        <div className="mt-1 text-2xl font-bold">{formatCurrency(calculation?.laborRate ?? 0)}</div>
                        <div className="mt-3 text-sm text-[var(--muted)]">面料 / 才（含損耗）</div>
                        <div className="mt-1 text-xl font-semibold">{formatCurrency(calculation?.materialRate ?? 0)}</div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          <Card>
            <CardHeader>
              <CardTitle>附加工程</CardTitle>
              <CardDescription>百分比加價套在品項通路小計，固定費另加。</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {Object.entries(ADDON_DEFS).map(([key, addon]) => {
                const current = addons.find((item) => item.type === key);

                return (
                  <div key={key} className="rounded-2xl bg-white/70 p-4">
                    <label className="flex items-center justify-between gap-3 text-sm">
                      <div>
                        <div className="font-semibold">{addon.label}</div>
                        <div className="text-[var(--muted)]">
                          {addon.isPercent ? `+${addon.unitCost}%` : `${formatCurrency(addon.unitCost)}/${addon.unit}`}
                        </div>
                      </div>
                      <Checkbox checked={Boolean(current)} onCheckedChange={(checked) => toggleAddon(key as AddonType, checked === true)} />
                    </label>
                    {!addon.isPercent && current ? (
                      <div className="mt-3">
                        <Label>數量</Label>
                        <Input
                          type="number"
                          min={1}
                          value={current.qty}
                          onChange={(event) =>
                            setAddons(addons.map((entry) => (entry.type === key ? { ...entry, qty: Math.max(1, Number(event.target.value)) } : entry)))
                          }
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>通路倍率</CardTitle>
              <CardDescription>可即時調整，持久化請到系統設定頁儲存。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {(["wholesale", "designer", "retail"] as const).map((entry) => (
                <div key={entry} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>{CHANNEL_LABELS[entry].label}</span>
                    <div className="flex items-center gap-1">
                      <span className="text-[var(--muted)]">×</span>
                      <Input
                        type="number"
                        value={settings.channelMultipliers[entry]}
                        onChange={(e) => {
                          const v = Math.round(Number(e.target.value) * 100) / 100;
                          setSettings({ ...settings, channelMultipliers: { ...settings.channelMultipliers, [entry]: v } });
                        }}
                        min={1}
                        max={4}
                        step={0.05}
                        className="h-8 w-20 text-right font-semibold"
                      />
                    </div>
                  </div>
                  <Slider
                    value={[settings.channelMultipliers[entry]]}
                    onValueChange={([v]) => setSettings({ ...settings, channelMultipliers: { ...settings.channelMultipliers, [entry]: v } })}
                    min={1}
                    max={4}
                    step={0.05}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>即時摘要</CardTitle>
              <CardDescription>{settingsLoading || materialsLoading ? "資料載入中..." : "價格依目前選擇的通路即時更新。"}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {result.lineResults.map((line) => (
                <div key={line.item.id} className="rounded-2xl bg-white/70 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">{line.item.itemName}</div>
                      <div className="mt-1 text-sm text-[var(--muted)]">
                        {METHODS[line.item.method].label} / {formatNumber(line.caiCount)} 才 / 數量 {line.item.qty}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-[var(--muted)]">每片</div>
                      <div className="text-lg font-bold">{formatCurrency(line.channelPrices[channel].perPiece)}</div>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm text-[var(--muted)]">
                    <div className="flex justify-between">
                      <span>每才報價</span>
                      <span>{formatCurrency(line.channelPrices[channel].perCai)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>毛利率</span>
                      <span>{line.channelPrices[channel].margin}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>小計</span>
                      <span className="font-semibold text-[var(--foreground)]">{formatCurrency(line.channelPrices[channel].total)}</span>
                    </div>
                  </div>
                </div>
              ))}
              <div className="rounded-[28px] bg-[rgba(127,56,23,0.92)] p-5 text-white">
                <div className="flex justify-between text-sm text-white/70">
                  <span>品項小計</span>
                  <span>{formatCurrency(result.itemsSubtotal)}</span>
                </div>
                <div className="mt-2 flex justify-between text-sm text-white/70">
                  <span>附加工程</span>
                  <span>{formatCurrency(result.addonFixed + result.rushSurcharge)}</span>
                </div>
                <div className="mt-2 flex justify-between text-sm text-white/70">
                  <span>營業稅 {settings.taxRate}%</span>
                  <span>{formatCurrency(result.tax)}</span>
                </div>
                <div className="mt-4 flex justify-between text-xl font-bold">
                  <span>總計</span>
                  <span>{formatCurrency(result.grandTotal)}</span>
                </div>
                <div className="mt-3 text-xs text-white/70">
                  佣金模式：{settings.commissionMode} / 返佣 {formatCurrency(result.commissionAmount)}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
