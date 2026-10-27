import { sql } from "drizzle-orm";
import Link from "next/link";
import { Suspense } from "react";
import { getDb } from "@/db/client";
import { requirePermission } from "@/lib/auth/session";
import { todayInLondon } from "@/lib/dates";
import { NoticeForm } from "./notice-form";

export default function NewNoticePage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <Link href="/notices" className="text-muted-foreground text-sm hover:underline">← Safety notices</Link>
        <h1 className="text-2xl font-semibold tracking-tight">Log a safety notice</h1>
        <p className="text-muted-foreground text-sm">Saving finds every affected device, shows where it was last seen, and opens a recall job for each.</p>
      </header>
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
        <Form />
      </Suspense>
    </main>
  );
}

async function Form() {
  await requirePermission("notice.manage");
  const models = await getDb().execute<{ id: string; name: string }>(sql`
    select id, name from device_models where not is_test_equipment order by name`);
  return <NoticeForm models={[...models]} today={todayInLondon()} />;
}
