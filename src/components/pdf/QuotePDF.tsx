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

import type { Channel, FlexQuoteItem, SystemSettings } from "@/lib/types";

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
  red: "#DC2626",
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
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  logo: { width: 42, height: 42 },
  brandBlock: {},
  brandName: { fontSize: 14, fontWeight: 700, color: C.black },
  brandSub: { fontSize: 7.5, color: C.muted, marginTop: 1 },
  headerRight: { alignItems: "flex-end" },
  docTitle: { fontSize: 16, fontWeight: 700, color: C.black },
  docSub: { fontSize: 8, color: C.muted, marginTop: 2 },

  infoBlock: {
    flexDirection: "row",
    marginBottom: 14,
    gap: 20,
  },
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
  infoLabel: { width: 58, fontSize: 8, color: C.muted },
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

  colIdx: { width: 24 },
  colName: { flex: 1.4 },
  colSpec: { flex: 1 },
  colQty: { width: 32, textAlign: "right" },
  colUnit: { width: 28, textAlign: "center" },
  colPrice: { width: 56, textAlign: "right" },
  colAmount: { width: 64, textAlign: "right" },

  itemImage: {
    marginTop: 4,
    maxWidth: 120,
    maxHeight: 80,
    objectFit: "contain" as const,
    borderRadius: 2,
  },
  specImage: {
    marginTop: 4,
    maxWidth: 90,
    maxHeight: 60,
    objectFit: "contain" as const,
    borderRadius: 2,
  },

  descSection: {
    marginBottom: 10,
    padding: 8,
    backgroundColor: C.headerBg,
    borderRadius: 3,
    flexDirection: "row" as const,
    gap: 10,
  },
  descLeft: { flex: 1 },
  descImage: {
    width: 140,
    maxHeight: 100,
    objectFit: "contain" as const,
    borderRadius: 2,
  },
  descTitle: { fontSize: 8, fontWeight: 700, color: C.muted, marginBottom: 4 },
  descText: { fontSize: 8.5, color: C.dark, lineHeight: 1.5 },

  totalsBlock: { alignItems: "flex-end", marginBottom: 14 },
  totalRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    width: 180,
    marginBottom: 2.5,
  },
  totalLabel: {
    width: 80,
    textAlign: "right",
    fontSize: 8.5,
    color: C.muted,
    paddingRight: 10,
  },
  totalValue: { width: 100, textAlign: "right", fontSize: 8.5 },
  grandRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    width: 180,
    paddingTop: 5,
    borderTopWidth: 1.5,
    borderTopColor: C.black,
    marginTop: 3,
  },
  grandLabel: {
    width: 80,
    textAlign: "right",
    fontSize: 11,
    fontWeight: 700,
    color: C.black,
    paddingRight: 10,
  },
  grandValue: {
    width: 100,
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
  notesText: { fontSize: 10, color: C.muted, lineHeight: 1.6 },

  spacer: { flex: 1 },
  footer: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: C.border,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerCompany: { fontSize: 16, fontWeight: 700, color: C.black },
  footerInfo: { fontSize: 12, color: C.muted, lineHeight: 1.4 },
});

export interface QuotePDFProps {
  quoteId: string;
  quoteDate: string;
  validityDays: number;
  client: {
    companyName: string;
    contactName: string;
    phone: string;
    email: string;
    address: string;
    taxId: string;
  };
  projectName: string;
  quoteName?: string;
  channel: Channel;
  items: FlexQuoteItem[];
  description: string;
  descriptionImageUrl?: string;
  includeTax: boolean;
  subtotal: number;
  tax: number;
  total: number;
  termsTemplate: string;
  settings: SystemSettings;
}

function fmt(n: number): string {
  return new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 }).format(n);
}

function fmtCurrency(n: number): string {
  return n < 0 ? `-$${fmt(Math.abs(n))}` : `$${fmt(n)}`;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatQuoteProjectName(projectName: string, quoteName?: string): string {
  const trimmedProjectName = projectName.trim();
  const trimmedQuoteName = quoteName?.trim() ?? "";

  if (!trimmedProjectName) return trimmedQuoteName;
  if (!trimmedQuoteName) return trimmedProjectName;

  return `${trimmedProjectName} - ${trimmedQuoteName}`;
}

function sanitizeFileNameSegment(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
}

export function buildPdfFileName(props: Pick<QuotePDFProps, "quoteId" | "projectName" | "quoteName">): string {
  const quoteProjectName = sanitizeFileNameSegment(
    formatQuoteProjectName(props.projectName, props.quoteName),
  );

  if (!quoteProjectName) {
    return `${props.quoteId}.pdf`;
  }

  return `${props.quoteId} - ${quoteProjectName}.pdf`;
}

function QuotePDFDocument(props: QuotePDFProps) {
  const {
    quoteId,
    quoteDate,
    validityDays,
    client,
    projectName,
    quoteName,
    channel,
    items,
    description,
    descriptionImageUrl,
    includeTax,
    subtotal,
    tax,
    total,
    termsTemplate,
    settings,
  } = props;

  const fw = (s: string) => s.replace(/：/g, ": ").replace(/，/g, ", ").replace(/；/g, "; ");

  const validUntil = addDays(quoteDate, validityDays);
  const quoteProjectName = formatQuoteProjectName(projectName, quoteName);

  return (
    <Document title={`報價單 ${quoteId}`} author={settings.companyName}>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View style={s.headerLeft}>
            <Image src="/logo.png" style={s.logo} />
            <View style={s.brandBlock}>
              <Text style={s.brandName}>{settings.companyName}</Text>
            </View>
          </View>
          <View style={s.headerRight}>
            <Text style={s.docTitle}>報 價 單</Text>
            <Text style={s.docSub}>QUOTATION</Text>
          </View>
        </View>

        <View style={s.infoBlock}>
          <View style={s.infoCol}>
            <Text style={s.infoTitle}>客戶資訊</Text>
            {client.companyName ? (
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>公司</Text>
                <Text style={s.infoValue}>{client.companyName}</Text>
              </View>
            ) : null}
            {client.contactName ? (
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>聯絡人</Text>
                <Text style={s.infoValue}>{client.contactName}</Text>
              </View>
            ) : null}
            {client.phone ? (
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>電話</Text>
                <Text style={s.infoValue}>{client.phone}</Text>
              </View>
            ) : null}
            {client.address ? (
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>地址</Text>
                <Text style={s.infoValue}>{client.address}</Text>
              </View>
            ) : null}
            {client.email ? (
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>E-mail</Text>
                <Text style={s.infoValue}>{client.email}</Text>
              </View>
            ) : null}
          </View>
          <View style={s.infoCol}>
            <Text style={s.infoTitle}>報價資訊</Text>
            {client.taxId ? (
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>統一編號</Text>
                <Text style={s.infoValue}>{client.taxId}</Text>
              </View>
            ) : null}
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>報價編號</Text>
              <Text style={s.infoValue}>{quoteId}</Text>
            </View>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>報價日期</Text>
              <Text style={s.infoValue}>{quoteDate}</Text>
            </View>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>有效期限</Text>
              <Text style={s.infoValue}>{validUntil}</Text>
            </View>
            {quoteProjectName ? (
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>報價案名</Text>
                <Text style={s.infoValue}>{quoteProjectName}</Text>
              </View>
            ) : null}

          </View>
        </View>

        <View style={s.table}>
          <View style={s.tHead}>
            <Text style={[s.tHeadText, s.colIdx]}>項次</Text>
            <Text style={[s.tHeadText, s.colName]}>商品名稱</Text>
            <Text style={[s.tHeadText, s.colSpec]}>規格</Text>
            <Text style={[s.tHeadText, s.colQty]}>數量</Text>
            <Text style={[s.tHeadText, s.colUnit]}>單位</Text>
            <Text style={[s.tHeadText, s.colPrice]}>單價</Text>
            <Text style={[s.tHeadText, s.colAmount]}>金額</Text>
          </View>
          {items.map((item, idx) => (
            <View key={item.id} style={s.tRow} wrap={false}>
              <Text style={[s.tCell, s.colIdx]}>{idx + 1}</Text>
              <View style={s.colName}>
                <Text style={[s.tCell, { fontWeight: 700 }]}>{item.name}</Text>
                {item.isCostItem && (
                  <Text style={[s.tCell, { color: C.red, marginTop: 1 }]}>
                    此為工本費支出
                  </Text>
                )}
                {item.imageUrl ? (
                  <Image src={item.imageUrl} style={s.itemImage} />
                ) : null}
              </View>
              <View style={s.colSpec}>
                <Text style={s.tCell}>{item.spec || ""}</Text>
                {item.specImageUrl ? (
                  <Image src={item.specImageUrl} style={s.specImage} />
                ) : null}
              </View>
              <Text style={[s.tCellR, s.colQty]}>{item.qty}</Text>
              <Text style={[s.tCell, s.colUnit]}>{item.unit}</Text>
              <Text style={[s.tCellR, s.colPrice]}>{fmtCurrency(item.unitPrice)}</Text>
              <Text style={[s.tCellR, s.colAmount]}>{fmtCurrency(item.amount)}</Text>
            </View>
          ))}
        </View>

        {description.trim() || descriptionImageUrl ? (
          <View style={s.descSection}>
            <View style={s.descLeft}>
              <Text style={s.descTitle}>補充說明</Text>
              {description.trim() ? (
                <Text style={s.descText}>{description}</Text>
              ) : null}
            </View>
            {descriptionImageUrl ? (
              <Image src={descriptionImageUrl} style={s.descImage} />
            ) : null}
          </View>
        ) : null}

        <View style={s.totalsBlock}>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>小計</Text>
            <Text style={s.totalValue}>{fmtCurrency(subtotal)}</Text>
          </View>
          {includeTax ? (
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>稅額 ({settings.taxRate}%)</Text>
              <Text style={s.totalValue}>{fmtCurrency(tax)}</Text>
            </View>
          ) : null}
          <View style={s.grandRow}>
            <Text style={s.grandLabel}>{includeTax ? "總額" : "總額（未稅）"}</Text>
            <Text style={s.grandValue}>{fmtCurrency(total)}</Text>
          </View>
        </View>

        {termsTemplate.trim() ? (
          <View style={s.notesSection}>
            <Text style={s.notesTitle}>備註 / 條款</Text>
            {termsTemplate.split("\n").filter(l => l.trim()).map((line, idx) => (
              <Text key={idx} style={s.notesText}>{fw(line.trim())}</Text>
            ))}
          </View>
        ) : null}

        <View style={s.spacer} />

        <View style={s.footer}>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start", flex: 1 }}>
            <View>
              <Text style={s.footerCompany}>
                {settings.companyFullName || settings.companyName}
              </Text>
              <Text style={s.footerInfo}>
                統編: {settings.companyTaxId}
              </Text>
              {settings.companyContact && (channel === "wholesale" || channel === "designer") ? (
                <Text style={s.footerInfo}>
                  聯絡窗口: {settings.companyContact}
                </Text>
              ) : null}
            </View>
            <Image src="/stamp.png" style={{ width: 72, height: 72, opacity: 0.85, alignSelf: "flex-end" }} />
          </View>
          <View style={{ alignItems: "flex-end" as const, flex: 1 }}>
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

export async function generatePDFBlob(props: QuotePDFProps): Promise<Blob> {
  return pdf(<QuotePDFDocument {...props} />).toBlob();
}

export async function generateAndDownloadPDF(props: QuotePDFProps): Promise<void> {
  const blob = await generatePDFBlob(props);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = buildPdfFileName(props);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
