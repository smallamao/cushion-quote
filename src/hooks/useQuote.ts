"use client";

import { useMemo, useState } from "react";

import { DEFAULT_SETTINGS, METHODS } from "@/lib/constants";
import { calculateQuote } from "@/lib/pricing-engine";
import type { AddonItem, Channel, QuoteLineItem, SystemSettings } from "@/lib/types";

export function createEmptyLineItem(): QuoteLineItem {
  return {
    id: crypto.randomUUID(),
    itemName: "未命名品項",
    method: "single_headboard",
    widthCm: 180,
    heightCm: 120,
    qty: 1,
    foamThickness: 1,
    material: null,
    customMaterialCost: 0,
    useListPrice: false,
    extras: [],
    powerHoleCount: 1,
    notes: "",
  };
}

export function useQuote(initialSettings: SystemSettings = DEFAULT_SETTINGS) {
  const [channel, setChannel] = useState<Channel>("wholesale");
  const [lineItems, setLineItems] = useState<QuoteLineItem[]>([createEmptyLineItem()]);
  const [addons, setAddons] = useState<AddonItem[]>([]);

  const result = useMemo(
    () =>
      calculateQuote(
        lineItems.map((item) => ({ item, method: METHODS[item.method] })),
        addons,
        initialSettings,
        channel,
      ),
    [addons, channel, initialSettings, lineItems],
  );

  return { channel, setChannel, lineItems, setLineItems, addons, setAddons, result };
}
