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

import type { CustomOrder, OrderItem, OrderNote } from "@/lib/types";

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
  red: "#E53E3E",
  orange: "#DD6B20",
  border: "#D1D5DB",
  white: "#FFFFFF",
} as const;

const s = StyleSheet.create({
  page: {
    fontFamily: "NotoSansTC",
    fontSize: 11,
    color: C.black,
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 40,
    backgroundColor: C.white,
  },
  // 編號：S891 — large but not overwhelming
  orderTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: C.black,
    marginBottom: 6,
  },
  // Meta rows: 訂製內容、安裝日、材質、交期
  metaRow: {
    flexDirection: "row",
    marginBottom: 3,
    alignItems: "flex-start",
  },
  metaLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: C.black,
    width: 70,
    flexShrink: 0,
  },
  metaValue: {
    fontSize: 12,
    fontWeight: 700,
    color: C.black,
    flex: 1,
  },
  metaValueRed: {
    fontSize: 12,
    fontWeight: 700,
    color: C.red,
    flex: 1,
    textDecoration: "underline",
  },
  metaValueRedNoLine: {
    fontSize: 12,
    fontWeight: 700,
    color: C.red,
    flex: 1,
  },
  // 補充說明 section label — small grey label, not competing with content
  sectionLabel: {
    fontSize: 9,
    fontWeight: 700,
    color: C.dark,
    marginTop: 8,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  // 2-col: items left + material image right
  itemsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  itemsCol: {
    flex: 1,
  },
  itemBlock: {
    marginBottom: 8,
  },
  // Header-type item: same size as itemName, differentiated by bullet style
  itemBlockHeader: {
    marginBottom: 4,
    marginTop: 6,
  },
  itemNameHeader: {
    fontSize: 13,
    fontWeight: 700,
    color: C.black,
  },
  itemName: {
    fontSize: 13,
    fontWeight: 700,
    color: C.black,
    marginBottom: 1,
  },
  colorCodeRed: {
    fontSize: 13,
    fontWeight: 700,
    color: C.red,
  },
  itemDimQty: {
    fontSize: 13,
    color: C.black,
    paddingLeft: 12,
    marginBottom: 1,
  },
  foamSpecDefault: {
    fontSize: 13,
    color: C.dark,
  },
  itemSubNote: {
    fontSize: 12,
    color: C.dark,
    paddingLeft: 12,
    marginTop: 2,
  },
  foamSpecOrange: {
    fontSize: 13,
    color: C.orange,
  },
  foamSpecRed: {
    fontSize: 13,
    color: C.red,
  },
  materialImage: {
    width: 130,
    height: 80,
    objectFit: "contain",
    flexShrink: 0,
  },
  separator: {
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    marginVertical: 10,
  },
  // Notes — larger, bold, ◆ prefix
  noteRow: {
    marginBottom: 5,
  },
  noteTextBlack: {
    fontSize: 13,
    fontWeight: 700,
    color: C.black,
    lineHeight: 1.4,
  },
  noteTextRed: {
    fontSize: 13,
    fontWeight: 700,
    color: C.red,
    lineHeight: 1.4,
  },
  noteTextOrange: {
    fontSize: 13,
    fontWeight: 700,
    color: C.orange,
    lineHeight: 1.4,
  },
  // Photos — 2 per row
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  photo: {
    width: 253,
    height: 190,
    objectFit: "cover",
  },
});

function safeText(text: string): string {
  return text.replace(/❖/g, "◆");
}

export interface WorkOrderPDFProps {
  order: CustomOrder;
}

function WorkOrderDocument({ order }: WorkOrderPDFProps) {
  const hasItems = order.items.length > 0;
  const hasNotes = order.notes.length > 0;
  const photoUrls = order.photos.slice(0, 6);
  const hasPhotos = photoUrls.length > 0;
  const hasMaterialImage = Boolean(order.materialImageUrl);

  const materialLabel = [order.materialName, order.materialCode]
    .filter(Boolean)
    .join(" ");

  return (
    <Document title={`施工工單 ${order.orderNumber || order.orderId}`}>
      <Page size="A4" style={s.page}>

        {/* 1. 編號：S891 — single large bold line */}
        <Text style={s.orderTitle}>
          {"編號：" + safeText(order.orderNumber || order.orderId)}
        </Text>

        {/* 2. Meta rows (left) + material image (right) */}
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 16 }}>
          <View style={{ flex: 1 }}>
            {order.orderTitle ? (
              <View style={s.metaRow}>
                <Text style={s.metaLabel}>訂製內容：</Text>
                <Text style={s.metaValue}>{safeText(order.orderTitle)}</Text>
              </View>
            ) : null}
            {order.installDate ? (
              <View style={s.metaRow}>
                <Text style={s.metaLabel}>安裝日：</Text>
                <Text style={s.metaValueRedNoLine}>{safeText(order.installDate)}</Text>
              </View>
            ) : null}
            {materialLabel ? (
              <View style={s.metaRow}>
                <Text style={s.metaLabel}>材質：</Text>
                <Text style={s.metaValueRed}>{safeText(materialLabel)}</Text>
              </View>
            ) : null}
            {order.deadline ? (
              <View style={s.metaRow}>
                <Text style={s.metaLabel}>交期：</Text>
                <Text style={s.metaValueRed}>{safeText(order.deadline)}</Text>
              </View>
            ) : null}
          </View>
          {hasMaterialImage ? (
            /* eslint-disable-next-line jsx-a11y/alt-text */
            <Image src={order.materialImageUrl} style={s.materialImage} />
          ) : null}
        </View>

        {/* 3. 補充說明：items full width */}
        {hasItems ? (
          <>
            <Text style={s.sectionLabel}>補充說明：</Text>
            {order.items.map((item: OrderItem) => {
              const isHeader = item.itemType === "header";

              if (isHeader) {
                return (
                  <View key={item.id} style={s.itemBlockHeader}>
                    <Text style={s.itemNameHeader}>· {safeText(item.name)}</Text>
                  </View>
                );
              }

              const foamStyle =
                item.foamColor === "orange"
                  ? s.foamSpecOrange
                  : item.foamColor === "red"
                    ? s.foamSpecRed
                    : s.foamSpecDefault;
              return (
                <View key={item.id} style={s.itemBlock}>
                  {/* name + foamSpec + colorCode on same line */}
                  <Text style={s.itemName}>
                    <Text>{`· ${safeText(item.name)}`}</Text>
                    {item.foamSpec ? (
                      <Text style={foamStyle}>{` ${safeText(item.foamSpec)}`}</Text>
                    ) : null}
                    {item.colorCode ? (
                      <Text style={s.colorCodeRed}>{` (${safeText(item.colorCode)})`}</Text>
                    ) : null}
                  </Text>
                  {/* Dimensions + quantity on same line */}
                  {(item.dimensions || item.quantity) ? (
                    <Text style={s.itemDimQty}>
                      {item.dimensions ? safeText(item.dimensions) : ""}
                      {item.quantity ? ` * ${safeText(item.quantity)}` : ""}
                    </Text>
                  ) : null}
                  {(item.photos ?? []).slice(0, 4).map((url, pi) => (
                    /* eslint-disable-next-line jsx-a11y/alt-text */
                    <Image
                      key={pi}
                      src={url}
                      style={{ width: 360, height: 240, objectFit: "contain", marginTop: 8 }}
                    />
                  ))}
                  {item.subNote ? (
                    <Text style={s.itemSubNote}>{safeText(item.subNote)}</Text>
                  ) : null}
                </View>
              );
            })}
          </>
        ) : null}

        {/* 4. Notes — full width */}
        {hasNotes ? (
          <>
            <View style={s.separator} />
            <View>
              {order.notes.map((note: OrderNote) => {
                const noteStyle =
                  note.color === "red"
                    ? s.noteTextRed
                    : note.color === "orange"
                      ? s.noteTextOrange
                      : s.noteTextBlack;
                const prefix = note.isWarning ? "⚠️ " : "";
                return (
                  <View key={note.id} style={s.noteRow}>
                    <Text style={noteStyle}>
                      ◆ {prefix}{safeText(note.text)}
                    </Text>
                  </View>
                );
              })}
            </View>
          </>
        ) : null}

        {/* 5. Photos — 2 per row */}
        {hasPhotos ? (
          <>
            <View style={s.separator} />
            <View style={s.photoGrid}>
              {photoUrls.map((url, i) => (
                /* eslint-disable-next-line jsx-a11y/alt-text */
                <Image key={i} src={url} style={s.photo} />
              ))}
            </View>
          </>
        ) : null}

      </Page>
    </Document>
  );
}

export { WorkOrderDocument };

export async function generateWorkOrderPdfBlob(
  props: WorkOrderPDFProps,
): Promise<Blob> {
  return pdf(<WorkOrderDocument {...props} />).toBlob();
}
