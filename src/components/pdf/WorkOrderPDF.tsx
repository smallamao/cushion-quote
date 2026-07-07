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

  // ── Header section: left info column + right swatch ─────────────────────
  // Left: 編號 row + 材質 row stacked; Right: swatch spans full height
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingTop: 10,
    paddingBottom: 6,
  },
  // left column wraps both 編號 and 材質
  cardHeaderLeft: {
    flex: 1,
    flexDirection: "column",
  },
  // 編號：S882  訂製坐墊 on one line
  headerOrderRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginBottom: 6,
  },
  orderNumberPrefix: {
    fontSize: 12,
    fontWeight: 700,
    color: T.inkFaint,
    marginRight: 2,
  },
  orderNumber: {
    fontSize: 22,
    fontWeight: 700,
    color: T.ink,
    letterSpacing: 0.3,
    marginRight: 10,
  },
  orderTitleText: {
    fontSize: 13,
    fontWeight: 700,
    color: T.inkMid,
  },
  // Swatch: standalone right column, no text crammed in
  swatchBlock: {
    width: 180,
    height: 135,
    // 絕對定位浮在右上角，脫離排版流，避免撐高表頭、讓訂製內容能往上補
    position: "absolute",
    top: 6,
    right: 0,
  },
  swatchImg: {
    width: 180,
    height: 135,
    // contain：完整顯示使用者裁切後的材質圖，不再被框二次裁切（必要時留白）
    objectFit: "contain",
  },
  // placeholder styles (unused but kept for TS compatibility)
  swatchCaption: { display: "none" },
  swatchCaptionLabel: { display: "none" },
  swatchMaterialName: { display: "none" },
  swatchCode: { display: "none" },

  // ── Material row — no border, spacing only ────────────────────────────────
  materialRow: {
    flexDirection: "row",
    alignItems: "baseline",
    paddingVertical: 4,
    marginBottom: 6,
  },
  materialLabel: {
    fontSize: 12,
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

  // ── 安裝日 / 交期：與材質同款的 inline「標籤＋值」，放左欄材質下方 ──────────
  metaInlineRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginBottom: 4,
  },
  metaInlineLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: T.inkFaint,
    letterSpacing: 0.8,
    marginRight: 10,
  },
  metaInlineValue: {
    fontSize: 14,
    fontWeight: 700,
  },

  // ── Meta strip (安裝日 / 交期 / 客戶) — no borders, spacing only ─────────
  metaStrip: {
    flexDirection: "row",
    alignItems: "stretch",
    marginBottom: 8,
  },
  metaCell: {
    flex: 1,
    paddingHorizontal: 0,
    paddingRight: 16,
    paddingVertical: 2,
  },
  metaCellLast: {
    flex: 1,
    paddingHorizontal: 0,
    paddingVertical: 2,
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

  // ── Item list — no border lines between items, spacing only ──────────────
  itemEntry: {
    paddingVertical: 6,
    paddingLeft: 2,
    marginBottom: 2,
  },

  // Line 1: • 品名  泡棉規格
  itemLine1: {
    flexDirection: "row",
    alignItems: "baseline",
    marginBottom: 3,
  },
  itemBullet: {
    fontSize: 13,
    fontWeight: 700,
    color: T.inkMid,
    marginRight: 6,
    flexShrink: 0,
  },
  itemName: {
    fontSize: 13,
    fontWeight: 700,
    color: T.ink,
    marginRight: 10,
  },
  itemFoamDefault: {
    fontSize: 12,
    fontWeight: 700,
    color: T.inkMid,
  },
  itemFoamWarn: {
    fontSize: 12,
    fontWeight: 700,
    color: T.warnText,
  },
  itemFoamDanger: {
    fontSize: 12,
    fontWeight: 700,
    color: T.danger,
  },

  // Line 2 (indented): 尺寸  ×  數量
  itemLine2: {
    flexDirection: "row",
    alignItems: "baseline",
    paddingLeft: 19,
    marginBottom: 2,
  },
  itemDim: {
    fontSize: 16,
    fontWeight: 700,
    color: T.ink,
  },
  itemQtySep: {
    fontSize: 14,
    color: T.inkFaint,
    marginHorizontal: 6,
  },
  itemQty: {
    fontSize: 16,
    fontWeight: 700,
    color: T.ink,
  },

  // Color code / material code per item (indented, red)
  itemColorCode: {
    fontSize: 11,
    fontWeight: 700,
    color: T.danger,
    paddingLeft: 19,
    marginBottom: 2,
  },

  // Sub-note per item
  itemSubNote: {
    fontSize: 10,
    color: T.inkMid,
    paddingLeft: 19,
    lineHeight: 1.4,
    marginBottom: 2,
  },

  // Per-item photo strip
  itemPhotoStrip: {
    flexDirection: "row",
    gap: 4,
    marginTop: 5,
    paddingLeft: 19,
    flexWrap: "wrap",
  },
  itemPhoto: {
    width: 90,
    height: 64,
    objectFit: "contain",
    borderWidth: 1,
    borderColor: T.borderLight,
  },

  // placeholder styles (kept for TS compatibility)
  colName: { display: "none" },
  colDim: { display: "none" },
  colQty: { display: "none" },
  colFoam: { display: "none" },
  colFoamLabel: { display: "none" },
  itemRow: { display: "none" },
  itemQtyLabel: { display: "none" },

  // ── Notes section ─────────────────────────────────────────────────────────
  notesBlock: {
    paddingHorizontal: 0,
    paddingVertical: 6,
    marginTop: 4,
  },
  notesSectionLabel: {
    fontSize: 12,
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
    fontSize: 12,
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
  // 色票大小：操作者在工單編輯頁調整，基準 180×135，夾在 0.6~1.3 倍避免破版
  const swatchScale = Math.min(Math.max(order.materialImageScale ?? 1, 0.6), 1.3);
  const swatchW = Math.round(180 * swatchScale);
  const swatchH = Math.round(135 * swatchScale);

  // Build meta cells — only include fields that have values
  const metaCells: Array<{ label: string; value: string; variant: "normal" | "danger" | "warn" }> = [];
  if (order.deadline)     metaCells.push({ label: "交期",   value: safeText(order.deadline),     variant: "danger" });
  if (order.installDate)  metaCells.push({ label: "安裝日", value: safeText(order.installDate),  variant: "normal" });
  // 客戶不顯示在施工工單上（隱私／現場不需要）

  return (
    <Document title={`施工工單 ${order.orderNumber || order.orderId}`}>
      <Page size="A4" style={s.page}>

        {/* ── Outer card ─────────────────────────────────────────────── */}
        <View style={s.card}>

          {/* Swatch floats top-right (absolute), out of flow, so 訂製內容 moves up */}
          {hasSwatch ? (
            <View style={[s.swatchBlock, { width: swatchW, height: swatchH }]}>
              {/* eslint-disable-next-line jsx-a11y/alt-text */}
              <Image src={order.materialImageUrl} style={[s.swatchImg, { width: swatchW, height: swatchH }]} />
            </View>
          ) : null}

          {/* ── 1. Header: left info col ──────────────────────────────── */}
          <View style={s.cardHeader}>

            {/* Left column: 編號 row + 材質 row stacked */}
            <View style={s.cardHeaderLeft}>

              {/* 編號：S882  訂製坐墊 */}
              <View style={s.headerOrderRow}>
                <Text style={s.orderNumberPrefix}>編號：</Text>
                <Text style={s.orderNumber}>
                  {safeText(order.orderNumber || order.orderId)}
                </Text>
                {order.orderTitle ? (
                  <Text style={s.orderTitleText}>{safeText(order.orderTitle)}</Text>
                ) : null}
              </View>

              {/* 材質 — directly below 編號, no gap */}
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

              {/* 安裝日 / 交期 — inline，格式與位置比照材質 */}
              {metaCells.map((cell) => {
                const color =
                  cell.variant === "danger" ? T.danger
                  : cell.variant === "warn"  ? T.warnText
                  : T.ink;
                return (
                  <View key={cell.label} style={s.metaInlineRow}>
                    <Text style={s.metaInlineLabel}>{cell.label}</Text>
                    <Text style={[s.metaInlineValue, { color }]}>{cell.value}</Text>
                  </View>
                );
              })}

            </View>

          </View>

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
                  <View key={item.id} style={s.itemEntry}>

                    {/* Line 1: • 品名  泡棉規格 */}
                    <View style={s.itemLine1}>
                      <Text style={s.itemBullet}>•</Text>
                      <Text style={s.itemName}>{safeText(item.name)}</Text>
                      {item.foamSpec ? (
                        <Text style={foamStyle}>{safeText(item.foamSpec)}</Text>
                      ) : null}
                    </View>

                    {/* Line 2 (indented): 尺寸 × 數量 */}
                    {(item.dimensions || item.quantity) ? (
                      <View style={s.itemLine2}>
                        {item.dimensions ? (
                          <Text style={s.itemDim}>{safeText(item.dimensions)}</Text>
                        ) : null}
                        {item.dimensions && item.quantity ? (
                          <Text style={s.itemQtySep}>×</Text>
                        ) : null}
                        {item.quantity ? (
                          <Text style={s.itemQty}>{safeText(item.quantity)}</Text>
                        ) : null}
                      </View>
                    ) : null}

                    {/* Color code per item (if different) */}
                    {item.colorCode ? (
                      <Text style={s.itemColorCode}>{safeText(item.colorCode)}</Text>
                    ) : null}

                    {/* Sub-note */}
                    {item.subNote ? (
                      <Text style={s.itemSubNote}>{safeText(item.subNote)}</Text>
                    ) : null}

                    {/* Per-item photos */}
                    {hasPerItemPhotos ? (
                      <View style={s.itemPhotoStrip}>
                        {(item.photos ?? []).slice(0, 4).map((url, pi) => (
                          /* eslint-disable-next-line jsx-a11y/alt-text */
                          <Image key={pi} src={url} style={s.itemPhoto} />
                        ))}
                      </View>
                    ) : null}

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

// Browser-only: render page 1 of work order to JPEG (for Notion image block)
export async function generateWorkOrderJpgBlob(
  props: WorkOrderPDFProps,
  options: { quality?: number; scale?: number } = {},
): Promise<Blob> {
  const { quality = 0.92, scale = 2 } = options;

  const pdfBlob = await generateWorkOrderPdfBlob(props);
  const pdfArrayBuffer = await pdfBlob.arrayBuffer();

  interface WoPdfjsLib {
    GlobalWorkerOptions: { workerSrc: string };
    getDocument(params: { data: Uint8Array }): { promise: Promise<{ getPage(n: number): Promise<{ getViewport(p: { scale: number }): { width: number; height: number }; render(p: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number }; canvas: HTMLCanvasElement }): { promise: Promise<void> } }> }> };
  }
  // @ts-expect-error runtime import from public/, bypasses webpack
  const pdfjs = await import(/* webpackIgnore: true */ "/pdf.min.mjs") as WoPdfjsLib;
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const pdfDoc = await pdfjs.getDocument({ data: new Uint8Array(pdfArrayBuffer) }).promise;
  const page = await pdfDoc.getPage(1);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context not available");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => { if (blob) resolve(blob); else reject(new Error("canvas toBlob failed")); },
      "image/jpeg",
      quality,
    );
  });
}
