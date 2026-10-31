import type { CustomOrder, OrderItem, OrderNote } from "@/lib/types";

// 技師「我的安裝」的安全投影（/api/sheets/orders/my-installs）。
//
// 施工要的是地址、聯絡電話、品項；金額、成本一律不給。
// 🔴 2026-11-01：原本還回傳 internalNotes（內部備註，業務寫給自己看的，可能含
//    價格交涉、客人評價），畫面根本沒用到，卻每次都送到師傅手機上。已拿掉。
//    抽成獨立函式是為了讓「哪些欄位會出去」有測試在守（my-installs.test.ts）。

export interface MyInstallView {
  orderId: string;
  orderNumber: string;
  clientName: string;
  orderTitle: string;
  itemCategory: string;
  deliveryMethod: string;
  status: string;
  installDate: string;
  extraInstallDates: string[];
  shipDate: string;
  installAssignedTo: string;
  installAddress: string;
  installContactName: string;
  installContactPhone: string;
  materialName: string;
  materialCode: string;
  materialImageUrl: string;
  workOrderPdfUrl: string;
  items: OrderItem[];
  notes: OrderNote[];
}

export function pickMyInstallView(o: CustomOrder): MyInstallView {
  return {
    // 安全投影：施工資訊 only，無任何金額欄位、無內部備註
    orderId: o.orderId,
    orderNumber: o.orderNumber,
    clientName: o.clientName,
    orderTitle: o.orderTitle,
    itemCategory: o.itemCategory,
    deliveryMethod: o.deliveryMethod,
    status: o.status,
    installDate: o.installDate,
    extraInstallDates: o.extraInstallDates ?? [],
    shipDate: o.shipDate ?? "",
    installAssignedTo: o.installAssignedTo ?? "",
    installAddress: o.installAddress ?? "",
    installContactName: o.installContactName ?? "",
    installContactPhone: o.installContactPhone ?? "",
    materialName: o.materialName,
    materialCode: o.materialCode,
    materialImageUrl: o.materialImageUrl,
    workOrderPdfUrl: o.workOrderPdfUrl ?? "",
    items: o.items,
    notes: o.notes,
  };
}
