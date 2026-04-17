"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { Client } from "@/lib/types";
import type { Company, CompanyWithPrimaryContact } from "@/lib/types/company";

const CACHE_KEY = "cq-companies-cache";
const TTL = 5 * 60 * 1000;

export type SortField = "name" | "createdAt" | "updatedAt";

interface CompaniesFilter {
  keyword: string;
  clientType: string;
  channel: string;
  showInactive: boolean;
  sortBy: SortField;
}

export function useCompanies() {
  const [companies, setCompanies] = useState<CompanyWithPrimaryContact[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<CompaniesFilter>({
    keyword: "",
    clientType: "",
    channel: "",
    showInactive: false,
    sortBy: "name",
  });

  const load = useCallback(async (force = false) => {
    setLoading(true);
    try {
      if (!force) {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached) as {
            companies: CompanyWithPrimaryContact[];
            clients: Client[];
            ts: number;
          };
          if (Date.now() - parsed.ts < TTL) {
            setCompanies(parsed.companies);
            setClients(parsed.clients);
            setLoading(false);
            return;
          }
        }
      }

      const response = await fetch("/api/sheets/clients", { cache: "no-store" });
      if (!response.ok) throw new Error("load companies");
      const payload = (await response.json()) as {
        companies: CompanyWithPrimaryContact[];
        clients: Client[];
      };
      setCompanies(payload.companies);
      setClients(payload.clients);
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({
          companies: payload.companies,
          clients: payload.clients,
          ts: Date.now(),
        }),
      );
    } catch {
      setCompanies([]);
      setClients([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    let result = companies;

    if (!filters.showInactive) {
      result = result.filter((c) => c.isActive);
    }

    if (filters.clientType) {
      result = result.filter((c) => c.clientType === filters.clientType);
    }

    if (filters.channel) {
      result = result.filter((c) => c.channel === filters.channel);
    }

    const q = filters.keyword.trim().toLowerCase();
    if (q) {
      result = result.filter((c) =>
        [
          c.companyName,
          c.shortName,
          c.primaryContact?.name ?? "",
          c.primaryContact?.phone ?? "",
          c.taxId,
        ].some((f) => f.toLowerCase().includes(q)),
      );
    }

    result = [...result].sort((a, b) => {
      switch (filters.sortBy) {
        case "createdAt":
          return b.createdAt.localeCompare(a.createdAt);
        case "updatedAt":
          return b.updatedAt.localeCompare(a.updatedAt);
        default:
          return a.companyName.localeCompare(b.companyName, "zh-TW");
      }
    });

    return result;
  }, [companies, filters]);

  const addCompany = useCallback(
    async (company: Company) => {
      const response = await fetch("/api/sheets/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(company),
      });
      if (!response.ok) throw new Error("新增公司失敗");
      localStorage.removeItem(CACHE_KEY);
      await load(true);
    },
    [load],
  );

  const updateCompany = useCallback(
    async (company: Company) => {
      const response = await fetch("/api/sheets/clients", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(company),
      });
      if (!response.ok) throw new Error("更新公司失敗");
      localStorage.removeItem(CACHE_KEY);
      await load(true);
    },
    [load],
  );

  return {
    companies: filtered,
    allCompanies: companies,
    clients,
    loading,
    filters,
    setFilters,
    reload: () => load(true),
    addCompany,
    updateCompany,
  };
}
