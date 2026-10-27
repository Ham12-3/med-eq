"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";
import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import { StatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { SortKey } from "@/lib/assets/filters";
import type { AssetRow } from "@/lib/data/assets";
import { REASON_TEXT } from "@/lib/rules/assetStatus";

// Sorting, filtering and paging happen on the server through the URL;
// the table only lays out the current page.

const features = tableFeatures({});
const helper = createColumnHelper<typeof features, AssetRow>();

const columns = helper.columns([
  helper.accessor("giai", {
    header: "Asset (GIAI)",
    meta: { sort: "giai" },
    cell: (info) => (
      <Link href={`/assets/${info.row.original.id}`} className="font-mono text-xs font-medium underline-offset-4 hover:underline">
        {info.getValue()}
      </Link>
    ),
  }),
  helper.accessor("modelName", {
    header: "Model",
    meta: { sort: "model" },
    cell: (info) => (
      <span className="flex flex-col">
        <span>{info.getValue()}</span>
        <span className="text-muted-foreground font-mono text-xs">{info.row.original.serialNumber}</span>
      </span>
    ),
  }),
  helper.accessor("ownerName", { header: "Owner", meta: { sort: "owner" } }),
  helper.accessor("roomName", {
    header: "Last seen",
    meta: { sort: "location" },
    cell: (info) => {
      const r = info.row.original;
      if (!r.roomName) return <span className="text-muted-foreground">Unknown</span>;
      return (
        <span className="flex flex-col">
          <span>{r.roomName}</span>
          <span className="text-muted-foreground text-xs">{r.buildingName}, {r.floorName} · {r.seenAt}</span>
        </span>
      );
    },
  }),
  helper.accessor("nextDueOn", {
    header: "Next PPM",
    meta: { sort: "next_due" },
    cell: (info) => info.getValue() ?? <span className="text-muted-foreground">None</span>,
  }),
  helper.accessor("display", {
    header: "Status",
    meta: { sort: "status" },
    cell: (info) => {
      const r = info.row.original;
      return (
        <span className="flex flex-col items-start gap-1">
          <StatusBadge display={r.display} />
          {r.reasons.length > 0 && (
            <span className="text-muted-foreground text-xs">{r.reasons.map((x) => REASON_TEXT[x]).join(", ")}</span>
          )}
        </span>
      );
    },
  }),
]);

type Props = {
  rows: AssetRow[];
  sort: SortKey;
  dir: "asc" | "desc";
  /** Query string for sorting by each column, built on the server from the current filters. */
  sortHrefs: Record<SortKey, string>;
};

export function AssetTable({ rows, sort, dir, sortHrefs }: Props) {
  const table = useTable({ features, columns, data: rows });

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((group) => (
          <TableRow key={group.id}>
            {group.headers.map((header) => {
              const key = (header.column.columnDef.meta as { sort?: SortKey } | undefined)?.sort;
              const active = key === sort;
              return (
                <TableHead
                  key={header.id}
                  aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}
                >
                  {key ? (
                    <Link href={`?${sortHrefs[key]}`} className="inline-flex items-center gap-1 hover:underline" scroll={false}>
                      <table.FlexRender header={header} />
                      {active && (dir === "asc" ? <ArrowUp aria-hidden className="size-3" /> : <ArrowDown aria-hidden className="size-3" />)}
                    </Link>
                  ) : (
                    <table.FlexRender header={header} />
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={columns.length} className="text-muted-foreground py-8 text-center">
              No assets match these filters.
            </TableCell>
          </TableRow>
        ) : (
          table.getRowModel().rows.map((row) => (
            <TableRow key={row.id} data-status={row.original.display}>
              {row.getAllCells().map((cell) => (
                <TableCell key={cell.id} className="align-top">
                  <table.FlexRender cell={cell} />
                </TableCell>
              ))}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
