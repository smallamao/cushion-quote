import "server-only";

import { Type, type FunctionDeclaration } from "@google/genai";

import { ORDER_RANGE_DATA, orderRowToRecord } from "@/lib/order-utils";
import { getSheetsClient } from "@/lib/sheets-client";
import type { CustomOrder, OrderStatus } from "@/lib/types";

/** 訂單狀態的中文標籤（給模型與畫面用）。 */
export const STATUS_LABELS: Record<OrderStatus, string> = {
  production: "排程/生產中",
  waiting: "待出貨",
  completed: "完成",
  cancelled: "取消",
};

export const PROPOSE_STATUS_CHANGE = "propose_status_change";

/** 回傳給模型的訂單摘要——只放查詢需要的欄位，盡量少送敏感資料。 */
interface OrderSummary {
  工單號: string;
  客戶: string;
  訂製內容: string;
  分類: string;
  狀態: string;
  下單日: string;
  安裝出貨日: string;
  金額: number;
}

function toSummary(o: CustomOrder): OrderSummary {
  return {
    工單號: o.orderId,
    客戶: o.clientName,
    訂製內容: o.orderTitle,
    分類: String(o.itemCategory ?? ""),
    狀態: STATUS_LABELS[o.status] ?? o.status,
    下單日: o.orderDate,
    安裝出貨日: o.installDate,
    金額: o.quotedAmount,
  };
}

async function loadAllOrders(): Promise<CustomOrder[]> {
  const client = await getSheetsClient();
  if (!client) return [];
  const res = await client.sheets.spreadsheets.values.get({
    spreadsheetId: client.spreadsheetId,
    range: ORDER_RANGE_DATA,
  });
  const rows = (res.data.values ?? []) as string[][];
  return rows.filter((r) => r[0]).map(orderRowToRecord);
}

/** 工具：find_orders —— 依關鍵字 / 狀態 / 月份查訂單清單。 */
export async function findOrders(args: {
  query?: string;
  status?: string;
  month?: string;
}): Promise<OrderSummary[]> {
  let list = (await loadAllOrders()).filter((o) => !o.isArchived);
  const q = (args.query ?? "").trim().toLowerCase();
  const status = (args.status ?? "").trim();
  const month = (args.month ?? "").trim(); // YYYY-MM

  if (q) {
    list = list.filter(
      (o) =>
        o.orderId.toLowerCase().includes(q) ||
        o.clientName.toLowerCase().includes(q) ||
        o.orderTitle.toLowerCase().includes(q),
    );
  }
  if (status) list = list.filter((o) => o.status === status);
  if (month) {
    list = list.filter(
      (o) => (o.orderDate ?? "").startsWith(month) || (o.installDate ?? "").startsWith(month),
    );
  }
  return list.slice(0, 30).map(toSummary);
}

/** 工具：get_order —— 查單一訂單。 */
export async function getOrder(args: {
  orderId: string;
}): Promise<OrderSummary | { error: string }> {
  const id = (args.orderId ?? "").trim();
  const o = (await loadAllOrders()).find((x) => x.orderId.toLowerCase() === id.toLowerCase());
  return o ? toSummary(o) : { error: `找不到工單 ${id}` };
}

export const functionDeclarations: FunctionDeclaration[] = [
  {
    name: "find_orders",
    description: "查詢訂製訂單清單。可用關鍵字(工單號 / 客戶名 / 訂製內容)、狀態、月份篩選，回傳最多 30 筆摘要。",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: "關鍵字：工單號 / 客戶姓名 / 訂製內容，可省略" },
        status: {
          type: Type.STRING,
          enum: ["production", "waiting", "completed", "cancelled"],
          description: "狀態篩選：production=排程/生產中, waiting=待出貨, completed=完成, cancelled=取消。可省略",
        },
        month: { type: Type.STRING, description: "月份 YYYY-MM，篩下單日或安裝/出貨日落在該月的單，可省略" },
      },
    },
  },
  {
    name: "get_order",
    description: "查詢單一訂製訂單的詳細資訊。",
    parameters: {
      type: Type.OBJECT,
      properties: {
        orderId: { type: Type.STRING, description: "工單編號，例如 S941" },
      },
      required: ["orderId"],
    },
  },
  {
    name: PROPOSE_STATUS_CHANGE,
    description:
      "提議把某張訂單改成新狀態。這只是『提議』，不會真的改——必須由使用者在畫面上按確認，系統才會執行。不要假裝已經改好。",
    parameters: {
      type: Type.OBJECT,
      properties: {
        orderId: { type: Type.STRING, description: "工單編號，例如 S941" },
        status: {
          type: Type.STRING,
          enum: ["production", "waiting", "completed", "cancelled"],
          description: "目標狀態：production=排程/生產中, waiting=待出貨, completed=完成, cancelled=取消",
        },
      },
      required: ["orderId", "status"],
    },
  },
];

export const SYSTEM_INSTRUCTION = `你是「馬鈴薯沙發營運系統」的內部助理，只服務辦公室同仁。
- 你只能用提供的工具：查詢訂單(find_orders / get_order)、或提議修改訂單狀態(propose_status_change)。
- 修改狀態一律用 propose_status_change 提議，交由使用者在畫面上確認後系統才會執行；你絕對不要說「已經改好了」。
- 一律用繁體中文、簡潔回答。查詢結果據實回報，不要杜撰；找不到就直說找不到。`;
