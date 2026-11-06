"use client";

import { Document, Font, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";

import {
  LABEL_BOX,
  LABEL_PAGE,
  LABEL_TEXT_MAX_WIDTH,
  fitLabelFontSize,
  paginateLabels,
  type LabelLines,
} from "@/lib/shipping-label";

Font.register({
  family: "NotoSansTCLabel",
  fonts: [
    { src: "/fonts/NotoSansTC-Regular.ttf", fontWeight: 400 },
    { src: "/fonts/NotoSansTC-Bold.ttf", fontWeight: 700 },
  ],
});

// 單號、色號不可以被斷字（react-pdf 預設會在英數字中間斷行）
Font.registerHyphenationCallback((word) => [word]);

// 字級與顏色照 Keynote 底稿：第一行 45pt 粗、二三行 36pt、第三行 #FF2600 紅字底線
const SIZE = { line1: 45, line2: 36, line3: 36 } as const;
const RED = "#FF2600";
// 相鄰兩張共用中間那條框線（底稿就是這樣疊的）
const STEP = LABEL_BOX.height - LABEL_BOX.border;

const s = StyleSheet.create({
  page: { fontFamily: "NotoSansTCLabel", backgroundColor: "#FFFFFF" },
  box: {
    position: "absolute",
    left: LABEL_BOX.left,
    width: LABEL_BOX.width,
    height: LABEL_BOX.height,
    borderWidth: LABEL_BOX.border,
    borderColor: "#000000",
    borderStyle: "solid",
  },
  row: { flex: 1, alignItems: "center", justifyContent: "center" },
  line1: { fontWeight: 700, color: "#000000" },
  line2: { fontWeight: 400, color: "#000000" },
  underline: { borderBottomWidth: 2.5, borderBottomColor: RED, borderBottomStyle: "solid" },
  line3: { fontWeight: 400, color: RED },
});

function Label({ lines, top }: { lines: LabelLines; top: number }) {
  return (
    <View style={[s.box, { top }]}>
      <View style={s.row}>
        <Text wrap={false} style={[s.line1, { fontSize: fitLabelFontSize(lines.line1, SIZE.line1, LABEL_TEXT_MAX_WIDTH) }]}>
          {lines.line1}
        </Text>
      </View>
      <View style={s.row}>
        <Text wrap={false} style={[s.line2, { fontSize: fitLabelFontSize(lines.line2, SIZE.line2, LABEL_TEXT_MAX_WIDTH) }]}>
          {lines.line2}
        </Text>
      </View>
      <View style={s.row}>
        {lines.line3 ? (
          <View style={s.underline}>
            <Text wrap={false} style={[s.line3, { fontSize: fitLabelFontSize(lines.line3, SIZE.line3, LABEL_TEXT_MAX_WIDTH) }]}>
              {lines.line3}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

export function ShippingLabelDocument({ lines, copies }: { lines: LabelLines; copies: number }) {
  return (
    <Document title={`出貨標籤 ${lines.line1}`}>
      {paginateLabels(copies).map((count, pageIdx) => (
        <Page key={pageIdx} size={[LABEL_PAGE.width, LABEL_PAGE.height]} style={s.page}>
          {Array.from({ length: count }, (_, i) => (
            <Label key={i} lines={lines} top={LABEL_BOX.top + i * STEP} />
          ))}
        </Page>
      ))}
    </Document>
  );
}

export async function generateShippingLabelPdfBlob(lines: LabelLines, copies: number): Promise<Blob> {
  return pdf(<ShippingLabelDocument lines={lines} copies={copies} />).toBlob();
}
