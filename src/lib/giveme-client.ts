import "server-only";

import https from "node:https";
import type http from "node:http";

import { createGivemeAuthFields } from "@/lib/giveme-signer";

function buildProxyAgent(): http.Agent | undefined {
  const proxyUrl = process.env.FIXIE_URL?.trim();
  if (!proxyUrl) return undefined;
  // https-proxy-agent is a transitive dep — always available at runtime
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { HttpsProxyAgent } = require("https-proxy-agent") as typeof import("https-proxy-agent");
  return new HttpsProxyAgent(proxyUrl);
}

const proxyAgent = buildProxyAgent();

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
  customerName?: string;
  phone?: string;
  customerRemark?: string;
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

  const payload = JSON.stringify({ ...auth, ...body });
  const reqUrl = new URL(`${config.baseUrl}?action=${action}`);

  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const options: https.RequestOptions = {
      hostname: reqUrl.hostname,
      port: reqUrl.port || 443,
      path: reqUrl.pathname + reqUrl.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
      ...(proxyAgent ? { agent: proxyAgent } : {}),
    };

    const timer = setTimeout(() => req.destroy(new Error("Giveme API timeout (15s)")), 15_000);

    const req = https.request(options, (res) => {
      clearTimeout(timer);
      let raw = "";
      res.on("data", (chunk: Buffer) => { raw += chunk.toString(); });
      res.on("end", () => {
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`Giveme API HTTP ${res.statusCode}`));
          return;
        }
        const ct = res.headers["content-type"] ?? "";
        if (!ct.includes("application/json")) {
          reject(new Error("Giveme API 回應不是 JSON"));
          return;
        }
        try {
          resolve(JSON.parse(raw) as Record<string, unknown>);
        } catch {
          reject(new Error("Giveme API 回應格式錯誤"));
        }
      });
    });

    req.on("error", (err) => { clearTimeout(timer); reject(err); });
    req.write(payload);
    req.end();
  });
}

async function postBinary(action: string, body: Record<string, unknown>): Promise<{ contentType: string; buffer: Buffer }> {
  const config = getGivemeConfig();
  if (!config) throw new Error("Giveme 電子發票憑證未設定");

  const auth = createGivemeAuthFields({ uncode: config.uncode, idno: config.idno, password: config.password });
  const payload = JSON.stringify({ ...auth, ...body });
  const reqUrl = new URL(`${config.baseUrl}?action=${action}`);

  return new Promise((resolve, reject) => {
    const options: https.RequestOptions = {
      hostname: reqUrl.hostname,
      port: reqUrl.port || 443,
      path: reqUrl.pathname + reqUrl.search,
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) },
      ...(proxyAgent ? { agent: proxyAgent } : {}),
    };
    const timer = setTimeout(() => req.destroy(new Error("Giveme API timeout (30s)")), 30_000);
    const req = https.request(options, (res) => {
      clearTimeout(timer);
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`Giveme API HTTP ${res.statusCode}`));
          return;
        }
        const buf = Buffer.concat(chunks);
        const ct = res.headers["content-type"] ?? "application/octet-stream";
        // If JSON came back it means an error
        if (ct.includes("application/json")) {
          try {
            const json = JSON.parse(buf.toString()) as Record<string, unknown>;
            reject(new Error(typeof json.msg === "string" ? json.msg : "Giveme 圖片請求失敗"));
          } catch {
            reject(new Error("Giveme API 回應格式錯誤"));
          }
          return;
        }
        resolve({ contentType: ct, buffer: buf });
      });
    });
    req.on("error", (err) => { clearTimeout(timer); reject(err); });
    req.write(payload);
    req.end();
  });
}

export async function getInvoicePicture(code: string, type: 1 | 2 | 3 = 1): Promise<{ contentType: string; buffer: Buffer }> {
  return postBinary("picture", { code, type });
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
    customerName: typeof payload.customerName === "string" ? payload.customerName : undefined,
    phone: typeof payload.phone === "string" ? payload.phone : undefined,
    customerRemark: typeof payload.customerRemark === "string" ? payload.customerRemark
      : typeof payload.remark === "string" ? payload.remark : undefined,
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
