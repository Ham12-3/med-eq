import Link from "next/link";
import { Suspense } from "react";
import { getDb } from "@/db/client";
import { requirePermission } from "@/lib/auth/session";
import { ACCEPTANCE_DAYS, registerOptions } from "@/lib/data/register";
import { todayInLondon } from "@/lib/dates";
import { RegisterForm } from "./register-form";

export default function RegisterDevicePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <Link href="/assets" className="text-muted-foreground text-sm hover:underline">← Asset register</Link>
        <h1 className="text-2xl font-semibold tracking-tight">Register a new device</h1>
        <p className="text-muted-foreground text-sm">
          The device is booked into the workshop and marked Do not use until its acceptance job passes.
          The job opens in your queue, due in {ACCEPTANCE_DAYS} days. Closing it puts the device into service and starts its PPM schedule.
        </p>
      </header>
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
        <Form />
      </Suspense>
    </main>
  );
}

async function Form() {
  await requirePermission("asset.register");
  return <RegisterForm options={await registerOptions(getDb())} today={todayInLondon()} />;
}
