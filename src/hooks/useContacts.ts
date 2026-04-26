"use client";

import { useCallback, useEffect, useState } from "react";

import type { Contact } from "@/lib/types/company";

const COMPANIES_CACHE_KEY = "cq-companies-cache";

export function useContacts(companyId: string | null) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) {
      setContacts([]);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(
        `/api/sheets/contacts?companyId=${encodeURIComponent(companyId)}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error("load contacts");
      const payload = (await response.json()) as { contacts: Contact[] };
      setContacts(payload.contacts);
    } catch {
      setContacts([]);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const addContact = useCallback(
    async (contact: Contact) => {
      const response = await fetch("/api/sheets/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contact),
      });
      if (!response.ok) throw new Error("新增聯絡人失敗");
      localStorage.removeItem(COMPANIES_CACHE_KEY);
      await load();
    },
    [load],
  );

  const updateContact = useCallback(
    async (contact: Contact) => {
      const response = await fetch("/api/sheets/contacts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contact),
      });
      if (!response.ok) throw new Error("更新聯絡人失敗");
      localStorage.removeItem(COMPANIES_CACHE_KEY);
      await load();
    },
    [load],
  );

  const deleteContact = useCallback(
    async (contactId: string) => {
      const response = await fetch("/api/sheets/contacts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: contactId }),
      });
      if (!response.ok) throw new Error("刪除聯絡人失敗");
      await load();
    },
    [load],
  );

  return { contacts, loading, reload: load, addContact, updateContact, deleteContact };
}
