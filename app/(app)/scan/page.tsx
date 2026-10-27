import { Suspense } from "react";
import { requirePermission } from "@/lib/auth/session";
import { ScanFlow } from "./scan-flow";

export default function ScanPage() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 py-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Scan</h1>
        <p className="text-muted-foreground text-sm">
          Scan a device to see if it is safe to use, then scan the room to record where it is.
        </p>
      </header>
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
        <Authorised />
      </Suspense>
    </main>
  );
}

async function Authorised() {
  await requirePermission("location.record");
  return <ScanFlow />;
}
