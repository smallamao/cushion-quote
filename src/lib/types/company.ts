import type { Channel, ClientType, CommissionMode, LeadSource } from "../types";

export interface Company {
  id: string;
  companyName: string;
  shortName: string;
  clientType: ClientType;
  channel: Channel;
  address: string;
  taxId: string;
  commissionMode: CommissionMode | "default";
  commissionRate: number;
  commissionFixedAmount: number;
  paymentTerms: string;
  defaultNotes: string;
  leadSource: LeadSource;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  notes: string;
}

export interface Contact {
  id: string;
  companyId: string;
  name: string;
  role: string;
  phone: string;
  phone2: string;
  lineId: string;
  email: string;
  businessCardUrl: string;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyWithContacts extends Company {
  contacts: Contact[];
}

export interface CompanyWithPrimaryContact extends Company {
  primaryContact: Contact | null;
}

export function companyToClient(
  company: Company,
  primaryContact: Contact | null,
): import("../types").Client {
  return {
    id: company.id,
    companyName: company.companyName,
    shortName: company.shortName,
    clientType: company.clientType,
    channel: company.channel,
    contactName: primaryContact
      ? primaryContact.role
        ? `${primaryContact.name} ${primaryContact.role}`
        : primaryContact.name
      : "",
    phone: primaryContact?.phone ?? "",
    phone2: primaryContact?.phone2 ?? "",
    lineId: primaryContact?.lineId ?? "",
    email: primaryContact?.email ?? "",
    address: company.address,
    taxId: company.taxId,
    commissionMode: company.commissionMode,
    commissionRate: company.commissionRate,
    commissionFixedAmount: company.commissionFixedAmount,
    paymentTerms: company.paymentTerms,
    defaultNotes: company.defaultNotes,
    isActive: company.isActive,
    createdAt: company.createdAt,
    updatedAt: company.updatedAt,
    notes: company.notes,
  };
}
