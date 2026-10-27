import { Document, Page, Rect, renderToBuffer, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import { BarcodeFormat, DataMatrixWriter } from "@zxing/library";
import type { LabelContent } from "./content";

// 62 x 40 mm, a common label-printer width. 1 mm = 2.835 pt.
const MM = 2.835;
const SIZE = { width: 62 * MM, height: 40 * MM };

const styles = StyleSheet.create({
  page: { padding: 2.5 * MM, fontFamily: "Helvetica", fontSize: 7, color: "#000" },
  title: { fontFamily: "Helvetica-Bold", fontSize: 15, letterSpacing: 1, paddingVertical: 1.5 * MM, textAlign: "center" },
  serviced: { borderWidth: 1.2, borderColor: "#000" },
  doNotUse: { backgroundColor: "#c00000", color: "#fff" },
  body: { flexDirection: "row", marginTop: 1.5 * MM, gap: 2 * MM },
  lines: { flex: 1, gap: 0.6 * MM },
  line: { flexDirection: "row" },
  key: { width: 13 * MM, color: "#333" },
  value: { fontFamily: "Helvetica-Bold", flex: 1 },
});

/** GS1 DataMatrix of the device's GIAI, drawn as vector squares so it prints sharp. */
function DataMatrix({ giai, size }: { giai: string; size: number }) {
  const m = new DataMatrixWriter().encode(`8004${giai}`, BarcodeFormat.DATA_MATRIX, 0, 0);
  const cells: { x: number; y: number }[] = [];
  for (let y = 0; y < m.getHeight(); y++) for (let x = 0; x < m.getWidth(); x++) if (m.get(x, y)) cells.push({ x, y });
  const n = Math.max(m.getWidth(), m.getHeight());
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${n} ${n}`}>
      {cells.map((c) => <Rect key={`${c.x}-${c.y}`} x={c.x} y={c.y} width={1} height={1} fill="#000" />)}
    </Svg>
  );
}

export async function renderLabelPdf(label: LabelContent): Promise<Buffer> {
  return renderToBuffer(
    <Document title={`${label.title} ${label.giai}`} author="MedAsset">
      <Page size={SIZE} style={styles.page}>
        <Text style={[styles.title, label.kind === "serviced" ? styles.serviced : styles.doNotUse]}>{label.title}</Text>
        <View style={styles.body}>
          <View style={styles.lines}>
            {label.lines.map(([key, value]) => (
              <View key={key} style={styles.line}>
                <Text style={styles.key}>{key}</Text>
                <Text style={styles.value}>{value}</Text>
              </View>
            ))}
          </View>
          {/* White quiet zone round the symbol so scanners find it, not the title box. */}
          <View style={{ padding: 1.2 * MM, backgroundColor: "#fff" }}>
            <DataMatrix giai={label.giai} size={13.5 * MM} />
          </View>
        </View>
      </Page>
    </Document>,
  );
}
