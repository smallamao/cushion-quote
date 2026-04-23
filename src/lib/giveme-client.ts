import "server-only";

import { createGivemeAuthFields } from "@/lib/giveme-signer";

export interface GivemeIssueItem {
  name: string;
  money: number;
  number: number;
  remark?: string;
  taxType?: 0 | 1 | 2;
}

export interface GivemeIssueB2CInput {
  customerName?: string;
  phone?: string;
  orderCode?: string;
  datetime: string;
  email?: string;
  donationCode?: string;
  taxType?: 0 | 1 | 2 | 4;
  totalFee: string;
  content: string;
  items: GivemeIssueItem[];
}

export interface GivemeIssueB2BInput {
  customerName?: string;
  buyerTaxId: string;
  datetime: string;
  email?: string;
  taxState: "0" | "1";
  totalFee: string;
  amount: string;
  sales: string;
  taxType?: 0 | 1 | 2;
  content: string;
  items: GivemeIssueItem[];
}

export interface GivemeBaseResponse {
  success: boolean;
  code: string;
  msg: string;
  totalFee?: string;
  orderCode?: string;
  phone?: string;
  raw: Record<string, unknown>;
}

export interface GivemeQueryResponse extends GivemeBaseResponse {
  type?: string;
  tranno?: string;
  email?: string;
  randomCode?: string;
  datetime?: string;
  status?: string;
  delRemark?: string;
  delTime?: string;
  details?: Array<{ name: string; number: string; money: string }>;
}

interface GivemeConfig {
  baseUrl: string;
  uncode: string;
  idno: string;
  password: string;
}

function getGivemeConfig(): GivemeConfig | null {
  const uncode = process.env.GIVEME_UNCODE?.trim() ?? "";
  const idno = process.env.GIVEME_IDNO?.trim() ?? "";
  const password = process.env.GIVEME_PASSWORD?.trim() ?? "";
  if (!uncode || !idno || !password) return null;
  return {
    baseUrl: process.env.GIVEME_BASE_URL?.trim() || "https://www.giveme.com.tw/invoice.do",
    uncode,
    idno,
    password,
  };
}

function normalizeResponse(raw: Record<string, unknown>): GivemeBaseResponse {
  const successValue = raw.success;
  return {
    success: successValue === true || successValue === "true" || successValue === "TRUE",
    code: typeof raw.code === "string" ? raw.code : "",
    msg: typeof raw.msg === "string" ? raw.msg : "",
    totalFee: typeof raw.totalFee === "string" ? raw.totalFee : undefined,
    orderCode: typeof raw.orderCode === "string" ? raw.orderCode : undefined,
    phone: typeof raw.phone === "string" ? raw.phone : undefined,
    raw,
  };
}

async function postJson(action: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const config = getGivemeConfig();
  if (!config) {
    throw new Error("Giveme 電子發票憑證未設定");
  }

  const auth = createGivemeAuthFields({
    uncode: config.uncode,
    idno: config.idno,
    password: config.password,
  });

  const response = await fetch(`${config.baseUrl}?action=${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...auth, ...body }),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`Giveme API HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error("Giveme API 回應不是 JSON");
  }

  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!payload) {
    throw new Error(`Giveme API 回應格式錯誤 (${response.status})`);
  }
  return payload;
}

export async function issueB2CInvoice(input: GivemeIssueB2CInput): Promise<GivemeBaseResponse> {
  const payload = await postJson("addB2C", {
    customerName: input.customerName ?? "",
    phone: input.phone ?? "",
    orderCode: input.orderCode ?? "",
    datetime: input.datetime,
    email: input.email ?? "",
    state: input.donationCode ? "1" : "0",
    donationCode: input.donationCode ?? "",
    taxType: input.taxType ?? 0,
    totalFee: input.totalFee,
    content: input.content,
    items: input.items,
  });
  return normalizeResponse(payload);
}

export async function issueB2BInvoice(input: GivemeIssueB2BInput): Promise<GivemeBaseResponse> {
  const payload = await postJson("addB2B", {
    customerName: input.customerName ?? "",
    phone: input.buyerTaxId,
    datetime: input.datetime,
    email: input.email ?? "",
    taxState: input.taxState,
    totalFee: input.totalFee,
    amount: input.amount,
    sales: input.sales,
    taxType: input.taxType ?? 0,
    content: input.content,
    items: input.items,
  });
  return normalizeResponse(payload);
}

export async function cancelInvoice(code: string, remark: string): Promise<GivemeBaseResponse> {
  const payload = await postJson("cancelInvoice", { code, remark });
  return normalizeResponse(payload);
}

export async function queryInvoice(code: string): Promise<GivemeQueryResponse> {
  const payload = await postJson("query", { code });
  const normalized = normalizeResponse(payload);
  return {
    ...normalized,
    type: typeof payload.type === "string" ? payload.type : undefined,
    tranno: typeof payload.tranno === "string" ? payload.tranno : undefined,
    email: typeof payload.email === "string" ? payload.email : undefined,
    randomCode: typeof payload.randomCode === "string" ? payload.randomCode : undefined,
    datetime: typeof payload.datetime === "string" ? payload.datetime : undefined,
    status: typeof payload.status === "string" ? payload.status : undefined,
    delRemark: typeof payload.delRemark === "string" ? payload.delRemark : undefined,
    delTime: typeof payload.delTime === "string" ? payload.delTime : undefined,
    details: Array.isArray(payload.details)
      ? payload.details.flatMap((detail) => {
          if (!detail || typeof detail !== "object") return [];
          const current = detail as Record<string, unknown>;
          return [{
            name: typeof current.name === "string" ? current.name : "",
            number: typeof current.number === "string" ? current.number : "",
            money: typeof current.money === "string" ? current.money : "",
          }];
        })
      : undefined,
  };
}
