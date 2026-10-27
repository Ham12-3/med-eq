import { getDb } from "@/db/client";
import { can } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { todayInLondon } from "@/lib/dates";
import { toCsv } from "@/lib/reports/csv";
import { findReport } from "@/lib/reports/definitions";
import { renderReportPdf } from "@/lib/reports/pdf";

// GET /reports/<slug>/export?format=csv|pdf. Checks the user itself; the proxy alone is never enough.
export async function GET(request: Request, ctx: RouteContext<"/reports/[slug]/export">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in again.", { status: 401 });
  if (!can(user, "report.view")) return new Response("Not allowed.", { status: 403 });

  const { slug } = await ctx.params;
  const report = findReport(slug);
  if (!report) return new Response("No such report.", { status: 404 });
  const format = new URL(request.url).searchParams.get("format");
  if (format !== "csv" && format !== "pdf") return new Response("Choose csv or pdf.", { status: 400 });

  const today = todayInLondon();
  const rows = await report.load(getDb(), today);
  const filename = `medasset-${report.slug}-${today}.${format}`;
  const headers = { "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store" };

  if (format === "csv") {
    return new Response(toCsv(report.columns, rows), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" } });
  }
  const generatedAt = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", dateStyle: "medium", timeStyle: "short" }).format(new Date());
  const pdf = await renderReportPdf(report, rows, generatedAt);
  return new Response(new Uint8Array(pdf), { headers: { ...headers, "Content-Type": "application/pdf" } });
}
