"use client";

import { useCompanies } from "./useCompanies";
import type { Client } from "@/lib/types";
import type { Company } from "@/lib/types/company";

function clientToCompany(client: Client): Company {
  return {
    id: client.id,
    companyName: client.companyName,
    shortName: client.shortName,
    clientType: client.clientType,
    channel: client.channel,
    address: client.address,
    taxId: client.taxId,
    commissionMode: client.commissionMode,
    commissionRate: client.commissionRate,
    commissionFixedAmount: client.commissionFixedAmount,
    paymentTerms: client.paymentTerms,
    defaultNotes: client.defaultNotes,
    leadSource: "unknown",
    isActive: client.isActive,
    createdAt: client.createdAt,
    updatedAt: client.updatedAt,
    notes: client.notes,
  };
}

/**
 * Backward-compatible hook that returns the flat Client[] array.
 * Used by QuoteEditor and other existing consumers.
 */
export function useClients() {
  const { clients, loading, reload, addCompany, updateCompany } = useCompanies();

  return {
    clients,
    loading,
    reload,
    addClient: async (client: Client) => {
      await addCompany(clientToCompany(client));
    },
    updateClient: async (client: Client) => {
      await updateCompany(clientToCompany(client));
    },
  };
}
