"use client";

import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
  pdf,
} from "@react-pdf/renderer";

Font.register({
  family: "NotoSansTC",
  fonts: [
    { src: "/fonts/NotoSansTC-Regular.ttf", fontWeight: 400 },
    { src: "/fonts/NotoSansTC-Bold.ttf", fontWeight: 700 },
  ],
});

Font.registerHyphenationCallback((word) => [word]);

// 請款對帳單版型 — 依既有 Excel 對帳單版面重現
// （馬鈴薯沙發工廠／N年N月份出貨明細／應收帳款對帳單／明細表／小計稅額總額／付款資訊）

export interface StatementRow {
  /** YYYY-MM-DD；顯示為 M月D日 */
  date: string;
  /** 品名（可含換行，第二行放客戶單號等） */
  name: string;
  qty: number;
  unit: string;
  unitPrice: number;
  amount: number;
}

export interface StatementData {
  /** 例：115年07月份 */
  rocMonthTitle: string;
  clientName: string;
  taxId: string;
  rows: StatementRow[];
  subtotal: number;
  /** 0 = 顯示空白（免稅） */
  taxAmount: number;
  total: number;
}

// 付款資訊（列印於每張對帳單底部）
const PAYMENT_FOOTER = {
  notes: [
    "▲ 貨款全額付清，此為現金價，請勿扣其他費用。",
    "▲ 若有帳務相關問題，請洽工廠會計。",
  ],
  lines: [
    "支付方式：月結30天 現金 / 匯款",
    "銀行戶名：陳涵儀",
    "轉帳銀行：永豐銀行(807) / 營業部(1217)",
    "帳號：06801800918474",
    "使用臨櫃存入或ATM轉入，請註明客戶名稱，以利對帳。",
  ],
};

const BORDER = "#111111";

const s = StyleSheet.create({
  page: {
    fontFamily: "NotoSansTC",
    fontSize: 11,
    color: "#111111",
    paddingTop: 36,
    paddingBottom: 40,
    paddingHorizontal: 36,
    backgroundColor: "#FFFFFF",
  },
  title: { fontSize: 18, fontWeight: 700, textAlign: "center", marginBottom: 6 },
  subtitle: { fontSize: 13, fontWeight: 700, textAlign: "center", marginBottom: 2 },
  docType: {
    fontSize: 12,
    fontWeight: 700,
    textAlign: "center",
    textDecoration: "underline",
    marginBottom: 14,
  },
  clientRow: { flexDirection: "row", marginBottom: 6, alignItems: "baseline" },
  clientLabel: { fontSize: 11, fontWeight: 700, marginRight: 8 },
  clientName: { fontSize: 12, fontWeight: 700 },

  table: { borderWidth: 1.5, borderColor: BORDER },
  headRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    backgroundColor: "#FFFFFF",
  },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: BORDER },
  rowLast: { flexDirection: "row" },
  th: { fontSize: 11, fontWeight: 700, textAlign: "center", paddingVertical: 5 },
  td: { fontSize: 11, paddingVertical: 6, paddingHorizontal: 4 },
  cIdx: { width: "7%", borderRightWidth: 1, borderRightColor: BORDER, textAlign: "center" },
  cDate: { width: "12%", borderRightWidth: 1, borderRightColor: BORDER, textAlign: "center" },
  cName: { width: "45%", borderRightWidth: 1, borderRightColor: BORDER },
  cQty: { width: "7%", borderRightWidth: 1, borderRightColor: BORDER, textAlign: "center" },
  cUnit: { width: "7%", borderRightWidth: 1, borderRightColor: BORDER, textAlign: "center" },
  cPrice: { width: "10%", borderRightWidth: 1, borderRightColor: BORDER, textAlign: "right" },
  cAmt: { width: "12%", textAlign: "right" },

  totalsBlock: { flexDirection: "row", justifyContent: "flex-end", marginTop: 0 },
  totalsTable: { width: "42%" },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: "#999999",
  },
  totalsLabel: { fontSize: 11, fontWeight: 700 },
  totalsValue: { fontSize: 11, fontWeight: 700 },
  grandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderBottomWidth: 2,
    borderBottomColor: BORDER,
  },
  grandLabel: { fontSize: 12, fontWeight: 700 },
  grandValue: { fontSize: 12, fontWeight: 700 },

  footer: { marginTop: 22 },
  footerNote: { fontSize: 12, fontWeight: 700, marginBottom: 6 },
  footerGap: { height: 12 },
  footerLine: { fontSize: 12, fontWeight: 700, marginBottom: 4 },

  pageNo: {
    position: "absolute",
    bottom: 18,
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 9,
    color: "#888888",
  },
});

function fmtMoney(n: number): string {
  return `$ ${Math.round(n).toLocaleString("zh-TW")}`;
}

function fmtDate(iso: string): string {
  const m = iso.match(/^\d{4}-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${Number(m[1])}月${Number(m[2])}日`;
}

function StatementDocument({ data }: { data: StatementData }) {
  return (
    <Document title={`${data.clientName} ${data.rocMonthTitle}應收帳款對帳單`}>
      <Page size="A4" style={s.page}>
        <Text style={s.title}>馬鈴薯沙發工廠</Text>
        <Text style={s.subtitle}>{data.rocMonthTitle}出貨明細</Text>
        <Text style={s.docType}>應收帳款對帳單</Text>

        <View style={s.clientRow}>
          <Text style={s.clientLabel}>客戶名稱:</Text>
          <Text style={s.clientName}>
            {data.clientName}
            {data.taxId ? `(${data.taxId})` : ""}
          </Text>
        </View>

        <View style={s.table}>
          <View style={s.headRow}>
            <Text style={[s.th, s.cIdx]}>項次</Text>
            <Text style={[s.th, s.cDate]}>日期</Text>
            <Text style={[s.th, s.cName]}>品　　名</Text>
            <Text style={[s.th, s.cQty]}>數量</Text>
            <Text style={[s.th, s.cUnit]}>單位</Text>
            <Text style={[s.th, s.cPrice]}>單價</Text>
            <Text style={[s.th, s.cAmt]}>金　額</Text>
          </View>
          {data.rows.map((row, i) => (
            <View key={i} style={i === data.rows.length - 1 ? s.rowLast : s.row} wrap={false}>
              <Text style={[s.td, s.cIdx]}>{i + 1}</Text>
              <Text style={[s.td, s.cDate]}>{fmtDate(row.date)}</Text>
              <Text style={[s.td, s.cName]}>{row.name}</Text>
              <Text style={[s.td, s.cQty]}>{row.qty}</Text>
              <Text style={[s.td, s.cUnit]}>{row.unit}</Text>
              <Text style={[s.td, s.cPrice]}>{Math.round(row.unitPrice).toLocaleString("zh-TW")}</Text>
              <Text style={[s.td, s.cAmt]}>{fmtMoney(row.amount)}</Text>
            </View>
          ))}
        </View>

        <View style={s.totalsBlock}>
          <View style={s.totalsTable}>
            <View style={s.totalsRow}>
              <Text style={s.totalsLabel}>小計</Text>
              <Text style={s.totalsValue}>{fmtMoney(data.subtotal)}</Text>
            </View>
            <View style={s.totalsRow}>
              <Text style={s.totalsLabel}>稅額</Text>
              <Text style={s.totalsValue}>{data.taxAmount > 0 ? fmtMoney(data.taxAmount) : ""}</Text>
            </View>
            <View style={s.grandRow}>
              <Text style={s.grandLabel}>總額</Text>
              <Text style={s.grandValue}>{fmtMoney(data.total)}</Text>
            </View>
          </View>
        </View>

        <View style={s.footer}>
          {PAYMENT_FOOTER.notes.map((line) => (
            <Text key={line} style={s.footerNote}>{line}</Text>
          ))}
          <View style={s.footerGap} />
          {PAYMENT_FOOTER.lines.map((line) => (
            <Text key={line} style={s.footerLine}>{line}</Text>
          ))}
        </View>

        <Text
          style={s.pageNo}
          render={({ pageNumber, totalPages }) => `第 ${pageNumber} 頁，共 ${totalPages} 頁`}
          fixed
        />
      </Page>
    </Document>
  );
}

export async function generateStatementPdfBlob(data: StatementData): Promise<Blob> {
  return pdf(<StatementDocument data={data} />).toBlob();
}

export function buildStatementFileName(data: StatementData): string {
  return `${data.rocMonthTitle}對帳單-${data.clientName}.pdf`;
}
