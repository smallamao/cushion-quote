import { GoogleGenerativeAI, SchemaType, type FunctionDeclaration, type Content } from "@google/generative-ai";

import { issueB2BInvoice, issueB2CInvoice } from "@/lib/giveme-client";
import { generateEInvoiceId, isoNow } from "@/lib/einvoice-utils";
import { getSheetsClient } from "@/lib/sheets-client";
import type { EInvoiceRecord, PurchaseOrderStatus } from "@/lib/types";
import { createService, listServices } from "@/lib/after-sales-sheet";
import { appendEInvoiceRecord, getEInvoiceRows, getEInvoiceRecords } from "@/app/api/sheets/einvoices/_shared";
import { getQuoteRows, quoteRowToRecord } from "@/app/api/sheets/_v2-utils";

const functionDeclarations: FunctionDeclaration[] = [
  {
    name: "create_invoice",
    description: "建立並立即開立電子發票。適用於客戶要開發票、或已完工需要開立發票的場景。",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        buyerName: { type: SchemaType.STRING, description: "買方名稱（客戶姓名或公司名稱）" },
        buyerTaxId: { type: SchemaType.STRING, description: "買方統一編號，B2B 才填，B2C 不填" },
        totalAmount: { type: SchemaType.NUMBER, description: "含稅總金額（新台幣）" },
        itemName: { type: SchemaType.STRING, description: "主要品項名稱，例如「沙發換布」、「窗簾安裝」" },
        overallRemark: { type: SchemaType.STRING, description: "總備註，會顯示在發票上" },
        invoiceDate: { type: SchemaType.STRING, description: "發票日期，格式 YYYY-MM-DD，不填則用今天" },
      },
      required: ["buyerName", "totalAmount"],
    },
  },
  {
    name: "create_after_sales",
    description: "建立售後報修服務單。適用於客戶反映問題、需要派人維修的場景。",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        clientName: { type: SchemaType.STRING, description: "客戶姓名" },
        clientPhone: { type: SchemaType.STRING, description: "客戶電話" },
        issueDescription: { type: SchemaType.STRING, description: "問題描述，盡量詳細" },
      },
      required: ["clientName", "issueDescription"],
    },
  },
  {
    name: "query_purchase_orders",
    description: "查詢採購單列表。可以查最近幾筆、依狀態篩選、或依日期篩選（例如今天）。所有參數都是選填，直接呼叫即可。",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        status: { type: SchemaType.STRING, description: "篩選狀態：draft（草稿）、confirmed（已確認）、received（已到貨）、cancelled（已取消）。不填則查全部。" },
        orderDate: { type: SchemaType.STRING, description: "篩選特定日期，格式 YYYY-MM-DD。例如查今天就填今天的日期。不填則不篩選。" },
        limit: { type: SchemaType.NUMBER, description: "最多顯示幾筆，預設 5，最多 20" },
      },
      required: [],
    },
  },
  {
    name: "query_clients",
    description: "查詢客戶資料。開發票前確認客戶名稱、統編，或查詢客戶是否存在。",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        keyword: { type: SchemaType.STRING, description: "搜尋關鍵字，可以是公司名稱或簡稱的一部分" },
        limit: { type: SchemaType.NUMBER, description: "最多顯示幾筆，預設 5" },
      },
      required: ["keyword"],
    },
  },
  {
    name: "query_quotes",
    description: "查詢報價單列表。可以依狀態篩選：draft（草稿）、sent（已送出）、accepted（已接受）、rejected（已拒絕）、cancelled（已取消）。",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        status: { type: SchemaType.STRING, description: "報價單狀態篩選，不填則查全部" },
        limit: { type: SchemaType.NUMBER, description: "最多顯示幾筆，預設 5" },
      },
      required: [],
    },
  },
  {
    name: "update_purchase_status",
    description: "更新採購單狀態。例如把草稿改為已確認，或標記為已到貨。",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        orderId: { type: SchemaType.STRING, description: "採購單號，例如 PS-20260430-01" },
        status: { type: SchemaType.STRING, description: "新狀態：draft（草稿）、confirmed（已確認）、received（已到貨）、cancelled（已取消）" },
      },
      required: ["orderId", "status"],
    },
  },
  {
    name: "query_after_sales",
    description: "查詢售後報修單列表。可以依狀態篩選：pending（待處理）、scheduled（已排程）、in_progress（處理中）、completed（已完成）。",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        status: { type: SchemaType.STRING, description: "篩選狀態：pending、scheduled、in_progress、completed。不填則查全部。" },
        keyword: { type: SchemaType.STRING, description: "客戶姓名關鍵字，選填" },
        limit: { type: SchemaType.NUMBER, description: "最多顯示幾筆，預設 5，最多 20" },
      },
      required: [],
    },
  },
  {
    name: "query_invoices",
    description: "查詢電子發票列表。可以依狀態篩選：draft（草稿）、issued（已開立）、cancelled（已作廢）。",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        status: { type: SchemaType.STRING, description: "篩選狀態：draft、issued、cancelled。不填則查全部。" },
        limit: { type: SchemaType.NUMBER, description: "最多顯示幾筆，預設 5，最多 20" },
      },
      required: [],
    },
  },
  {
    name: "create_purchase_order",
    description: "建立採購單草稿。向供應商採購材料時使用。",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        supplierName: { type: SchemaType.STRING, description: "供應商名稱" },
        orderDate: { type: SchemaType.STRING, description: "採購日期 YYYY-MM-DD，不填則用今天" },
        notes: { type: SchemaType.STRING, description: "備註" },
        items: {
          type: SchemaType.ARRAY,
          description: "採購品項清單",
          items: {
            type: SchemaType.OBJECT,
            properties: {
              name: { type: SchemaType.STRING, description: "品項名稱" },
              quantity: { type: SchemaType.NUMBER, description: "數量" },
              unitPrice: { type: SchemaType.NUMBER, description: "單價" },
              unit: { type: SchemaType.STRING, description: "單位，例如碼、件、式" },
            },
            required: ["name", "quantity", "unitPrice"],
          },
        },
      },
      required: ["supplierName", "items"],
    },
  },
];

async function handleCreateInvoice(args: Record<string, unknown>): Promise<string> {
  const client = await getSheetsClient();
  if (!client) return "❌ Google Sheets 未設定，無法建立發票。";

  const buyerName = String(args.buyerName ?? "");
  const buyerTaxId = String(args.buyerTaxId ?? "");
  const totalAmount = Number(args.totalAmount ?? 0);
  const itemName = String(args.itemName ?? "服務費");
  const overallRemark = String(args.overallRemark ?? "");
  const invoiceDate = String(args.invoiceDate ?? new Date().toISOString().slice(0, 10));
  const buyerType = buyerTaxId ? "b2b" : "b2c";

  const untaxedAmount = Math.round(totalAmount / 1.05);
  const taxAmount = totalAmount - untaxedAmount;

  const existingRows = await getEInvoiceRows(client);
  const invoiceId = generateEInvoiceId(existingRows);
  const now = isoNow();

  const record: EInvoiceRecord = {
    invoiceId,
    retryOfInvoiceId: "",
    sourceType: "manual",
    sourceId: invoiceId,
    sourceSubId: "",
    quoteId: "",
    versionId: "",
    caseId: "",
    clientId: "",
    buyerType,
    buyerName,
    buyerTaxId,
    buyerAddress: "",
    email: "",
    carrierType: "none",
    carrierValue: "",
    donationCode: "",
    invoiceDate,
    taxType: 0,
    untaxedAmount,
    taxAmount,
    totalAmount,
    taxRate: 5,
    itemCount: 1,
    itemsJson: JSON.stringify([{ name: itemName, quantity: 1, unitPrice: untaxedAmount, amount: untaxedAmount, remark: "", taxType: 0 }]),
    content: itemName,
    status: "draft",
    providerName: "giveme",
    providerInvoiceNo: "",
    providerTrackNo: "",
    providerResponseJson: "",
    requestPayloadJson: "",
    errorCode: "",
    errorMessage: "",
    cancelledAt: "",
    cancelReason: "",
    createdBy: "linebot",
    createdAt: now,
    updatedAt: now,
    internalNote: "",
    overallRemark,
  };

  await appendEInvoiceRecord(client, record);

  const items = [{ name: itemName, money: untaxedAmount, number: 1, remark: "", taxType: 0 as const }];

  try {
    const result =
      buyerType === "b2b"
        ? await issueB2BInvoice({
            customerName: buyerName,
            buyerTaxId,
            datetime: invoiceDate,
            email: "",
            taxState: "0",
            totalFee: String(totalAmount),
            amount: String(taxAmount),
            sales: String(untaxedAmount),
            taxType: 0,
            content: overallRemark || itemName,
            items,
          })
        : await issueB2CInvoice({
            customerName: buyerName,
            datetime: invoiceDate,
            email: "",
            donationCode: "",
            taxType: 0,
            totalFee: String(totalAmount),
            content: overallRemark || itemName,
            items,
          });

    if (result.success) {
      return `✅ 發票開立成功！\n發票號碼：${result.code}\n買方：${buyerName}\n金額：NT$${totalAmount.toLocaleString()}\nID：${invoiceId}`;
    }
    return `⚠️ 草稿已建立（${invoiceId}），但 Giveme 開立失敗：${result.msg}\n請至系統手動重新開立。`;
  } catch (e) {
    return `⚠️ 草稿已建立（${invoiceId}），開立時發生錯誤：${e instanceof Error ? e.message : String(e)}\n請至系統手動重新開立。`;
  }
}

async function handleCreateAfterSales(args: Record<string, unknown>): Promise<string> {
  const service = await createService({
    service: {
      receivedDate: new Date().toISOString().slice(0, 10),
      relatedOrderNo: "",
      shipmentDate: "",
      clientName: String(args.clientName ?? ""),
      clientPhone: String(args.clientPhone ?? ""),
      clientContact2: "",
      clientPhone2: "",
      deliveryAddress: "",
      modelCode: "",
      modelNameSnapshot: "",
      issueDescription: String(args.issueDescription ?? ""),
      issuePhotos: [],
      status: "pending",
      assignedTo: "",
      scheduledDate: "",
      dispatchNotes: "",
      completedDate: "",
      completionNotes: "",
      completionPhotos: [],
      createdBy: "linebot",
    },
  });

  if (!service) return "❌ Google Sheets 未設定，無法建立報修單。";

  return `✅ 報修單已建立！\n單號：${service.serviceId}\n客戶：${service.clientName}\n問題：${service.issueDescription}\n狀態：待處理`;
}

async function handleQueryPurchaseOrders(args: Record<string, unknown>): Promise<string> {
  const client = await getSheetsClient();
  if (!client) return "❌ Google Sheets 未設定。";

  const statusFilter = args.status ? String(args.status) : "";
  const dateFilter = args.orderDate ? String(args.orderDate) : "";
  const limit = Math.min(Number(args.limit ?? 5), 20);

  try {
    const res = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: "採購單!A2:P",
    });

    const rows = (res.data.values ?? []) as string[][];
    let orders = rows
      .filter((r) => r[0])
      .map((r) => ({
        orderId: r[0] ?? "",
        orderDate: r[1] ?? "",
        supplierName: (() => {
          try { return (JSON.parse(r[5] ?? "{}") as Record<string, string>).name ?? r[2] ?? ""; } catch { return r[2] ?? ""; }
        })(),
        totalAmount: Number(r[9] ?? r[7] ?? 0),
        status: (r[11] ?? r[9] ?? "draft") as PurchaseOrderStatus,
        notes: r[10] ?? r[8] ?? "",
      }))
      .sort((a, b) => b.orderId.localeCompare(a.orderId));

    if (statusFilter) {
      orders = orders.filter((o) => o.status === statusFilter);
    }
    if (dateFilter) {
      orders = orders.filter((o) => o.orderDate === dateFilter);
    }

    orders = orders.slice(0, limit);

    if (orders.length === 0) {
      return statusFilter ? `找不到狀態為「${statusFilter}」的採購單。` : "目前沒有採購單。";
    }

    const STATUS_LABEL: Record<string, string> = {
      draft: "草稿", confirmed: "已確認", received: "已到貨", cancelled: "已取消",
    };

    const lines = orders.map((o, i) =>
      `${i + 1}. ${o.orderId}\n   ${o.supplierName}\n   ${o.orderDate} ／ NT$${o.totalAmount.toLocaleString()} ／ ${STATUS_LABEL[o.status] ?? o.status}`
    );

    return `最近 ${orders.length} 筆採購單：\n\n${lines.join("\n\n")}`;
  } catch (e) {
    return `❌ 查詢失敗：${e instanceof Error ? e.message : String(e)}`;
  }
}

async function handleCreatePurchaseOrder(args: Record<string, unknown>): Promise<string> {
  const client = await getSheetsClient();
  if (!client) return "❌ Google Sheets 未設定。";

  const supplierName = String(args.supplierName ?? "");
  const orderDate = String(args.orderDate ?? new Date().toISOString().slice(0, 10));
  const notes = String(args.notes ?? "");
  const rawItems = Array.isArray(args.items) ? args.items as Record<string, unknown>[] : [];

  const items = rawItems.map((item, idx) => ({
    name: String(item.name ?? ""),
    quantity: Number(item.quantity ?? 1),
    unitPrice: Number(item.unitPrice ?? 0),
    unit: String(item.unit ?? "式"),
    amount: Number(item.quantity ?? 1) * Number(item.unitPrice ?? 0),
    idx,
  }));

  const subtotal = items.reduce((s, i) => s + i.amount, 0);
  const dateStr = orderDate.replace(/-/g, "").slice(0, 8);
  const prefix = `PS-${dateStr}-`;

  try {
    const existingRes = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: "採購單!A2:A",
    });
    const existingIds = ((existingRes.data.values ?? []).flat()) as string[];
    const maxSeq = existingIds
      .filter((id) => id.startsWith(prefix))
      .reduce((max, id) => Math.max(max, Number(id.slice(prefix.length)) || 0), 0);
    const orderId = `${prefix}${String(maxSeq + 1).padStart(2, "0")}`;
    const now = new Date().toISOString();

    // 寫入採購單主檔
    const orderRow = [
      orderId, orderDate, "", "", "",
      JSON.stringify({ name: supplierName, shortName: "", contactPerson: "", phone: "", fax: "", email: "", taxId: "", address: "", paymentMethod: "", paymentTerms: "" }),
      subtotal, 0, 0, subtotal, notes, "draft", "", "", now, now,
    ];
    await client.sheets.spreadsheets.values.append({
      spreadsheetId: client.spreadsheetId,
      range: "採購單!A:P",
      valueInputOption: "RAW",
      requestBody: { values: [orderRow] },
    });

    // 寫入採購單明細
    if (items.length > 0) {
      const itemRows = items.map((item, idx) => [
        `${orderId}-${String(idx + 1).padStart(3, "0")}`,
        orderId, item.name, item.quantity, item.unit, item.unitPrice, item.amount,
        0, 0, now,
      ]);
      await client.sheets.spreadsheets.values.append({
        spreadsheetId: client.spreadsheetId,
        range: "採購單明細!A:J",
        valueInputOption: "RAW",
        requestBody: { values: itemRows },
      });
    }

    const itemSummary = items.map((i) => `  · ${i.name} × ${i.quantity}${i.unit} = NT$${i.amount.toLocaleString()}`).join("\n");
    return `✅ 採購單已建立！\n單號：${orderId}\n廠商：${supplierName}\n小計：NT$${subtotal.toLocaleString()}\n${itemSummary}`;
  } catch (e) {
    return `❌ 建立失敗：${e instanceof Error ? e.message : String(e)}`;
  }
}

async function handleQueryClients(args: Record<string, unknown>): Promise<string> {
  const client = await getSheetsClient();
  if (!client) return "❌ Google Sheets 未設定。";

  const keyword = String(args.keyword ?? "").toLowerCase();
  const limit = Math.min(Number(args.limit ?? 5), 20);

  try {
    const res = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: "客戶資料庫!A2:R",
    });

    const rows = (res.data.values ?? []) as string[][];
    const matched = rows
      .filter((r) => r[0] && r[11] !== "FALSE")
      .filter((r) => {
        const name = (r[1] ?? "").toLowerCase();
        const short = (r[2] ?? "").toLowerCase();
        const taxId = (r[6] ?? "").toLowerCase();
        return name.includes(keyword) || short.includes(keyword) || taxId.includes(keyword);
      })
      .slice(0, limit)
      .map((r, i) => `${i + 1}. ${r[1]}${r[2] ? `（${r[2]}）` : ""}\n   統編：${r[6] || "無"}／ID：${r[0]}`);

    if (matched.length === 0) return `找不到符合「${args.keyword}」的客戶。`;
    return `找到 ${matched.length} 筆客戶：\n\n${matched.join("\n\n")}`;
  } catch (e) {
    return `❌ 查詢失敗：${e instanceof Error ? e.message : String(e)}`;
  }
}

async function handleQueryQuotes(args: Record<string, unknown>): Promise<string> {
  const client = await getSheetsClient();
  if (!client) return "❌ Google Sheets 未設定。";

  const statusFilter = String(args.status ?? "").trim();
  const limit = Math.min(Number(args.limit ?? 5), 20);

  const STATUS_LABEL: Record<string, string> = {
    draft: "草稿", sent: "已送出", accepted: "已接受", rejected: "已拒絕", cancelled: "已取消",
  };

  try {
    const rows = await getQuoteRows(client);
    let quotes = rows.map(quoteRowToRecord).filter((q) => q.quoteId);

    if (statusFilter) {
      quotes = quotes.filter((q) => q.quoteStatus === statusFilter);
    }

    quotes = quotes
      .sort((a, b) => b.quoteId.localeCompare(a.quoteId))
      .slice(0, limit);

    if (quotes.length === 0) {
      return statusFilter ? `找不到狀態為「${STATUS_LABEL[statusFilter] ?? statusFilter}」的報價單。` : "目前沒有報價單。";
    }

    const lines = quotes.map((q, i) =>
      `${i + 1}. ${q.quoteId}\n   ${q.quoteName || "（未命名）"}／${STATUS_LABEL[q.quoteStatus] ?? q.quoteStatus}`
    );
    return `最近 ${quotes.length} 筆報價單：\n\n${lines.join("\n\n")}`;
  } catch (e) {
    return `❌ 查詢失敗：${e instanceof Error ? e.message : String(e)}`;
  }
}

async function handleUpdatePurchaseStatus(args: Record<string, unknown>): Promise<string> {
  const client = await getSheetsClient();
  if (!client) return "❌ Google Sheets 未設定。";

  const orderId = String(args.orderId ?? "").trim();
  const newStatus = String(args.status ?? "").trim() as PurchaseOrderStatus;
  const validStatuses = ["draft", "confirmed", "received", "cancelled"];

  if (!orderId) return "❌ 請提供採購單號。";
  if (!validStatuses.includes(newStatus)) return `❌ 無效狀態「${newStatus}」，可用：${validStatuses.join("、")}`;

  const STATUS_LABEL: Record<string, string> = {
    draft: "草稿", confirmed: "已確認", received: "已到貨", cancelled: "已取消",
  };

  try {
    const res = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: "採購單!A2:A",
    });
    const ids = ((res.data.values ?? []).flat()) as string[];
    const rowIndex = ids.indexOf(orderId);
    if (rowIndex === -1) return `❌ 找不到採購單「${orderId}」。`;

    const sheetRow = rowIndex + 2;
    await client.sheets.spreadsheets.values.update({
      spreadsheetId: client.spreadsheetId,
      range: `採購單!L${sheetRow}`,
      valueInputOption: "RAW",
      requestBody: { values: [[newStatus]] },
    });

    return `✅ 採購單 ${orderId} 狀態已更新為「${STATUS_LABEL[newStatus]}」。`;
  } catch (e) {
    return `❌ 更新失敗：${e instanceof Error ? e.message : String(e)}`;
  }
}

async function handleQueryAfterSales(args: Record<string, unknown>): Promise<string> {
  const statusFilter = String(args.status ?? "").trim();
  const keyword = String(args.keyword ?? "").toLowerCase();
  const limit = Math.min(Number(args.limit ?? 5), 20);

  const STATUS_LABEL: Record<string, string> = {
    pending: "待處理", scheduled: "已排程", in_progress: "處理中", completed: "已完成",
  };

  try {
    let services = await listServices();

    if (statusFilter) services = services.filter((s) => s.status === statusFilter);
    if (keyword) services = services.filter((s) => s.clientName.toLowerCase().includes(keyword));

    services = services
      .sort((a, b) => b.serviceId.localeCompare(a.serviceId))
      .slice(0, limit);

    if (services.length === 0) {
      return statusFilter ? `找不到狀態為「${STATUS_LABEL[statusFilter] ?? statusFilter}」的報修單。` : "目前沒有報修單。";
    }

    const lines = services.map((s, i) =>
      `${i + 1}. ${s.serviceId}\n   ${s.clientName}／${STATUS_LABEL[s.status] ?? s.status}\n   ${s.issueDescription.slice(0, 30)}${s.issueDescription.length > 30 ? "…" : ""}`
    );
    return `最近 ${services.length} 筆報修單：\n\n${lines.join("\n\n")}`;
  } catch (e) {
    return `❌ 查詢失敗：${e instanceof Error ? e.message : String(e)}`;
  }
}

async function handleQueryInvoices(args: Record<string, unknown>): Promise<string> {
  const client = await getSheetsClient();
  if (!client) return "❌ Google Sheets 未設定。";

  const statusFilter = String(args.status ?? "").trim();
  const limit = Math.min(Number(args.limit ?? 5), 20);

  const STATUS_LABEL: Record<string, string> = {
    draft: "草稿", issued: "已開立", cancelled: "已作廢",
  };

  try {
    let records = await getEInvoiceRecords(client);

    if (statusFilter) records = records.filter((r) => r.status === statusFilter);

    records = records
      .sort((a, b) => b.invoiceId.localeCompare(a.invoiceId))
      .slice(0, limit);

    if (records.length === 0) {
      return statusFilter ? `找不到狀態為「${STATUS_LABEL[statusFilter] ?? statusFilter}」的發票。` : "目前沒有發票。";
    }

    const lines = records.map((r, i) =>
      `${i + 1}. ${r.invoiceId}\n   ${r.buyerName}／NT$${r.totalAmount.toLocaleString()}／${STATUS_LABEL[r.status] ?? r.status}${r.providerInvoiceNo ? `\n   發票號：${r.providerInvoiceNo}` : ""}`
    );
    return `最近 ${records.length} 筆發票：\n\n${lines.join("\n\n")}`;
  } catch (e) {
    return `❌ 查詢失敗：${e instanceof Error ? e.message : String(e)}`;
  }
}

async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  if (name === "create_invoice") return handleCreateInvoice(args);
  if (name === "create_after_sales") return handleCreateAfterSales(args);
  if (name === "query_purchase_orders") return handleQueryPurchaseOrders(args);
  if (name === "create_purchase_order") return handleCreatePurchaseOrder(args);
  if (name === "query_clients") return handleQueryClients(args);
  if (name === "query_quotes") return handleQueryQuotes(args);
  if (name === "update_purchase_status") return handleUpdatePurchaseStatus(args);
  if (name === "query_after_sales") return handleQueryAfterSales(args);
  if (name === "query_invoices") return handleQueryInvoices(args);
  return `未知工具：${name}`;
}

const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

const SYSTEM_PROMPT = `你是馬鈴薯沙發的業務助理，幫老闆用一句話快速建立或查詢工作單。今天日期：${new Date().toISOString().slice(0, 10)}。

你能做的事：
- 開立電子發票（create_invoice）
- 建立售後報修單（create_after_sales）
- 查詢採購單（query_purchase_orders）
- 建立採購單草稿（create_purchase_order）
- 更新採購單狀態（update_purchase_status）
- 查詢客戶資料（query_clients）
- 查詢報價單（query_quotes）
- 查詢售後報修單（query_after_sales）
- 查詢電子發票（query_invoices）

說話風格：簡短、有效率、用繁體中文。

處理原則（重要）：
- 金額統一視為含稅總金額，稅率預設 5%
- 查詢類工具（query_*）的所有參數都是選填的。使用者說「查採購單」、「查報修單」，直接呼叫工具，不要再問狀態或關鍵字
- 工具回傳的結果必須完整顯示給使用者，不要壓縮或摘要成一句話
- 執行完工具後，直接把工具結果貼出來，不要加多餘的前言或後語

建立類工具的欄位詢問規則：
當使用者要「開立電子發票」但沒有提供資料時，顯示完整欄位清單：
---
開立電子發票，請提供以下資訊：

必填：
· 買方名稱：
· 含稅總金額：

選填（不填可留空）：
· 統一編號（公司/行號才填）：
· 品項名稱（預設：服務費）：
· 備註：
· 發票日期（預設：今天）：
---
當使用者要「建立售後報修單」但沒有提供資料時，顯示：
---
建立報修單，請提供以下資訊：

必填：
· 客戶姓名：
· 問題描述：

選填（不填可留空）：
· 客戶電話：
---
使用者補充選填欄位時（例如「備註是...」、「統編是...」），結合上文資訊一起呼叫工具。

【立刻執行工具的觸發規則】（最重要）
以下情況必須直接呼叫對應工具，不要再回覆「好的」或「收到」：
- 使用者提供了買方名稱 + 金額（任何格式）→ 立刻呼叫 create_invoice
- 使用者提供了客戶姓名 + 問題描述 → 立刻呼叫 create_after_sales
- 使用者提供了廠商名稱 + 品項清單 → 立刻呼叫 create_purchase_order
- 使用者用條列式（· 欄位：值）回填剛才詢問的表單 → 解析所有欄位，立刻呼叫工具
不允許在工具呼叫前先回覆任何文字。`;

const HISTORY_MAX_PAIRS = 6;
const HISTORY_TTL_MS = 30 * 60 * 1000;
const userHistories = new Map<string, { history: Content[]; ts: number }>();

export async function runAgent(userMessage: string, userId?: string): Promise<string> {
  // Built-in command: clear conversation history
  if (/^(清除|重置|reset|clear)$/i.test(userMessage.trim())) {
    if (userId) userHistories.delete(userId);
    return "✅ 對話記憶已清除。";
  }

  const model = genai.getGenerativeModel({
    model: "gemini-2.5-flash",
    tools: [{ functionDeclarations }],
    systemInstruction: SYSTEM_PROMPT,
  });

  // Load per-user history (in-process memory, 30-min TTL)
  let history: Content[] = [];
  if (userId) {
    const stored = userHistories.get(userId);
    if (stored && Date.now() - stored.ts < HISTORY_TTL_MS) {
      history = stored.history;
    }
  }

  const chat = model.startChat({ history });
  let result = await chat.sendMessage(userMessage);
  let lastToolResult = "";

  for (let round = 0; round < 3; round++) {
    const calls = result.response.functionCalls();
    if (!calls || calls.length === 0) break;

    const toolResponses = await Promise.all(
      calls.map(async (call) => {
        const toolResult = await executeTool(call.name, call.args as Record<string, unknown>);
        lastToolResult = toolResult;
        return {
          functionResponse: {
            name: call.name,
            response: { result: toolResult },
          },
        };
      }),
    );

    result = await chat.sendMessage(toolResponses);
  }

  const text = result.response.text().trim();

  // Debug: log finish reason when there's no output
  if (!text && !lastToolResult) {
    const candidate = result.response.candidates?.[0];
    console.warn("[agent] empty response — finishReason:", candidate?.finishReason, "| message:", userMessage);
    console.warn("[agent] history length at call:", history.length);
    // Don't save history when there was no useful output — prevents polluting next call
    return "（沒有回應，請輸入「清除」後重試）";
  }

  // Save updated history — keep only plain text turns (skip function call/response entries)
  if (userId) {
    const full = await chat.getHistory();
    const textOnly = full.filter((entry) =>
      entry.parts.length > 0 && entry.parts.every((p) => "text" in p && typeof p.text === "string"),
    );
    // Trim first, then re-anchor to first user — prevents slice(-N) landing on a model entry
    const sliced = textOnly.slice(-(HISTORY_MAX_PAIRS * 2));
    const firstUser = sliced.findIndex((e) => e.role === "user");
    const trimmed = firstUser >= 0 ? sliced.slice(firstUser) : [];
    userHistories.set(userId, { history: trimmed, ts: Date.now() });
  }

  // Gemini 2.5 sometimes returns empty text after tool calls — fall back to raw tool result
  return text || lastToolResult;
}
