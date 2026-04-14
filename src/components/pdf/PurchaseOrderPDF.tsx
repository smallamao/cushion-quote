"use client";

import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  pdf,
} from "@react-pdf/renderer";

import type {
  PurchaseOrder,
  PurchaseOrderItem,
  SystemSettings,
} from "@/lib/types";

Font.register({
  family: "NotoSansTC",
  fonts: [
    { src: "/fonts/NotoSansTC-Regular.ttf", fontWeight: 400 },
    { src: "/fonts/NotoSansTC-Bold.ttf", fontWeight: 700 },
  ],
});

Font.registerHyphenationCallback((word) => [word]);

const C = {
  black: "#111111",
  dark: "#333333",
  muted: "#666666",
  light: "#999999",
  border: "#D1D5DB",
  headerBg: "#F3F4F6",
  accent: "#2563EB",
  white: "#FFFFFF",
} as const;

const s = StyleSheet.create({
  page: {
    fontFamily: "NotoSansTC",
    fontSize: 9,
    color: C.black,
    paddingTop: 36,
    paddingBottom: 50,
    paddingHorizontal: 36,
    backgroundColor: C.white,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1.5,
    borderBottomColor: C.black,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  logo: { width: 42, height: 42 },
  brandName: { fontSize: 14, fontWeight: 700, color: C.black },
  headerRight: { alignItems: "flex-end" },
  docTitle: { fontSize: 16, fontWeight: 700, color: C.black },
  docSub: { fontSize: 8, color: C.muted, marginTop: 2 },

  infoBlock: { flexDirection: "row", marginBottom: 14, gap: 20 },
  infoCol: { flex: 1 },
  infoTitle: {
    fontSize: 8,
    fontWeight: 700,
    color: C.muted,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    marginBottom: 6,
    paddingBottom: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: C.border,
  },
  infoRow: { flexDirection: "row", marginBottom: 2.5 },
  infoLabel: { width: 70, fontSize: 8, color: C.muted },
  infoValue: { flex: 1, fontSize: 8.5, color: C.dark },

  table: { marginBottom: 10 },
  tHead: {
    flexDirection: "row",
    backgroundColor: C.headerBg,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: C.border,
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  tHeadText: { fontSize: 7.5, fontWeight: 700, color: C.muted },
  tRow: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: C.border,
  },
  tCell: { fontSize: 8.5 },
  tCellR: { fontSize: 8.5, textAlign: "right" },

  colIdx: { width: 22 },
  colCode: { width: 64 },
  colName: { flex: 1.4 },
  colSpec: { flex: 0.9 },
  colQty: { width: 32, textAlign: "right" },
  colUnit: { width: 24, textAlign: "center" },
  colPrice: { width: 50, textAlign: "right" },
  colAmount: { width: 56, textAlign: "right" },
  colNotes: { width: 56, fontSize: 8, color: C.muted, paddingLeft: 4 },

  totalsBlock: { alignItems: "flex-end", marginBottom: 14 },
  totalRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    width: 200,
    marginBottom: 2.5,
  },
  totalLabel: {
    width: 90,
    textAlign: "right",
    fontSize: 8.5,
    color: C.muted,
    paddingRight: 10,
  },
  totalValue: { width: 110, textAlign: "right", fontSize: 8.5 },
  grandRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    width: 200,
    paddingTop: 5,
    borderTopWidth: 1.5,
    borderTopColor: C.black,
    marginTop: 3,
  },
  grandLabel: {
    width: 90,
    textAlign: "right",
    fontSize: 11,
    fontWeight: 700,
    color: C.black,
    paddingRight: 10,
  },
  grandValue: {
    width: 110,
    textAlign: "right",
    fontSize: 11,
    fontWeight: 700,
    color: C.black,
  },

  notesSection: { marginBottom: 12 },
  notesTitle: {
    fontSize: 8,
    fontWeight: 700,
    color: C.muted,
    marginBottom: 4,
    paddingBottom: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: C.border,
  },
  notesText: { fontSize: 9, color: C.dark, lineHeight: 1.6 },

  spacer: { flex: 1 },
  footer: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: C.border,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerCompany: { fontSize: 14, fontWeight: 700, color: C.black },
  footerInfo: { fontSize: 9, color: C.muted, lineHeight: 1.4 },
});

export interface PurchaseOrderPDFProps {
  order: PurchaseOrder;
  items: PurchaseOrderItem[];
  settings: SystemSettings;
}

function fmt(n: number): string {
  return new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 }).format(n);
}

function fmtCurrency(n: number): string {
  return n < 0 ? `-$${fmt(Math.abs(n))}` : `$${fmt(n)}`;
}

function sanitizeFileNameSegment(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
}

export function buildPurchasePdfFileName(
  order: Pick<PurchaseOrder, "orderId" | "supplierSnapshot">,
): string {
  const supplierName = sanitizeFileNameSegment(
    order.supplierSnapshot?.shortName || order.supplierSnapshot?.name || "",
  );
  if (!supplierName) return `${order.orderId}.pdf`;
  return `${order.orderId} - ${supplierName}.pdf`;
}

function PurchaseOrderDocument({ order, items, settings }: PurchaseOrderPDFProps) {
  const supplier = order.supplierSnapshot ?? {
    name: "",
    shortName: "",
    contactPerson: "",
    phone: "",
    fax: "",
    email: "",
    taxId: "",
    address: "",
    paymentMethod: "",
    paymentTerms: "",
  };

  return (
    <Document title={`採購單 ${order.orderId}`} author={settings.companyName}>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View style={s.headerLeft}>
            <Image src="/logo.png" style={s.logo} />
            <View>
              <Text style={s.brandName}>{settings.companyName}</Text>
            </View>
          </View>
          <View style={s.headerRight}>
            <Text style={s.docTitle}>採 購 單</Text>
            <Text style={s.docSub}>PURCHASE ORDER</Text>
          </View>
        </View>

        <View style={s.infoBlock}>
          <View style={s.infoCol}>
            <Text style={s.infoTitle}>供應商資訊</Text>
            {supplier.name ? (
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>廠商名稱</Text>
                <Text style={s.infoValue}>{supplier.name}</Text>
              </View>
            ) : null}
            {supplier.contactPerson ? (
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>聯絡人</Text>
                <Text style={s.infoValue}>{supplier.contactPerson}</Text>
              </View>
            ) : null}
            {supplier.phone ? (
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>電話</Text>
                <Text style={s.infoValue}>{supplier.phone}</Text>
              </View>
            ) : null}
            {supplier.fax ? (
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>傳真</Text>
                <Text style={s.infoValue}>{supplier.fax}</Text>
              </View>
            ) : null}
            {supplier.email ? (
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>E-mail</Text>
                <Text style={s.infoValue}>{supplier.email}</Text>
              </View>
            ) : null}
            {supplier.taxId ? (
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>統一編號</Text>
                <Text style={s.infoValue}>{supplier.taxId}</Text>
              </View>
            ) : null}
            {supplier.address ? (
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>地址</Text>
                <Text style={s.infoValue}>{supplier.address}</Text>
              </View>
            ) : null}
          </View>
          <View style={s.infoCol}>
            <Text style={s.infoTitle}>採購資訊</Text>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>採購單號</Text>
              <Text style={s.infoValue}>{order.orderId}</Text>
            </View>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>採購日期</Text>
              <Text style={s.infoValue}>{order.orderDate}</Text>
            </View>
            {order.expectedDeliveryDate ? (
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>預計到貨</Text>
                <Text style={s.infoValue}>{order.expectedDeliveryDate}</Text>
              </View>
            ) : null}
            {order.deliveryAddress ? (
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>送貨地址</Text>
                <Text style={s.infoValue}>{order.deliveryAddress}</Text>
              </View>
            ) : null}
            {supplier.paymentMethod ? (
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>付款方式</Text>
                <Text style={s.infoValue}>{supplier.paymentMethod}</Text>
              </View>
            ) : null}
            {supplier.paymentTerms ? (
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>付款條件</Text>
                <Text style={s.infoValue}>{supplier.paymentTerms}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={s.table}>
          <View style={s.tHead}>
            <Text style={[s.tHeadText, s.colIdx]}>項次</Text>
            <Text style={[s.tHeadText, s.colCode]}>商品編號</Text>
            <Text style={[s.tHeadText, s.colName]}>商品名稱</Text>
            <Text style={[s.tHeadText, s.colSpec]}>規格</Text>
            <Text style={[s.tHeadText, s.colQty]}>數量</Text>
            <Text style={[s.tHeadText, s.colUnit]}>單位</Text>
            <Text style={[s.tHeadText, s.colPrice]}>單價</Text>
            <Text style={[s.tHeadText, s.colAmount]}>金額</Text>
            <Text style={[s.tHeadText, s.colNotes]}>備註</Text>
          </View>
          {items.map((item, idx) => {
            const snapshot = item.productSnapshot ?? {
              productCode: "",
              productName: "",
              specification: "",
              unit: "碼" as const,
            };
            return (
              <View key={item.itemId || idx} style={s.tRow} wrap={false}>
                <Text style={[s.tCell, s.colIdx]}>{idx + 1}</Text>
                <Text style={[s.tCell, s.colCode]}>{snapshot.productCode}</Text>
                <Text style={[s.tCell, s.colName, { fontWeight: 700 }]}>
                  {snapshot.productName}
                </Text>
                <Text style={[s.tCell, s.colSpec]}>{snapshot.specification}</Text>
                <Text style={[s.tCellR, s.colQty]}>{item.quantity}</Text>
                <Text style={[s.tCell, s.colUnit]}>{snapshot.unit}</Text>
                <Text style={[s.tCellR, s.colPrice]}>
                  {fmtCurrency(item.unitPrice)}
                </Text>
                <Text style={[s.tCellR, s.colAmount]}>
                  {fmtCurrency(item.amount)}
                </Text>
                <Text style={s.colNotes}>{item.notes ?? ""}</Text>
              </View>
            );
          })}
        </View>

        <View style={s.totalsBlock}>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>小計</Text>
            <Text style={s.totalValue}>{fmtCurrency(order.subtotal)}</Text>
          </View>
          {order.shippingFee > 0 ? (
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>運費</Text>
              <Text style={s.totalValue}>{fmtCurrency(order.shippingFee)}</Text>
            </View>
          ) : null}
          {order.taxAmount > 0 ? (
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>稅額</Text>
              <Text style={s.totalValue}>{fmtCurrency(order.taxAmount)}</Text>
            </View>
          ) : null}
          <View style={s.grandRow}>
            <Text style={s.grandLabel}>總金額</Text>
            <Text style={s.grandValue}>{fmtCurrency(order.totalAmount)}</Text>
          </View>
        </View>

        {order.notes.trim() ? (
          <View style={s.notesSection}>
            <Text style={s.notesTitle}>備註</Text>
            {order.notes
              .split("\n")
              .filter((l) => l.trim())
              .map((line, idx) => (
                <Text key={idx} style={s.notesText}>
                  {line.trim()}
                </Text>
              ))}
          </View>
        ) : null}

        <View style={s.spacer} />

        <View style={s.footer}>
          <View style={{ flex: 1 }}>
            <Text style={s.footerCompany}>
              {settings.companyFullName || settings.companyName}
            </Text>
            {settings.companyTaxId ? (
              <Text style={s.footerInfo}>統編: {settings.companyTaxId}</Text>
            ) : null}
          </View>
          <View style={{ alignItems: "flex-end", flex: 1 }}>
            {settings.companyPhone ? (
              <Text style={s.footerInfo}>電話: {settings.companyPhone}</Text>
            ) : null}
            {settings.companyFax ? (
              <Text style={s.footerInfo}>傳真: {settings.companyFax}</Text>
            ) : null}
            {settings.companyAddress ? (
              <Text style={s.footerInfo}>地址: {settings.companyAddress}</Text>
            ) : null}
          </View>
        </View>
      </Page>
    </Document>
  );
}

export async function generatePurchasePdfBlob(
  props: PurchaseOrderPDFProps,
): Promise<Blob> {
  return pdf(<PurchaseOrderDocument {...props} />).toBlob();
}

export async function generateAndDownloadPurchasePdf(
  props: PurchaseOrderPDFProps,
): Promise<void> {
  const blob = await generatePurchasePdfBlob(props);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = buildPurchasePdfFileName(props.order);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
