import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getDb } from "@/db/client";
import { requirePermission } from "@/lib/auth/session";
import { getIncident, HARM_TEXT } from "@/lib/data/incidents";
import { UpdateIncidentForm } from "../incident-forms";

export default function IncidentPage({ params }: PageProps<"/incidents/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
        <Incident params={params} />
      </Suspense>
    </main>
  );
}

async function Incident({ params }: { params: PageProps<"/incidents/[id]">["params"] }) {
  await requirePermission("incident.manage");
  const { id } = await params;
  const incident = await getIncident(getDb(), id);
  if (!incident) notFound();
  return (
    <>
      <header className="flex flex-col gap-2">
        <Link href="/incidents" className="text-muted-foreground text-sm hover:underline">← Incidents</Link>
        <h1 className="text-2xl font-semibold tracking-tight"><span className="font-mono">{incident.reference}</span></h1>
        <p className="text-muted-foreground text-sm">
          {incident.occurredAt}{incident.roomName ? ` · ${incident.roomName}` : ""} · {HARM_TEXT[incident.harmLevel]} · logged by {incident.reportedBy}
        </p>
      </header>
      <section className="flex flex-col gap-2 rounded-lg border p-4">
        <h2 className="font-medium">What happened</h2>
        <p className="text-sm whitespace-pre-line">{incident.description}</p>
        {incident.assetId && (
          <p className="text-sm">
            Device: <Link href={`/assets/${incident.assetId}`} className="underline underline-offset-4">{incident.modelName}</Link>{" "}
            <span className="font-mono">{incident.giai}</span>
          </p>
        )}
      </section>
      <section className="flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="font-medium">Follow-up</h2>
        <UpdateIncidentForm incident={incident} />
      </section>
    </>
  );
}
