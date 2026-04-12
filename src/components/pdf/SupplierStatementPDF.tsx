import path from "node:path";

import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

import type { PurchaseOrderStatus } from "@/lib/types";

const PUBLIC_DIR = path.join(process.cwd(), "public");
const NOTO_SANS_REGULAR = path.join(PUBLIC_DIR, "fonts", "NotoSansTC-Regular.ttf");
const NOTO_SANS_BOLD = path.join(PUBLIC_DIR, "fonts", "NotoSansTC-Bold.ttf");
const LOGO_PATH = path.join(PUBLIC_DIR, "logo.png");

Font.register({
  family: "NotoSansTC",
  fonts: [
    { src: NOTO_SANS_REGULAR, fontWeight: 400 },
    { src: NOTO_SANS_BOLD, fontWeight: 700 },
  ],
});

Font.registerHyphenationCallback((word) => [word]);

const C = {
  black: "#111111",
  dark: "#333333",
  muted: "#666666",
  border: "#D1D5DB",
  headerBg: "#F3F4F6",
  white: "#FFFFFF",
} as const;

const s = StyleSheet.create({
  page: {
    fontFamily: "NotoSansTC",
    fontSize: 9,
    color: C.black,
    paddingTop: 36,
    paddingBottom: 42,
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
  brandSub: { fontSize: 7.5, color: C.muted, marginTop: 1 },
  headerRight: { alignItems: "flex-end" },
  docTitle: { fontSize: 16, fontWeight: 700, color: C.black },
  docSub: { fontSize: 8, color: C.muted, marginTop: 2 },

  infoBlock: { flexDirection: "row", marginBottom: 14, gap: 20 },
  infoCol: { flex: 1 },
  infoTitle: {
    fontSize: 8,
    fontWeight: 700,
    color: C.muted,
    marginBottom: 6,
    paddingBottom: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: C.border,
  },
  infoRow: { flexDirection: "row", marginBottom: 2.5 },
  infoLabel: { width: 56, fontSize: 8, color: C.muted },
  infoValue: { flex: 1, fontSize: 8.5, color: C.dark },

  sectionTitle: {
    fontSize: 10,
    fontWeight: 700,
    marginBottom: 6,
  },

  table: { marginBottom: 12 },
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
  colDate: { width: 42 },
  colOrderId: { width: 84 },
  colCase: { flex: 1 },
  colAmount: { width: 72, textAlign: "right" },
  colStatus: { width: 52, textAlign: "center" },

  summaryBlock: { flexDirection: "row", gap: 18, marginBottom: 12 },
  summaryTable: { width: 240 },
  summaryRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: C.border,
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  summaryHeader: {
    backgroundColor: C.headerBg,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: C.border,
  },
  summaryLabel: { flex: 1, fontSize: 8.5 },
  summaryCount: { width: 36, fontSize: 8.5, textAlign: "right" },
  summaryAmount: { width: 72, fontSize: 8.5, textAlign: "right" },
  noteBox: {
    flex: 1,
    padding: 8,
    backgroundColor: C.headerBg,
    borderRadius: 3,
  },
  noteTitle: { fontSize: 8, fontWeight: 700, color: C.muted, marginBottom: 5 },
  noteText: { fontSize: 8.5, color: C.dark, lineHeight: 1.5, marginBottom: 3 },

  signatureBlock: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: C.border,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16,
  },
  signatureCol: { flex: 1 },
  signatureLine: {
    marginTop: 22,
    borderTopWidth: 0.8,
    borderTopColor: C.dark,
    paddingTop: 6,
    fontSize: 8.5,
    color: C.dark,
  },
});

interface SupplierStatementSummaryItem {
  count: number;
  amount: number;
}

export interface SupplierStatementPDFProps {
  supplier: {
    supplierId: string;
    name: string;
    shortName: string;
    contactPerson: string;
    phone: string;
    address: string;
  };
  month: string;
  orders: Array<{
    orderDate: string;
    orderId: string;
    caseId: string;
    caseNameSnapshot: string;
    totalAmount: number;
    status: PurchaseOrderStatus;
  }>;
  summary: {
    draft: SupplierStatementSummaryItem;
    ordered: SupplierStatementSummaryItem;
    received: SupplierStatementSummaryItem;
    confirmed: SupplierStatementSummaryItem;
    total: SupplierStatementSummaryItem;
  };
  generatedAt: string;
}

function fmt(n: number): string {
  return new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 }).format(n);
}

function fmtCurrency(n: number): string {
  return `NT$ ${fmt(n)}`;
}

function formatMonthLabel(month: string): string {
  const [year, monthPart] = month.split("-");
  return `${year} 年 ${Number(monthPart)} 月`;
}

function parseDateParts(value: string): { year: number; month: number; day: number } | null {
  const normalized = value.trim().replace(/\//g, "-");
  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return null;

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function formatDateLabel(value: string): string {
  const parts = parseDateParts(value);
  if (!parts) return value;
  return `${String(parts.month).padStart(2, "0")}/${String(parts.day).padStart(2, "0")}`;
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed);
}

function getMonthRange(month: string): string {
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const start = new Date(year, monthIndex, 1);
  const end = new Date(year, monthIndex + 1, 0);
  const formatter = new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return `${formatter.format(start)} - ${formatter.format(end)}`;
}

function getStatusLabel(status: PurchaseOrderStatus): string {
  switch (status) {
    case "draft":
      return "草稿";
    case "sent":
      return "已下單";
    case "confirmed":
      return "已確認";
    case "received":
      return "已收貨";
    case "cancelled":
      return "已取消";
  }
}

function SupplierStatementDocument({
  supplier,
  month,
  orders,
  summary,
  generatedAt,
}: SupplierStatementPDFProps) {
  const notes: string[] = [];

  if (summary.draft.count > 0) {
    notes.push("草稿單尚未確認，實際金額可能變動。");
  }
  if (summary.received.count > 0) {
    notes.push("已收貨但未完成最終確認的單據，請於月底前完成核對。");
  }
  if (notes.length === 0) {
    notes.push("本月採購單皆已納入統計，可直接作為對帳依據。");
  }

  return (
    <Document
      title={`月對帳報表 ${supplier.shortName || supplier.name} ${month}`}
      author="馬鈴薯沙發"
    >
      <Page size="A4" style={s.page}>
        <View style={s.header} fixed>
          <View style={s.headerLeft}>
            <Image src={LOGO_PATH} style={s.logo} />
            <View>
              <Text style={s.brandName}>馬鈴薯沙發</Text>
              <Text style={s.brandSub}>Potato Sofa</Text>
            </View>
          </View>
          <View style={s.headerRight}>
            <Text style={s.docTitle}>月對帳報表</Text>
            <Text style={s.docSub}>MONTHLY SUPPLIER STATEMENT</Text>
          </View>
        </View>

        <View style={s.infoBlock}>
          <View style={s.infoCol}>
            <Text style={s.infoTitle}>廠商資訊</Text>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>廠商</Text>
              <Text style={s.infoValue}>{supplier.name}</Text>
            </View>
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
            {supplier.address ? (
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>地址</Text>
                <Text style={s.infoValue}>{supplier.address}</Text>
              </View>
            ) : null}
          </View>

          <View style={s.infoCol}>
            <Text style={s.infoTitle}>對帳資訊</Text>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>期間</Text>
              <Text style={s.infoValue}>{formatMonthLabel(month)}</Text>
            </View>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>範圍</Text>
              <Text style={s.infoValue}>{getMonthRange(month)}</Text>
            </View>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>單據數</Text>
              <Text style={s.infoValue}>{summary.total.count} 筆</Text>
            </View>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>產生時間</Text>
              <Text style={s.infoValue}>{formatDateTime(generatedAt)}</Text>
            </View>
          </View>
        </View>

        <Text style={s.sectionTitle}>採購明細</Text>
        <View style={s.table}>
          <View style={s.tHead}>
            <Text style={[s.tHeadText, s.colIdx]}>#</Text>
            <Text style={[s.tHeadText, s.colDate]}>日期</Text>
            <Text style={[s.tHeadText, s.colOrderId]}>單號</Text>
            <Text style={[s.tHeadText, s.colCase]}>案件</Text>
            <Text style={[s.tHeadText, s.colAmount]}>金額</Text>
            <Text style={[s.tHeadText, s.colStatus]}>狀態</Text>
          </View>

          {orders.length > 0 ? (
            orders.map((order, index) => (
              <View style={s.tRow} key={order.orderId} wrap={false}>
                <Text style={[s.tCell, s.colIdx]}>{index + 1}</Text>
                <Text style={[s.tCell, s.colDate]}>{formatDateLabel(order.orderDate)}</Text>
                <Text style={[s.tCell, s.colOrderId]}>{order.orderId}</Text>
                <Text style={[s.tCell, s.colCase]}>
                  {order.caseId || order.caseNameSnapshot || "—"}
                </Text>
                <Text style={[s.tCellR, s.colAmount]}>{fmtCurrency(order.totalAmount)}</Text>
                <Text style={[s.tCell, s.colStatus]}>{getStatusLabel(order.status)}</Text>
              </View>
            ))
          ) : (
            <View style={s.tRow}>
              <Text style={[s.tCell, { flex: 1 }]}>本月無符合條件的採購單。</Text>
            </View>
          )}
        </View>

        <Text style={s.sectionTitle}>統計摘要</Text>
        <View style={s.summaryBlock}>
          <View style={s.summaryTable}>
            <View style={[s.summaryRow, s.summaryHeader]}>
              <Text style={s.summaryLabel}>狀態</Text>
              <Text style={s.summaryCount}>筆數</Text>
              <Text style={s.summaryAmount}>金額</Text>
            </View>
            <View style={s.summaryRow}>
              <Text style={s.summaryLabel}>草稿</Text>
              <Text style={s.summaryCount}>{summary.draft.count}</Text>
              <Text style={s.summaryAmount}>{fmtCurrency(summary.draft.amount)}</Text>
            </View>
            <View style={s.summaryRow}>
              <Text style={s.summaryLabel}>已下單</Text>
              <Text style={s.summaryCount}>{summary.ordered.count}</Text>
              <Text style={s.summaryAmount}>{fmtCurrency(summary.ordered.amount)}</Text>
            </View>
            <View style={s.summaryRow}>
              <Text style={s.summaryLabel}>已收貨</Text>
              <Text style={s.summaryCount}>{summary.received.count}</Text>
              <Text style={s.summaryAmount}>{fmtCurrency(summary.received.amount)}</Text>
            </View>
            <View style={s.summaryRow}>
              <Text style={s.summaryLabel}>已確認</Text>
              <Text style={s.summaryCount}>{summary.confirmed.count}</Text>
              <Text style={s.summaryAmount}>{fmtCurrency(summary.confirmed.amount)}</Text>
            </View>
            <View style={[s.summaryRow, s.summaryHeader]}>
              <Text style={s.summaryLabel}>總計</Text>
              <Text style={s.summaryCount}>{summary.total.count}</Text>
              <Text style={s.summaryAmount}>{fmtCurrency(summary.total.amount)}</Text>
            </View>
          </View>

          <View style={s.noteBox}>
            <Text style={s.noteTitle}>備註</Text>
            {notes.map((note) => (
              <Text key={note} style={s.noteText}>
                • {note}
              </Text>
            ))}
          </View>
        </View>

        <View style={s.signatureBlock}>
          <View style={s.signatureCol}>
            <Text style={s.signatureLine}>廠商簽章 / 日期</Text>
          </View>
          <View style={s.signatureCol}>
            <Text style={s.signatureLine}>本公司簽章 / 日期</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

export function SupplierStatementPDF(props: SupplierStatementPDFProps) {
  return <SupplierStatementDocument {...props} />;
}
