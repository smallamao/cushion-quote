import "server-only";

import type Anthropic from "@anthropic-ai/sdk";

import { ORDER_RANGE_DATA, orderRowToRecord } from "@/lib/order-utils";
import { getSheetsClient } from "@/lib/sheets-client";
import type { CustomOrder, OrderStatus } from "@/lib/types";

/** 訂單狀態的中文標籤（給模型與畫面用）。 */
export const STATUS_LABELS: Record<OrderStatus, string> = {
  pending_setup: "待建立內容",
  production: "排程/生產中",
  waiting: "待出貨",
  completed: "完成",
  cancelled: "取消",
};

export const PROPOSE_STATUS_CHANGE = "propose_status_change";
export const PROPOSE_PURCHASE_STATUS_CHANGE = "propose_purchase_status_change";

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

/**
 * 這個面板專屬的「提議改狀態」工具。其餘工具一律走共用工具表
 * （lib/agent-tools.ts）——2026-11-04 起不再各自維護一份宣告。
 */
export const PROPOSE_STATUS_TOOL: Anthropic.Tool = {
    name: PROPOSE_STATUS_CHANGE,
    description:
      "提議把某張訂單改成新狀態。這只是『提議』，不會真的改——必須由使用者在畫面上按確認，系統才會執行。不要假裝已經改好。",
    input_schema: {
      type: "object",
      properties: {
        orderId: { type: "string", description: "工單編號，例如 S941" },
        status: {
          type: "string",
          enum: ["production", "waiting", "completed", "cancelled"],
          description: "目標狀態：production=排程/生產中, waiting=待出貨, completed=完成, cancelled=取消",
        },
      },
      required: ["orderId", "status"],
    },
  };

/**
 * 採購單改狀態——一樣只給「提議」，真正寫入由使用者在畫面按確認。
 *
 * 老闆 2026-11-06：助手查出一堆還掛草稿的採購單，卻只能叫他自己去後台一張張點。
 * 但直接把 update_purchase_status 開給面板不行——2026-11-06 查出 1,315 張裡有 19 組
 * 內容完全相同的重複單，14 組整組還是草稿；沒有確認關卡的話，助手一句「好我幫你送出」
 * 就可能重複下單近十萬。確認視窗會附上重複單警告。
 */
export const PROPOSE_PURCHASE_STATUS_TOOL: Anthropic.Tool = {
  name: PROPOSE_PURCHASE_STATUS_CHANGE,
  description:
    "提議把某張採購單改成新狀態（例如草稿→已送出給廠商）。這只是『提議』，不會真的改——" +
    "必須由使用者在畫面上按確認，系統才會執行。不要假裝已經改好。一次只提議一張。",
  input_schema: {
    type: "object",
    properties: {
      purchaseId: { type: "string", description: "採購單號，例如 PS-20261106-01" },
      status: {
        type: "string",
        enum: ["sent", "confirmed", "received", "cancelled", "draft"],
        description:
          "目標狀態：sent=已送出給廠商, confirmed=已確認, received=已到貨, cancelled=已取消, draft=退回草稿",
      },
    },
    required: ["purchaseId", "status"],
  },
};

/**
 * 畫面助手的系統指令。
 *
 * 🔴 這裡列的工具名稱要跟 readOnlyTools() 的實際清單對得起來。
 * 2026-11-04 之前這行寫的是「你只能用 find_orders / get_order」——find_orders 這個名字
 * 在 2026-11-04 工具合併後就不存在了（實際叫 query_orders），而且當時面板已經查得到
 * 採購單、客戶、報價、售後、發票，指令卻還叫模型不要用。加工具時一定要回來改這段。
 */
export const SYSTEM_INSTRUCTION = `你是「馬鈴薯沙發營運系統」的內部助理，只服務辦公室同仁。

可用的查詢工具：
- query_orders / get_order：訂製訂單（工單）
- get_order_materials：訂製訂單的叫料狀況（關聯採購單、買了什麼料、採購單狀態）
- query_purchase_orders：採購單
- query_clients：客戶
- query_quotes：報價單
- query_after_sales：售後服務單
- query_invoices：電子發票
- query_bookings：Notion「預約紀錄」的展示間參觀預約

規則：
- 一題可以連續呼叫多個工具，查完再一起作答；需要先查清單再逐筆追細節就去查，不要只查一輪就交差。
- 修改訂製訂單狀態用 propose_status_change、修改採購單狀態用 propose_purchase_status_change，都只是提議，交由使用者在畫面上確認後系統才會執行；你絕對不要說「已經改好了」。
- 採購單一次只提議一張。使用者說「全部送出」時，先把清單列出來請他逐張確認，不要連續丟一堆提議。
- 一律用繁體中文、簡潔回答。據實回報，不要杜撰。
- 工具查不到的就直說查不到，並指出是缺哪一項資料或哪個工具，不要用推測填補。`;
