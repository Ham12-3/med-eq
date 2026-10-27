import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDb } from "@/db/client";
import { requirePermission } from "@/lib/auth/session";
import { getNotice, SOURCE_TEXT } from "@/lib/data/notices";
import { todayInLondon } from "@/lib/dates";
import { canCloseNotice } from "@/lib/rules/notices";
import { CloseNoticeForm, NotAffectedForm } from "./notice-actions";

const MATCH_TEXT = { open: "Waiting", actioned: "Actioned", not_affected: "Not affected" } as const;

export default function NoticePage({ params }: PageProps<"/notices/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
        <NoticeView params={params} />
      </Suspense>
    </main>
  );
}

async function NoticeView({ params }: { params: PageProps<"/notices/[id]">["params"] }) {
  await requirePermission("notice.manage");
  const { id } = await params;
  const notice = await getNotice(getDb(), id);
  if (!notice) notFound();
  const today = todayInLondon();
  const waiting = notice.matches.filter((m) => m.status === "open").length;
  const overdue = notice.status === "open" && notice.deadline < today;

  return (
    <>
      <header className="flex flex-col gap-2">
        <Link href="/notices" className="text-muted-foreground text-sm hover:underline">← Safety notices</Link>
        <h1 className="text-2xl font-semibold tracking-tight"><span className="font-mono text-xl">{notice.reference}</span> · {notice.title}</h1>
        <p className="text-muted-foreground text-sm">
          {SOURCE_TEXT[notice.source]} · issued {notice.issuedOn} · logged {notice.createdAt} by {notice.createdBy}
          {notice.quarantineRequired ? " · affected devices must not be used until actioned" : " · advisory: devices stay in use"}
        </p>
        <p className={overdue ? "font-medium text-red-700 dark:text-red-400" : ""}>
          Action by {notice.deadline}{overdue ? " (passed)" : ""} · {notice.matches.length - waiting} of {notice.matches.length} devices done
          {notice.status === "closed" ? ` · closed ${notice.closedAt}` : ""}
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2 rounded-lg border p-4">
          <h2 className="font-medium">What is wrong</h2>
          <p className="text-sm whitespace-pre-line">{notice.description}</p>
        </div>
        <div className="flex flex-col gap-2 rounded-lg border p-4">
          <h2 className="font-medium">Required action</h2>
          <p className="text-sm whitespace-pre-line">{notice.requiredAction}</p>
          <h3 className="mt-2 text-sm font-medium">Affected devices</h3>
          <ul className="text-sm">
            {notice.criteria.map((c) => (
              <li key={c.id}>
                {c.modelName}
                {(c.serialFrom || c.serialTo) && <span className="font-mono">, serials {c.serialFrom ?? "first"} to {c.serialTo ?? "last"}</span>}
                {c.firmwareVersions?.length ? `, firmware ${c.firmwareVersions.join(", ")}` : ""}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-label="Matched devices" className="flex flex-col gap-2">
        <h2 className="font-medium">Matched devices ({notice.matches.length})</h2>
        {notice.matches.length === 0 ? <p className="text-muted-foreground text-sm">No devices in the register match this notice.</p> : (
          <Table>
            <TableHeader>
              <TableRow><TableHead>Device</TableHead><TableHead>Last seen</TableHead><TableHead>Recall job</TableHead><TableHead>Status</TableHead><TableHead /></TableRow>
            </TableHeader>
            <TableBody>
              {notice.matches.map((m) => (
                <TableRow key={m.id} data-status={m.status}>
                  <TableCell>
                    <Link href={`/assets/${m.assetId}`} className="font-mono text-sm underline-offset-4 hover:underline">{m.giai}</Link>
                    <span className="text-muted-foreground block text-xs">{m.modelName} · {m.serialNumber}{m.firmwareVersion ? ` · fw ${m.firmwareVersion}` : ""}</span>
                  </TableCell>
                  <TableCell className="text-sm">
                    {m.roomNow ?? "Unknown"}
                    {m.roomAtMatch && m.roomAtMatch !== m.roomNow && <span className="text-muted-foreground block text-xs">was in {m.roomAtMatch} when matched</span>}
                  </TableCell>
                  <TableCell className="text-sm">
                    {m.jobId ? <Link href={`/work/${m.jobId}`} className="font-mono underline-offset-4 hover:underline">{m.jobNumber}</Link> : "None"}
                    {m.actionNotes && <span className="text-muted-foreground block text-xs">{m.actionNotes}</span>}
                  </TableCell>
                  <TableCell className="text-sm">
                    {MATCH_TEXT[m.status]}
                    {m.actionedAt && <span className="text-muted-foreground block text-xs">{m.actionedAt}{m.actionedBy ? ` · ${m.actionedBy}` : ""}</span>}
                  </TableCell>
                  <TableCell>{notice.status === "open" && m.status === "open" && <NotAffectedForm matchId={m.id} giai={m.giai} />}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      {notice.status === "open" && <CloseNoticeForm noticeId={notice.id} ready={canCloseNotice(notice.matches.map((m) => m.status))} />}
    </>
  );
}
