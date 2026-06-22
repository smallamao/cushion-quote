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
    fontSize: 10,
    color: C.black,
    paddingTop: 32,
    paddingBottom: 40,
    paddingHorizontal: 36,
    backgroundColor: C.white,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  headerLeft: {
    flex: 1,
  },
  orderNumberLabel: {
    fontSize: 12,
    color: C.dark,
    marginBottom: 4,
  },
  orderNumber: {
    fontSize: 24,
    fontWeight: 700,
    color: C.black,
  },
  materialImage: {
    width: 100,
    height: 100,
    objectFit: "cover",
    borderWidth: 0.5,
    borderColor: C.border,
  },
  metaRow: {
    flexDirection: "row",
    marginBottom: 4,
    alignItems: "flex-start",
  },
  metaLabel: {
    fontSize: 10,
    color: C.dark,
    width: 56,
  },
  metaValue: {
    fontSize: 10,
    color: C.black,
    flex: 1,
  },
  metaValueRed: {
    fontSize: 10,
    color: C.red,
    flex: 1,
  },
  separator: {
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    marginVertical: 12,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: C.dark,
    marginBottom: 6,
  },
  itemBlock: {
    marginBottom: 10,
  },
  itemName: {
    fontSize: 12,
    fontWeight: 700,
    color: C.black,
    marginBottom: 2,
  },
  itemDimQty: {
    fontSize: 10,
    color: C.dark,
    marginBottom: 2,
  },
  foamSpecDefault: {
    fontSize: 10,
    color: C.dark,
  },
  foamSpecOrange: {
    fontSize: 10,
    color: C.orange,
  },
  foamSpecRed: {
    fontSize: 10,
    color: C.red,
  },
  noteRow: {
    marginBottom: 4,
  },
  noteTextBlack: {
    fontSize: 10,
    color: C.black,
    lineHeight: 1.5,
  },
  noteTextRed: {
    fontSize: 10,
    color: C.red,
    lineHeight: 1.5,
  },
  noteTextOrange: {
    fontSize: 10,
    color: C.orange,
    lineHeight: 1.5,
  },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  photo: {
    width: 220,
    height: 160,
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

  return (
    <Document title={`施工工單 ${order.orderNumber || order.orderId}`}>
      <Page size="A4" style={s.page}>
        {/* Header: order number on left, material image on right */}
        <View style={s.headerRow}>
          <View style={s.headerLeft}>
            <Text style={s.orderNumberLabel}>編號：</Text>
            <Text style={s.orderNumber}>{safeText(order.orderNumber || order.orderId)}</Text>
          </View>
          {hasMaterialImage ? (
            /* eslint-disable-next-line jsx-a11y/alt-text */
            <Image src={order.materialImageUrl} style={s.materialImage} />
          ) : null}
        </View>

        {/* Order meta info */}
        {order.orderTitle ? (
          <View style={s.metaRow}>
            <Text style={s.metaLabel}>訂製內容：</Text>
            <Text style={s.metaValue}>{safeText(order.orderTitle)}</Text>
          </View>
        ) : null}
        {(order.materialName || order.materialCode) ? (
          <View style={s.metaRow}>
            <Text style={s.metaLabel}>材質：</Text>
            <Text style={s.metaValueRed}>
              {safeText([order.materialName, order.materialCode].filter(Boolean).join(" "))}
            </Text>
          </View>
        ) : null}
        {order.installDate ? (
          <View style={s.metaRow}>
            <Text style={s.metaLabel}>安裝日：</Text>
            <Text style={s.metaValueRed}>{safeText(order.installDate)}</Text>
          </View>
        ) : null}
        {order.deadline ? (
          <View style={s.metaRow}>
            <Text style={s.metaLabel}>交期：</Text>
            <Text style={s.metaValueRed}>{safeText(order.deadline)}</Text>
          </View>
        ) : null}

        {/* Items section */}
        {hasItems ? (
          <>
            <View style={s.separator} />
            <Text style={s.sectionLabel}>補充說明：</Text>
            {order.items.map((item: OrderItem) => {
              const dimQty = [item.dimensions, item.quantity].filter(Boolean).join("  ");
              const foamStyle =
                item.foamColor === "orange"
                  ? s.foamSpecOrange
                  : item.foamColor === "red"
                    ? s.foamSpecRed
                    : s.foamSpecDefault;
              return (
                <View key={item.id} style={s.itemBlock}>
                  <Text style={s.itemName}>· {safeText(item.name)}</Text>
                  {dimQty ? (
                    <Text style={s.itemDimQty}>{safeText(dimQty)}</Text>
                  ) : null}
                  {item.foamSpec ? (
                    <Text style={foamStyle}>{safeText(item.foamSpec)}</Text>
                  ) : null}
                </View>
              );
            })}
          </>
        ) : null}

        {/* Notes section */}
        {hasNotes ? (
          <>
            <View style={s.separator} />
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
          </>
        ) : null}

        {/* Photos grid */}
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
