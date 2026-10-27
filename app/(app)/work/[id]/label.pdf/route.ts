import { getDb } from "@/db/client";
import { can } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { getLabelJob } from "@/lib/data/workOrders";
import { labelContent } from "@/lib/labels/content";
import { renderLabelPdf } from "@/lib/labels/pdf";

// GET /work/<id>/label.pdf: the SERVICED (or DO NOT USE) label for a closed job.
// Checks the user itself: the proxy alone is never enough.
export async function GET(_request: Request, ctx: RouteContext<"/work/[id]/label.pdf">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in again.", { status: 401 });
  if (!can(user, "workorder.viewQueue")) return new Response("Not allowed.", { status: 403 });

  const { id } = await ctx.params;
  const job = await getLabelJob(getDb(), id);
  if (!job) return new Response("No such job.", { status: 404 });
  const label = labelContent(job);
  if (!label) return new Response("This job has no label: it is still open, or it is a recall.", { status: 409 });

  const pdf = await renderLabelPdf(label);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${label.kind === "serviced" ? "serviced" : "do-not-use"}-${job.giai}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
