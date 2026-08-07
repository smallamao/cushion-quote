import path from "node:path";

import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";

const PUBLIC_DIR = path.join(process.cwd(), "public");

Font.register({
  family: "NotoSansTC",
  fonts: [
    { src: path.join(PUBLIC_DIR, "fonts", "NotoSansTC-Regular.ttf"), fontWeight: 400 },
    { src: path.join(PUBLIC_DIR, "fonts", "NotoSansTC-Bold.ttf"), fontWeight: 700 },
  ],
});
Font.registerHyphenationCallback((word) => [word]);

export interface SignatureRecordProps {
  signatureDataUrl: string;
  signerName: string;
  signedAtDisplay: string;
  ip: string;
  userAgent: string;
  token: string;
  quoteId: string;
}

const s = StyleSheet.create({
  page: { padding: 48, fontFamily: "NotoSansTC", fontSize: 11, color: "#1a1a1a" },
  title: { fontSize: 18, fontWeight: 700, marginBottom: 10 },
  hr: { borderBottomWidth: 1, borderBottomColor: "#cccccc", marginBottom: 18 },
  caption: { color: "#666666", marginBottom: 6 },
  sig: { width: 240, height: 110, objectFit: "contain", marginBottom: 22 },
  row: { flexDirection: "row", marginBottom: 9 },
  rowLabel: { width: 84, color: "#666666" },
  rowValue: { flex: 1 },
  footer: { marginTop: 18, fontSize: 9, color: "#888888" },
});

function SignatureRecordDocument(props: SignatureRecordProps) {
  const rows: Array<[string, string]> = [
    ["簽署人", props.signerName || "—"],
    ["簽署時間", props.signedAtDisplay],
    ["報價編號", props.quoteId],
    ["來源 IP", props.ip || "—"],
    ["裝置資訊", (props.userAgent || "—").slice(0, 60)],
    ["驗證碼", props.token],
  ];
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.title}>電子簽署存證</Text>
        <View style={s.hr} />
        <Text style={s.caption}>客戶簽名</Text>
        {props.signatureDataUrl ? <Image src={props.signatureDataUrl} style={s.sig} /> : null}
        {rows.map(([label, value]) => (
          <View style={s.row} key={label}>
            <Text style={s.rowLabel}>{label}</Text>
            <Text style={s.rowValue}>{value}</Text>
          </View>
        ))}
        <Text style={s.footer}>
          本頁為線上電子簽署之存證紀錄，與上述報價單內容一併存檔。
        </Text>
      </Page>
    </Document>
  );
}

export async function renderSignatureRecordPdf(props: SignatureRecordProps): Promise<Uint8Array> {
  const buf = await renderToBuffer(<SignatureRecordDocument {...props} />);
  return new Uint8Array(buf);
}
