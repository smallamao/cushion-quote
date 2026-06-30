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

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens — 100% print-safe: white backgrounds, black/dark-gray ink only.
// Color is used exclusively on text (never as fill), and only for urgency cues.
// ─────────────────────────────────────────────────────────────────────────────
const T = {
  ink:          "#111111",  // primary text — near-black, crisp on laser/inkjet
  inkMid:       "#444444",  // secondary labels
  inkFaint:     "#888888",  // captions, footnotes
  white:        "#FFFFFF",
  danger:       "#C00000",  // text-only red: deadline, urgent notes, color codes
  warnText:     "#8B4000",  // text-only dark-orange: install date, foam warnings
  borderHeavy:  "#111111",  // outer card border (2pt)
  borderMid:    "#555555",  // inner dividers (1pt)
  borderLight:  "#BBBBBB",  // fine lines, photo borders

  // Page margins
  pg:  30,
  pgH: 28,
} as const;

const s = StyleSheet.create({
  page: {
    fontFamily: "NotoSansTC",
    fontSize: 10,
    color: T.ink,
    paddingTop: T.pg,
    paddingBottom: 44,
    paddingHorizontal: T.pgH,
    backgroundColor: T.white,
  },

  // ── No outer border — use a thick top line + section dividers instead ────
  card: {
    borderTopWidth: 3,
    borderTopColor: T.ink,
    marginBottom: 12,
  },

  // ── Card header: order number + order type + swatch thumbnail ────────────
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 0,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: T.borderMid,
  },
  cardHeaderLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "baseline",
    gap: 10,
  },
  orderNumber: {
    fontSize: 22,
    fontWeight: 700,
    color: T.ink,
    letterSpacing: 0.3,
  },
  orderTitleText: {
    fontSize: 13,
    fontWeight: 700,
    color: T.inkMid,
  },
  // Swatch: image-only thumbnail, no text crammed in
  swatchBlock: {
    width: 80,
    height: 56,
    flexShrink: 0,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: T.borderLight,
  },
  swatchImg: {
    width: 80,
    height: 56,
    objectFit: "cover",
  },
  // placeholder styles (unused but kept for TS compatibility)
  swatchCaption: { display: "none" },
  swatchCaptionLabel: { display: "none" },
  swatchMaterialName: { display: "none" },
  swatchCode: { display: "none" },

  // ── Material row — full width, large & readable ───────────────────────────
  materialRow: {
    flexDirection: "row",
    alignItems: "baseline",
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: T.borderMid,
  },
  materialLabel: {
    fontSize: 9,
    fontWeight: 700,
    color: T.inkFaint,
    letterSpacing: 0.8,
    marginRight: 10,
    width: 26,
  },
  materialName: {
    fontSize: 14,
    fontWeight: 700,
    color: T.ink,
    marginRight: 10,
  },
  materialCode: {
    fontSize: 14,
    fontWeight: 700,
    color: T.danger,
  },

  // ── Meta strip (安裝日 / 交期 / 客戶) ────────────────────────────────────
  metaStrip: {
    flexDirection: "row",
    alignItems: "stretch",
    borderBottomWidth: 1,
    borderBottomColor: T.borderMid,
  },
  metaCell: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRightWidth: 1,
    borderRightColor: T.borderLight,
  },
  metaCellLast: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  metaCellLabel: {
    fontSize: 7,
    fontWeight: 700,
    color: T.inkFaint,
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  metaCellValue: {
    fontSize: 11,
    fontWeight: 700,
    color: T.ink,
  },
  metaCellValueDanger: {
    fontSize: 11,
    fontWeight: 700,
    color: T.danger,
    textDecoration: "underline",
  },
  metaCellValueWarn: {
    fontSize: 11,
    fontWeight: 700,
    color: T.warnText,
  },

  // ── Item rows ─────────────────────────────────────────────────────────────
  // Layout: [品名 72pt] | [尺寸 — BIG] | [數量 — BIGGEST] | [泡棉]
  // Bordered between rows with 1pt line.
  itemsBlock: {
    // No extra margin — rows are visually separated by internal borders
  },

  // Group header row (header-type items)
  groupHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: T.borderMid,
  },
  groupHeaderText: {
    fontSize: 11,
    fontWeight: 700,
    color: T.ink,
    letterSpacing: 0.2,
  },
  groupHeaderPrefix: {
    fontSize: 11,
    fontWeight: 700,
    color: T.inkFaint,
    marginRight: 5,
  },

  // Normal item row
  itemRow: {
    flexDirection: "row",
    alignItems: "stretch",
    borderBottomWidth: 1,
    borderBottomColor: T.borderLight,
    minHeight: 52,
  },

  // Col: 品名 — 80pt wide (wider for material sub-line), right-bordered
  colName: {
    width: 80,
    flexShrink: 0,
    paddingHorizontal: 8,
    paddingVertical: 8,
    justifyContent: "center",
    borderRightWidth: 1,
    borderRightColor: T.borderMid,
  },
  itemName: {
    fontSize: 13,
    fontWeight: 700,
    color: T.ink,
    marginBottom: 3,
  },
  itemColorCode: {
    fontSize: 10,
    fontWeight: 700,
    color: T.danger,
    marginTop: 1,
  },

  // Col: 尺寸規格 — flex, right-bordered
  colDim: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    justifyContent: "center",
    borderRightWidth: 1,
    borderRightColor: T.borderMid,
  },
  itemDim: {
    fontSize: 20,
    fontWeight: 700,
    color: T.ink,
    lineHeight: 1.25,
  },
  itemSubNote: {
    fontSize: 9,
    color: T.inkMid,
    marginTop: 3,
    lineHeight: 1.4,
  },

  // Col: 數量 — 72pt, right-bordered, quantity is #1 factory check
  colQty: {
    width: 72,
    flexShrink: 0,
    paddingHorizontal: 8,
    paddingVertical: 8,
    justifyContent: "center",
    alignItems: "center",
    borderRightWidth: 1,
    borderRightColor: T.borderMid,
  },
  itemQty: {
    fontSize: 24,
    fontWeight: 700,
    color: T.ink,
    textAlign: "center",
  },
  itemQtyLabel: {
    fontSize: 7,
    color: T.inkFaint,
    textAlign: "center",
    letterSpacing: 0.5,
    marginTop: 2,
  },

  // Col: 泡棉規格 — 90pt, more breathing room
  colFoam: {
    width: 90,
    flexShrink: 0,
    paddingHorizontal: 10,
    paddingVertical: 8,
    justifyContent: "center",
  },
  colFoamLabel: {
    fontSize: 7,
    color: T.inkFaint,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  itemFoamDefault: {
    fontSize: 13,
    fontWeight: 700,
    color: T.inkMid,
    lineHeight: 1.4,
  },
  itemFoamWarn: {
    fontSize: 13,
    fontWeight: 700,
    color: T.warnText,
    lineHeight: 1.4,
  },
  itemFoamDanger: {
    fontSize: 13,
    fontWeight: 700,
    color: T.danger,
    lineHeight: 1.4,
  },

  // Per-item photo strip (inside dim column)
  itemPhotoStrip: {
    flexDirection: "row",
    gap: 4,
    marginTop: 5,
    flexWrap: "wrap",
  },
  itemPhoto: {
    width: 90,
    height: 64,
    objectFit: "contain",
    borderWidth: 1,
    borderColor: T.borderLight,
  },

  // ── Notes section ─────────────────────────────────────────────────────────
  notesBlock: {
    borderTopWidth: 1,
    borderTopColor: T.borderMid,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  notesSectionLabel: {
    fontSize: 7,
    fontWeight: 700,
    color: T.inkFaint,
    letterSpacing: 0.8,
    marginBottom: 5,
  },
  noteRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 4,
  },
  noteBullet: {
    fontSize: 12,
    fontWeight: 700,
    color: T.ink,
    marginRight: 5,
    lineHeight: 1.4,
    flexShrink: 0,
  },
  noteTextBlack: {
    fontSize: 12,
    fontWeight: 700,
    color: T.ink,
    lineHeight: 1.4,
    flex: 1,
  },
  noteTextDanger: {
    fontSize: 12,
    fontWeight: 700,
    color: T.danger,
    lineHeight: 1.4,
    flex: 1,
  },
  noteTextWarn: {
    fontSize: 12,
    fontWeight: 700,
    color: T.warnText,
    lineHeight: 1.4,
    flex: 1,
  },

  // ── Reference photos ──────────────────────────────────────────────────────
  photoSectionLabel: {
    fontSize: 7,
    fontWeight: 700,
    color: T.inkFaint,
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  photo: {
    width: 243,
    height: 182,
    objectFit: "cover",
    borderWidth: 1,
    borderColor: T.borderLight,
  },

  // ── Footer ────────────────────────────────────────────────────────────────
  footer: {
    position: "absolute",
    bottom: 16,
    left: T.pgH,
    right: T.pgH,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: T.borderLight,
    paddingTop: 5,
  },
  footerText: {
    fontSize: 7,
    color: T.inkFaint,
    letterSpacing: 0.3,
  },
});

function safeText(text: string): string {
  return text.replace(/❖/g, "◆");
}

export interface WorkOrderPDFProps {
  order: CustomOrder;
}

function WorkOrderDocument({ order }: WorkOrderPDFProps) {
  const hasItems  = order.items.length > 0;
  const hasNotes  = order.notes.length > 0;
  const photoUrls = order.photos.slice(0, 6);
  const hasPhotos = photoUrls.length > 0;
  const hasSwatch = Boolean(order.materialImageUrl);

  // Build meta cells — only include fields that have values
  const metaCells: Array<{ label: string; value: string; variant: "normal" | "danger" | "warn" }> = [];
  if (order.deadline)     metaCells.push({ label: "交期",   value: safeText(order.deadline),     variant: "danger" });
  if (order.installDate)  metaCells.push({ label: "安裝日", value: safeText(order.installDate),  variant: "warn"   });
  if (order.clientName)   metaCells.push({ label: "客戶",   value: safeText(order.clientName),   variant: "normal" });

  return (
    <Document title={`施工工單 ${order.orderNumber || order.orderId}`}>
      <Page size="A4" style={s.page}>

        {/* ── Outer card ─────────────────────────────────────────────── */}
        <View style={s.card}>

          {/* ── 1. Card header: S-number + order type + swatch ───────── */}
          <View style={s.cardHeader}>

            {/* Left: order number + order type */}
            <View style={s.cardHeaderLeft}>
              <Text style={s.orderNumber}>
                {safeText(order.orderNumber || order.orderId)}
              </Text>
              {order.orderTitle ? (
                <Text style={s.orderTitleText}>{safeText(order.orderTitle)}</Text>
              ) : null}
            </View>

            {/* Right: fabric swatch thumbnail — image only, no text */}
            {hasSwatch ? (
              <View style={s.swatchBlock}>
                {/* eslint-disable-next-line jsx-a11y/alt-text */}
                <Image src={order.materialImageUrl} style={s.swatchImg} />
              </View>
            ) : null}

          </View>

          {/* ── 1b. Material row — full width, large text ─────────────── */}
          {(order.materialName || order.materialCode) ? (
            <View style={s.materialRow}>
              <Text style={s.materialLabel}>材質</Text>
              {order.materialName ? (
                <Text style={s.materialName}>{safeText(order.materialName)}</Text>
              ) : null}
              {order.materialCode ? (
                <Text style={s.materialCode}>{safeText(order.materialCode)}</Text>
              ) : null}
            </View>
          ) : null}

          {/* ── 2. Meta strip ────────────────────────────────────────── */}
          {metaCells.length > 0 ? (
            <View style={s.metaStrip}>
              {metaCells.map((cell, i) => {
                const isLast = i === metaCells.length - 1;
                const cellStyle = isLast ? s.metaCellLast : s.metaCell;
                const valueStyle =
                  cell.variant === "danger" ? s.metaCellValueDanger
                  : cell.variant === "warn"  ? s.metaCellValueWarn
                  : s.metaCellValue;
                return (
                  <View key={cell.label} style={cellStyle}>
                    <Text style={s.metaCellLabel}>{cell.label}</Text>
                    <Text style={valueStyle}>{cell.value}</Text>
                  </View>
                );
              })}
            </View>
          ) : null}

          {/* ── 3. Item rows ─────────────────────────────────────────── */}
          {hasItems ? (
            <View style={s.itemsBlock}>
              {order.items.map((item: OrderItem) => {

                // Header-type: section divider row
                if (item.itemType === "header") {
                  return (
                    <View key={item.id} style={s.groupHeaderRow}>
                      <Text style={s.groupHeaderPrefix}>▸</Text>
                      <Text style={s.groupHeaderText}>{safeText(item.name)}</Text>
                    </View>
                  );
                }

                const foamStyle =
                  item.foamColor === "orange" ? s.itemFoamWarn
                  : item.foamColor === "red"  ? s.itemFoamDanger
                  : s.itemFoamDefault;

                const hasPerItemPhotos = (item.photos ?? []).length > 0;

                return (
                  <View key={item.id} style={s.itemRow}>

                    {/* Col 1: 品名 + color code */}
                    <View style={s.colName}>
                      <Text style={s.itemName}>{safeText(item.name)}</Text>
                      {item.colorCode ? (
                        <Text style={s.itemColorCode}>{safeText(item.colorCode)}</Text>
                      ) : null}
                    </View>

                    {/* Col 2: 尺寸規格 (22pt) + sub-note + per-item photos */}
                    <View style={s.colDim}>
                      {item.dimensions ? (
                        <Text style={s.itemDim}>{safeText(item.dimensions)}</Text>
                      ) : null}
                      {item.subNote ? (
                        <Text style={s.itemSubNote}>{safeText(item.subNote)}</Text>
                      ) : null}
                      {hasPerItemPhotos ? (
                        <View style={s.itemPhotoStrip}>
                          {(item.photos ?? []).slice(0, 4).map((url, pi) => (
                            /* eslint-disable-next-line jsx-a11y/alt-text */
                            <Image key={pi} src={url} style={s.itemPhoto} />
                          ))}
                        </View>
                      ) : null}
                    </View>

                    {/* Col 3: 數量 (26pt — biggest on page) */}
                    <View style={s.colQty}>
                      {item.quantity ? (
                        <>
                          <Text style={s.itemQty}>{safeText(item.quantity)}</Text>
                          <Text style={s.itemQtyLabel}>數量</Text>
                        </>
                      ) : null}
                    </View>

                    {/* Col 4: 泡棉規格 */}
                    <View style={s.colFoam}>
                      {item.foamSpec ? (
                        <>
                          <Text style={s.colFoamLabel}>泡棉規格</Text>
                          <Text style={foamStyle}>{safeText(item.foamSpec)}</Text>
                        </>
                      ) : null}
                    </View>

                  </View>
                );
              })}
            </View>
          ) : null}

          {/* ── 4. Notes ───────────────────────────────────────────────── */}
          {hasNotes ? (
            <View style={s.notesBlock}>
              <Text style={s.notesSectionLabel}>施工備註</Text>
              {order.notes.map((note: OrderNote) => {
                const noteStyle =
                  note.color === "red"    ? s.noteTextDanger
                  : note.color === "orange" ? s.noteTextWarn
                  : s.noteTextBlack;
                const prefix = note.isWarning ? "⚠ " : "";
                return (
                  <View key={note.id} style={s.noteRow}>
                    <Text style={s.noteBullet}>◆</Text>
                    <Text style={noteStyle}>
                      {prefix}{safeText(note.text)}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : null}

        </View>
        {/* end card */}

        {/* ── 5. Reference photos (outside card, below) ────────────── */}
        {hasPhotos ? (
          <View style={{ marginTop: 4 }}>
            <Text style={s.photoSectionLabel}>客戶現場參考照片</Text>
            <View style={s.photoGrid}>
              {photoUrls.map((url, i) => (
                /* eslint-disable-next-line jsx-a11y/alt-text */
                <Image key={i} src={url} style={s.photo} />
              ))}
            </View>
          </View>
        ) : null}

        {/* ── Footer ─────────────────────────────────────────────────── */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>馬鈴薯沙發 施工工單</Text>
          <Text style={s.footerText}>
            {order.orderNumber || order.orderId}
          </Text>
          <Text
            style={s.footerText}
            render={({ pageNumber, totalPages }) =>
              `${pageNumber} / ${totalPages}`
            }
          />
        </View>

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
