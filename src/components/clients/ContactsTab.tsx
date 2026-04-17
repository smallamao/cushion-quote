"use client";

import { Loader2, Plus, Upload, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BusinessCardUpload } from "./BusinessCardUpload";
import { ContactCard } from "./ContactCard";
import { useContacts } from "@/hooks/useContacts";
import type { Contact } from "@/lib/types/company";
import type { BusinessCardData } from "@/lib/gemini-client";

interface ContactsTabProps {
  companyId: string;
}

const EMPTY_DRAFT: Partial<Contact> = {
  name: "",
  role: "",
  phone: "",
  phone2: "",
  lineId: "",
  email: "",
};

export function ContactsTab({ companyId }: ContactsTabProps) {
  const { contacts, loading, addContact, updateContact, deleteContact } =
    useContacts(companyId);

  const [showCardUpload, setShowCardUpload] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newDraft, setNewDraft] = useState<Partial<Contact>>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);

  function updateDraft(patch: Partial<Contact>) {
    setNewDraft((prev) => ({ ...prev, ...patch }));
  }

  function handleCardRecognized(data: BusinessCardData, _imageUrl: string) {
    setNewDraft((prev) => ({
      ...prev,
      name: data.name || prev.name || "",
      role: data.role || prev.role || "",
      phone: data.phone || prev.phone || "",
      phone2: data.phone2 || prev.phone2 || "",
      lineId: data.lineId || prev.lineId || "",
      email: data.email || prev.email || "",
    }));
    setShowCardUpload(false);
    setShowNewForm(true);
  }

  async function handleSaveNew() {
    if (!newDraft.name?.trim()) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const contact: Contact = {
        id: `CON-${Date.now()}`,
        companyId,
        name: newDraft.name ?? "",
        role: newDraft.role ?? "",
        phone: newDraft.phone ?? "",
        phone2: newDraft.phone2 ?? "",
        lineId: newDraft.lineId ?? "",
        email: newDraft.email ?? "",
        businessCardUrl: "",
        isPrimary: contacts.length === 0,
        createdAt: now,
        updatedAt: now,
      };
      await addContact(contact);
      setNewDraft(EMPTY_DRAFT);
      setShowNewForm(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleSetPrimary(contactId: string) {
    const contact = contacts.find((c) => c.id === contactId);
    if (!contact) return;
    await updateContact({ ...contact, isPrimary: true });
  }

  return (
    <div className="space-y-4">
      {/* Action buttons */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setShowNewForm(true);
            setShowCardUpload(false);
            setNewDraft(EMPTY_DRAFT);
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          新增聯絡人
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setShowCardUpload(true);
            setShowNewForm(false);
          }}
        >
          <Upload className="h-3.5 w-3.5" />
          名片建檔
        </Button>
      </div>

      {/* Card upload area */}
      {showCardUpload && (
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] p-4 space-y-3">
          <p className="text-xs text-[var(--text-secondary)]">
            上傳名片圖片，系統將自動辨識並填入聯絡人資料。
          </p>
          <BusinessCardUpload onRecognized={handleCardRecognized} />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowCardUpload(false)}
          >
            <X className="h-3.5 w-3.5" />
            取消
          </Button>
        </div>
      )}

      {/* New contact form */}
      {showNewForm && (
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-secondary)] p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>
                姓名 <span className="text-[var(--error)]">*</span>
              </Label>
              <Input
                value={newDraft.name ?? ""}
                onChange={(e) => updateDraft({ name: e.target.value })}
                placeholder="聯絡人姓名"
              />
            </div>
            <div>
              <Label>角色 / 職稱</Label>
              <Input
                value={newDraft.role ?? ""}
                onChange={(e) => updateDraft({ role: e.target.value })}
                placeholder="老闆、採購、設計師..."
              />
            </div>
            <div>
              <Label>電話</Label>
              <Input
                value={newDraft.phone ?? ""}
                onChange={(e) => updateDraft({ phone: e.target.value })}
              />
            </div>
            <div>
              <Label>電話 2</Label>
              <Input
                value={newDraft.phone2 ?? ""}
                onChange={(e) => updateDraft({ phone2: e.target.value })}
              />
            </div>
            <div>
              <Label>LINE</Label>
              <Input
                value={newDraft.lineId ?? ""}
                onChange={(e) => updateDraft({ lineId: e.target.value })}
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                value={newDraft.email ?? ""}
                onChange={(e) => updateDraft({ email: e.target.value })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowNewForm(false);
                setNewDraft(EMPTY_DRAFT);
              }}
            >
              <X className="h-3.5 w-3.5" />
              取消
            </Button>
            <Button
              size="sm"
              disabled={saving || !newDraft.name?.trim()}
              onClick={handleSaveNew}
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              {saving ? "儲存中..." : "新增"}
            </Button>
          </div>
        </div>
      )}

      {/* Contact list */}
      {loading ? (
        <div className="flex items-center justify-center py-8 text-[var(--text-secondary)]">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : contacts.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--text-secondary)]">
          尚無聯絡人
        </p>
      ) : (
        <div className="space-y-2">
          {contacts.map((contact) => (
            <ContactCard
              key={contact.id}
              contact={contact}
              onUpdate={updateContact}
              onDelete={deleteContact}
              onSetPrimary={handleSetPrimary}
            />
          ))}
        </div>
      )}
    </div>
  );
}
