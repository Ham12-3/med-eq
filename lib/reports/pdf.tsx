import { Document, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { Column, Row } from "./csv";

const styles = StyleSheet.create({
  page: { padding: 28, fontFamily: "Helvetica", fontSize: 8, color: "#111" },
  title: { fontFamily: "Helvetica-Bold", fontSize: 14, marginBottom: 2 },
  meta: { color: "#555", marginBottom: 10 },
  header: { flexDirection: "row", borderBottomWidth: 1, borderColor: "#111", paddingBottom: 3, fontFamily: "Helvetica-Bold" },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: "#ccc", paddingVertical: 3 },
  cell: { flex: 1, paddingRight: 4 },
  footer: { position: "absolute", bottom: 16, left: 28, right: 28, flexDirection: "row", justifyContent: "space-between", color: "#777", fontSize: 7 },
});

function text(value: Row[string]): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

/** A report as an A4 landscape table, with the generation time and page numbers on every page. */
export async function renderReportPdf(report: { title: string; description: string; columns: Column[] }, rows: Row[], generatedAt: string): Promise<Buffer> {
  return renderToBuffer(
    <Document title={report.title} author="MedAsset">
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text style={styles.title}>{report.title}</Text>
        <Text style={styles.meta}>{report.description} Generated {generatedAt}. {rows.length} rows.</Text>
        <View style={styles.header} fixed>
          {report.columns.map((c) => <Text key={c.key} style={styles.cell}>{c.label}</Text>)}
        </View>
        {rows.map((row, i) => (
          <View key={i} style={styles.row} wrap={false}>
            {report.columns.map((c) => <Text key={c.key} style={styles.cell}>{text(row[c.key])}</Text>)}
          </View>
        ))}
        {rows.length === 0 && <Text style={{ marginTop: 8 }}>Nothing to report.</Text>}
        <View style={styles.footer} fixed>
          <Text>MedAsset · Northbrook General Hospital (fictional) · synthetic data</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>,
  );
}
