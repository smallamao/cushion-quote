"use client";

import { Ban, Pencil } from "lucide-react";
import { useMemo, useState } from "react";

import { CATEGORY_LABELS, STOCK_STATUS_LABELS } from "@/lib/constants";
import type { Material } from "@/lib/types";
import { caiToYard, formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useIsMobile } from "@/hooks/useIsMobile";

interface MaterialTableProps {
  materials: Material[];
  onEdit?: (material: Material) => void;
  onDeactivate?: (material: Material) => void;
}

export function MaterialTable({
  materials,
  onEdit,
  onDeactivate,
}: MaterialTableProps) {
  const isMobile = useIsMobile();
  const [keyword, setKeyword] = useState("");

  const filtered = useMemo(() => {
    const normalized = keyword.trim().toLowerCase();
    if (!normalized) return materials;
    return materials.filter((material) =>
      [material.brand, material.series, material.colorCode, material.colorName].some(
        (field) => field.toLowerCase().includes(normalized),
      ),
    );
  }, [keyword, materials]);

  return (
    <div className="card-surface overflow-hidden rounded-[var(--radius-lg)]">
      <div className="border-b border-[var(--border)] px-4 py-3">
        <Input
          placeholder="搜尋品牌、系列、色號、色名⋯"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          className="max-w-xs"
        />
      </div>

      {isMobile ? (
        <div className="divide-y divide-[var(--border)]">
          {filtered.map((material) => (
            <div key={material.id} className="flex items-start justify-between px-4 py-3 gap-3">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="text-sm font-medium text-[var(--text-primary)]">
                  {material.brand}
                  {material.series ? (
                    <span className="ml-1 font-normal text-[var(--text-secondary)]">
                      {material.series}
                    </span>
                  ) : null}
                </div>
                <div className="text-xs text-[var(--text-secondary)]">
                  {material.colorCode ? (
                    <>
                      <span>{material.colorCode}</span>
                      {material.colorName ? (
                        <span className="ml-1">{material.colorName}</span>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-[var(--text-tertiary)]">—</span>
                  )}
                </div>
                <div className="flex gap-3 text-xs text-[var(--text-secondary)]">
                  <span>進價 {formatCurrency(caiToYard(material.costPerCai, material.widthCm))}/碼</span>
                  <span>牌價 {formatCurrency(caiToYard(material.listPricePerCai, material.widthCm))}/碼</span>
                </div>
              </div>
              {onEdit ? (
                <div className="flex shrink-0 gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => onEdit(material)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  {onDeactivate ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => onDeactivate(material)}
                      title="停用"
                    >
                      <Ban className="h-3.5 w-3.5 text-[var(--error)]" />
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-[var(--text-secondary)]">
              {materials.length === 0 ? "尚無材質資料" : "無符合搜尋條件的材質"}
            </div>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="px-4 py-2.5">品牌 / 系列</th>
                <th className="px-4 py-2.5">色號 / 色名</th>
                <th className="px-4 py-2.5">分類</th>
                <th className="px-4 py-2.5">進價/碼</th>
                <th className="px-4 py-2.5">牌價/碼</th>
                <th className="px-4 py-2.5">庫存</th>
                {onEdit ? <th className="w-16 px-4 py-2.5" /> : null}
              </tr>
            </thead>
            <tbody>
              {filtered.map((material) => (
                <tr key={material.id}>
                  <td className="px-4 py-2.5">
                    <div className="text-sm font-medium text-[var(--text-primary)]">
                      {material.brand}
                    </div>
                    <div className="text-xs text-[var(--text-secondary)]">
                      {material.series}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    {material.colorCode ? (
                      <>
                        <div className="text-sm">{material.colorCode}</div>
                        {material.colorName && <div className="text-xs text-[var(--text-secondary)]">{material.colorName}</div>}
                      </>
                    ) : (
                      <span className="text-xs text-[var(--text-tertiary)]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-sm">
                    {CATEGORY_LABELS[material.category]}
                  </td>
                  <td className="px-4 py-2.5 text-sm">
                    {formatCurrency(caiToYard(material.costPerCai, material.widthCm))}
                  </td>
                  <td className="px-4 py-2.5 text-sm">
                    {formatCurrency(
                      caiToYard(material.listPricePerCai, material.widthCm),
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-sm">
                    {STOCK_STATUS_LABELS[material.stockStatus]}
                  </td>
                  {onEdit ? (
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => onEdit(material)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {onDeactivate ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => onDeactivate(material)}
                            title="停用"
                          >
                            <Ban className="h-3.5 w-3.5 text-[var(--error)]" />
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={onEdit ? 7 : 6}
                    className="px-4 py-8 text-center text-sm text-[var(--text-secondary)]"
                  >
                    {materials.length === 0
                      ? "尚無材質資料"
                      : "無符合搜尋條件的材質"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
