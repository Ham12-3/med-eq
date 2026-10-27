import { createHash } from "node:crypto";
import { getDb } from "@/db/client";
import { describeAuditFilters, parseAuditFilters } from "@/lib/audit/filters";
import { can } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { auditUsers, changeSummary, searchAudit } from "@/lib/data/audit";
import { todayInLondon } from "@/lib/dates";
import { toCsv } from "@/lib/reports/csv";
import { renderReportPdf } from "@/lib/reports/pdf";

// GET /admin/audit/export?<filters>&format=csv|pdf: audit evidence.
// CSV has every matching entry with full before and after values; PDF is a readable summary.
const MAX_CSV = 50_000;
const MAX_PDF = 2_000;

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in again.", { status: 401 });
  if (!can(user, "audit.export")) return new Response("Not allowed.", { status: 403 });

  const params = Object.fromEntries(new URL(request.url).searchParams);
  const format = params.format;
  if (format !== "csv" && format !== "pdf") return new Response("Choose csv or pdf.", { status: 400 });
  const filters = parseAuditFilters(params);
  const db = getDb();
  const limit = format === "csv" ? MAX_CSV : MAX_PDF;
  const result = await searchAudit(db, filters, { limit, offset: 0 });
  if (!result.ok) return new Response(result.message, { status: 404 });

  const userName = (await auditUsers(db)).find((u) => u.id === filters.user)?.name;
  const description = describeAuditFilters(filters, { user: userName });
  const truncated = result.total > limit ? ` Showing the newest ${limit} of ${result.total}; narrow the search for the rest.` : "";
  const filename = `medasset-audit-${todayInLondon()}.${format}`;
  const exportedBy = `Exported by ${user.name}`;

  if (format === "csv") {
    const csv = toCsv(
      [
        { key: "at", label: "Time (UK)" }, { key: "user", label: "User" }, { key: "action", label: "Action" },
        { key: "table", label: "Record type" }, { key: "record", label: "Record" }, { key: "recordId", label: "Record id" },
        { key: "changes", label: "Changes" }, { key: "old", label: "Old value (JSON)" }, { key: "new", label: "New value (JSON)" },
      ],
      result.entries.map((e) => ({
        at: e.at, user: e.userName, action: e.action, table: e.tableLabel, record: e.recordLabel, recordId: e.recordId,
        changes: changeSummary(e), old: e.oldValue ? JSON.stringify(e.oldValue) : null, new: JSON.stringify(e.newValue),
      })),
    );
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        // Lets whoever receives the file check it has not been altered since export.
        "X-Content-SHA256": createHash("sha256").update(csv, "utf8").digest("hex"),
      },
    });
  }

  const generatedAt = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", dateStyle: "medium", timeStyle: "short" }).format(new Date());
  const pdf = await renderReportPdf(
    {
      title: "Audit evidence",
      description: `${description} ${result.total} entries.${truncated} ${exportedBy}.`,
      columns: [
        { key: "at", label: "Time (UK)" }, { key: "user", label: "User" }, { key: "what", label: "What" },
        { key: "record", label: "Record" }, { key: "changes", label: "Changes" },
      ],
    },
    result.entries.map((e) => ({
      at: e.at, user: e.userName, what: `${e.action === "insert" ? "Created" : "Changed"} ${e.tableLabel.toLowerCase()}`,
      record: e.recordLabel, changes: changeSummary(e),
    })),
    generatedAt,
  );
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store" },
  });
}
