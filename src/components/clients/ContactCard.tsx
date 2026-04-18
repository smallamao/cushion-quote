"use client";

import { Check, MoreHorizontal, Pencil, Star, Trash2, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BusinessCardUpload } from "./BusinessCardUpload";
import type { Contact } from "@/lib/types/company";
import type { BusinessCardData } from "@/lib/gemini-client";

interface ContactCardProps {
  contact: Contact;
  onUpdate: (contact: Contact) => Promise<void>;
  onDelete: (contactId: string) => Promise<void>;
  onSetPrimary: (contactId: string) => Promise<void>;
}

export function ContactCard({
  contact,
  onUpdate,
  onDelete,
  onSetPrimary,
}: ContactCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(contact);
  const [showMenu, setShowMenu] = useState(false);
  const [saving, setSaving] = useState(false);

  function update(patch: Partial<Contact>) {
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  function handleRecognized(data: BusinessCardData, imageUrls: string[]) {
    setDraft((prev) => ({
      ...prev,
      name: data.name || prev.name,
      role: data.role || prev.role,
      phone: data.phone || prev.phone,
      phone2: data.phone2 || prev.phone2,
      lineId: data.lineId || prev.lineId,
      email: data.email || prev.email,
      businessCardUrl: imageUrls[0] || prev.businessCardUrl,
    }));
    if (!editing) setEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onUpdate(draft);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setDraft(contact);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="space-y-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>姓名</Label>
            <Input value={draft.name} onChange={(e) => update({ name: e.target.value })} />
          </div>
          <div>
            <Label>角色 / 職稱</Label>
            <Input value={draft.role} onChange={(e) => update({ role: e.target.value })} placeholder="老闆、採購、設計師..." />
          </div>
          <div>
            <Label>電話</Label>
            <Input value={draft.phone} onChange={(e) => update({ phone: e.target.value })} />
          </div>
          <div>
            <Label>電話 2</Label>
            <Input value={draft.phone2} onChange={(e) => update({ phone2: e.target.value })} />
          </div>
          <div>
            <Label>LINE</Label>
            <Input value={draft.lineId} onChange={(e) => update({ lineId: e.target.value })} />
          </div>
          <div>
            <Label>Email</Label>
            <Input value={draft.email} onChange={(e) => update({ email: e.target.value })} />
          </div>
        </div>

        <BusinessCardUpload onRecognized={handleRecognized} />

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={handleCancel}>
            <X className="h-3.5 w-3.5" />
            取消
          </Button>
          <Button size="sm" disabled={saving} onClick={handleSave}>
            <Check className="h-3.5 w-3.5" />
            {saving ? "儲存中..." : "儲存"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start justify-between rounded-[var(--radius-lg)] border border-[var(--border)] p-4">
      <div className="flex gap-3">
        {contact.businessCardUrl && (
          <a href={contact.businessCardUrl} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
            <img src={contact.businessCardUrl} alt="名片" className="h-14 w-20 rounded-[var(--radius)] border border-[var(--border)] object-cover" />
          </a>
        )}
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-[var(--text-primary)]">{contact.name}</span>
            {contact.isPrimary && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                <Star className="h-2.5 w-2.5" />
                主要
              </span>
            )}
          </div>
          {contact.role && <p className="text-xs text-[var(--text-secondary)]">{contact.role}</p>}
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            {contact.phone}
            {contact.email && ` · ${contact.email}`}
          </p>
        </div>
      </div>

      <div className="relative flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={() => setEditing(true)}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => setShowMenu(!showMenu)}>
          <MoreHorizontal className="h-3.5 w-3.5" />
        </Button>
        {showMenu && (
          <div className="absolute right-0 top-8 z-10 min-w-[140px] rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-primary)] py-1 shadow-lg">
            {!contact.isPrimary && (
              <button
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-[var(--bg-secondary)]"
                onClick={() => { setShowMenu(false); void onSetPrimary(contact.id); }}
              >
                <Star className="h-3 w-3" />
                設為主要聯絡人
              </button>
            )}
            <button
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--error)] hover:bg-[var(--bg-secondary)]"
              onClick={() => { setShowMenu(false); void onDelete(contact.id); }}
            >
              <Trash2 className="h-3 w-3" />
              刪除
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
