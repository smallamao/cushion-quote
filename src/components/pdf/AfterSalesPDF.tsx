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
  AfterSalesReply,
  AfterSalesService,
  AfterSalesStatus,
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

const STATUS_LABEL: Record<AfterSalesStatus, string> = {
  pending: "待確認",
  scheduled: "已排程",
  in_progress: "維修中",
  completed: "已完成",
  cancelled: "取消",
};

const C = {
  black: "#111111",
  dark: "#333333",
  muted: "#666666",
  light: "#999999",
  border: "#D1D5DB",
  sectionBg: "#F59E0B",
  sectionText: "#FFFFFF",
  rowBg: "#FAFAFA",
  white: "#FFFFFF",
} as const;

const s = StyleSheet.create({
  page: {
    fontFamily: "NotoSansTC",
    fontSize: 10,
    color: C.black,
    paddingTop: 32,
    paddingBottom: 40,
    paddingHorizontal: 36,
    backgroundColor: C.white,
  },
  header: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 18,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: C.black,
    gap: 12,
  },
  logo: { width: 48, height: 48 },
  titleBox: { alignItems: "center" },
  brandName: { fontSize: 20, fontWeight: 700, color: C.black, letterSpacing: 6 },
  docTitle: {
    fontSize: 20,
    fontWeight: 700,
    color: C.black,
    marginTop: 2,
    letterSpacing: 6,
  },

  sectionBar: {
    backgroundColor: C.sectionBg,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginTop: 12,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: C.sectionText,
    textAlign: "center",
  },

  infoTable: {
    borderWidth: 0.5,
    borderColor: C.border,
    borderTopWidth: 0,
  },
  infoRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: C.border,
    minHeight: 22,
  },
  infoCell: {
    flexDirection: "row",
    flex: 1,
    borderRightWidth: 0.5,
    borderRightColor: C.border,
  },
  infoCellLast: {
    flexDirection: "row",
    flex: 1,
  },
  infoLabel: {
    width: 72,
    backgroundColor: C.rowBg,
    padding: 5,
    fontSize: 9,
    color: C.dark,
    textAlign: "right",
  },
  infoValue: {
    flex: 1,
    padding: 5,
    fontSize: 9.5,
    color: C.black,
  },
  infoValueFull: {
    flex: 1,
    padding: 5,
    fontSize: 9.5,
    color: C.black,
    minHeight: 40,
  },

  noteBlock: {
    borderWidth: 0.5,
    borderColor: C.border,
    borderTopWidth: 0,
    padding: 8,
  },
  noteLabel: {
    fontSize: 9,
    fontWeight: 700,
    color: C.dark,
    marginBottom: 4,
  },
  noteText: {
    fontSize: 9.5,
    color: C.black,
    lineHeight: 1.6,
  },
  issueTextBox: {
    padding: 8,
    fontSize: 10,
    lineHeight: 1.5,
    minHeight: 60,
    borderWidth: 0.5,
    borderColor: C.border,
    borderTopWidth: 0,
  },

  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    padding: 8,
    borderWidth: 0.5,
    borderColor: C.border,
    borderTopWidth: 0,
  },
  photo: {
    width: 110,
    height: 82,
    objectFit: "cover",
    borderWidth: 0.5,
    borderColor: C.border,
  },

  replyRow: {
    marginTop: 6,
    padding: 6,
    backgroundColor: C.rowBg,
    borderLeftWidth: 2,
    borderLeftColor: C.sectionBg,
  },
  replyMeta: {
    fontSize: 8,
    color: C.muted,
    marginBottom: 2,
  },
  replyContent: {
    fontSize: 9.5,
    color: C.black,
    lineHeight: 1.4,
  },

  footer: {
    position: "absolute",
    bottom: 20,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 0.5,
    borderTopColor: C.border,
    paddingTop: 6,
    fontSize: 8,
    color: C.muted,
  },
});

export interface AfterSalesPDFProps {
  service: AfterSalesService;
  replies?: AfterSalesReply[];
  settings: SystemSettings;
}

export function buildAfterSalesPdfFileName(service: AfterSalesService): string {
  const client = (service.clientName || "").replace(/[\\/:*?"<>|]/g, "").trim();
  if (!client) return `${service.serviceId}.pdf`;
  return `${service.serviceId} - ${client}.pdf`;
}

function InfoRow({
  left,
  right,
}: {
  left: { label: string; value: string };
  right?: { label: string; value: string };
}) {
  return (
    <View style={s.infoRow}>
      <View style={s.infoCell}>
        <Text style={s.infoLabel}>{left.label}</Text>
        <Text style={s.infoValue}>{left.value || " "}</Text>
      </View>
      {right ? (
        <View style={s.infoCellLast}>
          <Text style={s.infoLabel}>{right.label}</Text>
          <Text style={s.infoValue}>{right.value || " "}</Text>
        </View>
      ) : (
        <View style={s.infoCellLast} />
      )}
    </View>
  );
}

function AfterSalesDocument({ service, replies = [], settings }: AfterSalesPDFProps) {
  return (
    <Document title={`售後服務單 ${service.serviceId}`} author={settings.companyName}>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <Image src="/logo.png" style={s.logo} />
          <View style={s.titleBox}>
            <Text style={s.brandName}>
              {settings.companyName}
            </Text>
            <Text style={s.docTitle}>售後服務單</Text>
          </View>
        </View>

        {/* 客戶報修單 section */}
        <View style={s.sectionBar}>
          <Text style={s.sectionTitle}>客戶報修單</Text>
        </View>
        <View style={s.infoTable}>
          <InfoRow
            left={{ label: "服務單號", value: service.serviceId }}
            right={{ label: "填單日期", value: service.receivedDate }}
          />
        </View>

        {/* 客戶資訊 section */}
        <View style={s.sectionBar}>
          <Text style={s.sectionTitle}>客戶資訊</Text>
        </View>
        <View style={s.infoTable}>
          <InfoRow
            left={{ label: "訂單編號", value: service.relatedOrderNo }}
            right={{ label: "出貨日期", value: service.shipmentDate }}
          />
          <InfoRow
            left={{ label: "主要聯絡人", value: service.clientName }}
            right={{ label: "主要電話", value: service.clientPhone }}
          />
          <InfoRow
            left={{ label: "次要聯絡人", value: service.clientContact2 }}
            right={{ label: "次要電話", value: service.clientPhone2 }}
          />
          <View style={s.infoRow}>
            <View style={{ flexDirection: "row", flex: 1 }}>
              <Text style={s.infoLabel}>送貨地址</Text>
              <Text style={s.infoValue}>{service.deliveryAddress || " "}</Text>
            </View>
          </View>
        </View>

        {/* 報修資訊 section */}
        <View style={s.sectionBar}>
          <Text style={s.sectionTitle}>報修資訊</Text>
        </View>
        <View style={s.infoTable}>
          <InfoRow
            left={{ label: "款式編號", value: service.modelCode }}
            right={{ label: "款式名稱", value: service.modelNameSnapshot }}
          />
        </View>
        {service.issueDescription ? (
          <View style={s.noteBlock}>
            <Text style={s.noteLabel}>報修項目</Text>
            <Text style={s.noteText}>{service.issueDescription}</Text>
          </View>
        ) : null}
        {service.dispatchNotes ? (
          <View style={s.noteBlock}>
            <Text style={s.noteLabel}>報修備註</Text>
            <Text style={s.noteText}>{service.dispatchNotes}</Text>
          </View>
        ) : null}

        {/* 問題照片 — 只渲染圖片,影片 URL 略過 (react-pdf 不支援 video) */}
        {(() => {
          const imagePhotos = service.issuePhotos.filter(
            (url) =>
              !url.includes("/video/upload/") &&
              !/\.(mp4|mov|webm|m4v)(\?|$)/i.test(url),
          );
          return imagePhotos.length > 0 ? (
            <>
              <View style={s.sectionBar}>
                <Text style={s.sectionTitle}>問題照片</Text>
              </View>
              <View style={s.photoGrid}>
                {imagePhotos.slice(0, 6).map((url, i) => (
                  /* eslint-disable-next-line jsx-a11y/alt-text */
                  <Image key={i} src={url} style={s.photo} />
                ))}
              </View>
            </>
          ) : null;
        })()}

        {/* 派工 / 維修 */}
        {(service.status !== "pending" ||
          service.assignedTo ||
          service.completedDate) && (
          <>
            <View style={s.sectionBar}>
              <Text style={s.sectionTitle}>派工 / 維修資訊</Text>
            </View>
            <View style={s.infoTable}>
              <InfoRow
                left={{ label: "狀態", value: STATUS_LABEL[service.status] || "" }}
                right={{ label: "負責人", value: service.assignedTo }}
              />
              <InfoRow
                left={{ label: "派工日期", value: service.scheduledDate }}
                right={{ label: "完工日期", value: service.completedDate }}
              />
              {service.completionNotes ? (
                <View style={s.infoRow}>
                  <View style={{ flexDirection: "row", flex: 1 }}>
                    <Text style={s.infoLabel}>維修說明</Text>
                    <Text style={s.infoValueFull}>{service.completionNotes}</Text>
                  </View>
                </View>
              ) : null}
              {service.customerSignature ? (
                <View style={s.infoRow}>
                  <View style={{ flexDirection: "row", flex: 1 }}>
                    <Text style={s.infoLabel}>客戶簽名</Text>
                    <View style={{ flex: 1, padding: 5 }}>
                      <Image
                        src={service.customerSignature}
                        style={{ width: 120, height: 40, objectFit: "contain" }}
                      />
                      {service.customerSignedAt ? (
                        <Text style={{ fontSize: 8, color: C.muted, marginTop: 2 }}>
                          {new Date(service.customerSignedAt).toLocaleString("zh-TW")}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </View>
              ) : null}
            </View>
          </>
        )}

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text>
            {settings.companyPhone ? `電話 ${settings.companyPhone}  ` : ""}
            {settings.companyAddress ?? ""}
          </Text>
          <Text>{service.serviceId}</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function generateAfterSalesPdfBlob(
  props: AfterSalesPDFProps,
): Promise<Blob> {
  return pdf(<AfterSalesDocument {...props} />).toBlob();
}
