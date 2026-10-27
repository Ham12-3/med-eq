"use client";

import { useActionState } from "react";
import { setDeviceInUse, type InUseState } from "@/app/(app)/assets/[id]/actions";
import { Button } from "@/components/ui/button";

export function InUseToggle({ assetId, inUse, doNotUse }: { assetId: string; inUse: boolean; doNotUse: boolean }) {
  const [state, action, pending] = useActionState<InUseState, FormData>(setDeviceInUse, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="assetId" value={assetId} />
      <input type="hidden" name="inUse" value={String(!inUse)} />
      <span className="text-sm">{inUse ? "Marked in use." : "Marked free."}</span>
      <Button type="submit" variant="outline" disabled={pending || (!inUse && doNotUse)}>
        {inUse ? "Mark free" : "Mark in use"}
      </Button>
      {!inUse && doNotUse && <span className="text-muted-foreground text-sm">Cannot be marked in use while it must not be used.</span>}
      {state.error && <span role="alert" className="text-destructive text-sm">{state.error}</span>}
    </form>
  );
}
