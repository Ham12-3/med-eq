import Link from "next/link";
import { Suspense } from "react";
import { getDb } from "@/db/client";
import { requirePermission } from "@/lib/auth/session";
import { roomOptions } from "@/lib/data/assets";
import { NewIncidentForm } from "../incident-forms";

export default function NewIncidentPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <Link href="/incidents" className="text-muted-foreground text-sm hover:underline">← Incidents</Link>
        <h1 className="text-2xl font-semibold tracking-tight">Log an incident</h1>
      </header>
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
        <Form />
      </Suspense>
    </main>
  );
}

async function Form() {
  await requirePermission("incident.manage");
  const rooms = await roomOptions(getDb());
  // The latest time the picker allows, as London wall-clock time.
  const now = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/London", dateStyle: "short", timeStyle: "short" })
    .format(new Date()).replace(" ", "T");
  return <NewIncidentForm rooms={rooms} now={now} />;
}
