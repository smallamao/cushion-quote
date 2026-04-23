"use client";

import { Loader2, Plus, Save, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useTemplates } from "@/hooks/useTemplates";
import type { FlexQuoteItem, QuoteTemplate } from "@/lib/types";

interface TemplateManagerProps {
  currentItems?: FlexQuoteItem[];
  onClose?: () => void;
}

export function TemplateManager({ currentItems, onClose }: TemplateManagerProps) {
  const { templates, loading, error, loadTemplates, saveTemplate, deleteTemplate } = useTemplates();
  const [editingTemplate, setEditingTemplate] = useState<QuoteTemplate | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const handleSaveClick = useCallback((template: QuoteTemplate) => {
    setEditingTemplate(template);
    setShowForm(true);
  }, []);

  const handleNewTemplate = useCallback(() => {
    const newTemplate: QuoteTemplate = {
      templateId: "",
      templateName: "",
      description: "",
      items: currentItems || [],
      isActive: true,
      createdAt: "",
      updatedAt: "",
    };
    setEditingTemplate(newTemplate);
    setShowForm(true);
  }, [currentItems]);

  const handleSaveTemplate = useCallback(async () => {
    if (!editingTemplate) return;

    if (!editingTemplate.templateName.trim()) {
      alert("請輸入範本名稱");
      return;
    }

    const result = await saveTemplate(editingTemplate);
    if (result.ok) {
      setShowForm(false);
      setEditingTemplate(null);
    } else {
      alert(`儲存失敗：${result.error}`);
    }
  }, [editingTemplate, saveTemplate]);

  const handleDeleteTemplate = useCallback(
    async (templateId: string, templateName: string) => {
      const confirmed = confirm(`確定要刪除範本「${templateName}」嗎？`);
      if (!confirmed) return;

      const result = await deleteTemplate(templateId);
      if (!result.ok) {
        alert(`刪除失敗：${result.error}`);
      }
    },
    [deleteTemplate],
  );

  const handleCancel = useCallback(() => {
    setShowForm(false);
    setEditingTemplate(null);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--text-tertiary)]" />
        <span className="ml-2 text-sm text-[var(--text-tertiary)]">載入中...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-[var(--radius-md)] border border-red-500/20 bg-red-500/10 p-4">
        <p className="text-sm text-red-600">載入範本時發生錯誤：{error}</p>
        <Button variant="ghost" size="sm" onClick={() => void loadTemplates()} className="mt-2">
          重試
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">報價範本管理</h3>
          <p className="text-sm text-[var(--text-tertiary)]">
            建立常用報價範本，快速套用到新報價單
          </p>
        </div>
        <Button onClick={handleNewTemplate} size="sm">
          <Plus className="h-4 w-4" />
          新增範本
        </Button>
      </div>

      {showForm && editingTemplate && (
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
          <div className="mb-4 flex items-center justify-between">
            <h4 className="font-medium text-[var(--text-primary)]">
              {editingTemplate.templateId ? "編輯範本" : "新增範本"}
            </h4>
            <Button variant="ghost" size="sm" onClick={handleCancel}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
                範本名稱 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={editingTemplate.templateName}
                onChange={(e) =>
                  setEditingTemplate({ ...editingTemplate, templateName: e.target.value })
                }
                className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                placeholder="例：標準臥室套餐"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
                範本說明
              </label>
              <textarea
                value={editingTemplate.description}
                onChange={(e) =>
                  setEditingTemplate({ ...editingTemplate, description: e.target.value })
                }
                rows={2}
                className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                placeholder="簡單描述這個範本的用途..."
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
                包含品項
              </label>
              <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-subtle)] p-3">
                {editingTemplate.items.length === 0 ? (
                  <p className="text-sm text-[var(--text-tertiary)]">
                    尚無品項
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {editingTemplate.items.map((item, idx) => (
                      <li key={idx} className="text-sm text-[var(--text-secondary)]">
                        • {item.name} {item.spec && `(${item.spec})`}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={handleCancel}>
                取消
              </Button>
              <Button size="sm" onClick={handleSaveTemplate}>
                <Save className="h-4 w-4" />
                儲存範本
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {templates.length === 0 ? (
          <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--bg-subtle)] p-8 text-center">
            <p className="text-sm text-[var(--text-tertiary)]">尚無報價範本</p>
            <Button variant="ghost" size="sm" onClick={handleNewTemplate} className="mt-2">
              建立第一個範本
            </Button>
          </div>
        ) : (
          templates.map((template) => (
            <div
              key={template.templateId}
              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] p-4 transition-colors hover:bg-[var(--bg-subtle)]"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h4 className="font-medium text-[var(--text-primary)]">
                    {template.templateName}
                  </h4>
                  {template.description && (
                    <p className="mt-1 text-sm text-[var(--text-tertiary)]">
                      {template.description}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-[var(--text-tertiary)]">
                    包含 {template.items.length} 個品項
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSaveClick(template)}
                  >
                    編輯
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      handleDeleteTemplate(template.templateId, template.templateName)
                    }
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
