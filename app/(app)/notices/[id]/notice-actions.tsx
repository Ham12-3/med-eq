"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { closeNoticeAction, markNotAffectedAction, type NoticeActionState } from "../actions";

export function NotAffectedForm({ matchId, giai }: { matchId: string; giai: string }) {
  const [state, action, pending] = useActionState<NoticeActionState, FormData>(markNotAffectedAction, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="matchId" value={matchId} />
      <Input name="reason" aria-label={`Why ${giai} is not affected`} placeholder="Why not affected" className="h-7 w-44 text-xs" required />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>Not affected</Button>
      {state.error && <span className="text-destructive text-xs">{state.error}</span>}
    </form>
  );
}

export function CloseNoticeForm({ noticeId, ready }: { noticeId: string; ready: boolean }) {
  const [state, action, pending] = useActionState<NoticeActionState, FormData>(closeNoticeAction, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="noticeId" value={noticeId} />
      <Button type="submit" disabled={pending || !ready}>Close notice</Button>
      {!ready && <span className="text-muted-foreground text-sm">Closes once every device is actioned or found not affected.</span>}
      {state.error && <span className="text-destructive text-sm">{state.error}</span>}
    </form>
  );
}
