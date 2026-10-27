"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { savedViews } from "@/db/schema";
import { filtersToQuery, parseAssetFilters } from "@/lib/assets/filters";
import { authorizedWrite } from "@/lib/auth/session";

const SaveView = z.object({
  name: z.string().trim().min(1, "Give the view a name").max(60),
  query: z.string().max(2000),
});

export async function saveAssetView(formData: FormData) {
  const input = SaveView.safeParse({ name: formData.get("name"), query: formData.get("query") ?? "" });
  if (!input.success) return;
  // Normalise through the parser so only recognised filters are ever stored.
  const params = new URLSearchParams(input.data.query);
  const query = filtersToQuery(parseAssetFilters(Object.fromEntries([...params.keys()].map((k) => [k, params.getAll(k)]))), { page: 1 });
  await authorizedWrite("asset.viewRegister", (tx, user) =>
    tx.insert(savedViews).values({ userId: user.id, page: "assets", name: input.data.name, query }),
  );
  refresh();
}

/** Views are never deleted: removing one archives it. */
export async function archiveAssetView(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  await authorizedWrite("asset.viewRegister", (tx, user) =>
    tx.update(savedViews).set({ archived: true })
      .where(and(eq(savedViews.id, id), eq(savedViews.userId, user.id))),
  );
  refresh();
}
