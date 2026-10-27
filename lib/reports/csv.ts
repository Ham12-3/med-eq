// CSV export. Cells that a spreadsheet would run as a formula (=, +, -, @, tab, carriage return)
// are prefixed with an apostrophe: report text includes free text typed by users.

export type Column = { key: string; label: string };
export type Cell = string | number | boolean | null;
export type Row = Record<string, Cell>;

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: Cell): string {
  if (value === null) return "";
  let text = typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);
  if (typeof value === "string" && FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** RFC 4180 CSV with a byte-order mark, so Excel opens it as UTF-8. */
export function toCsv(columns: Column[], rows: Row[]): string {
  const lines = [columns.map((c) => csvCell(c.label)).join(",")];
  for (const row of rows) lines.push(columns.map((c) => csvCell(row[c.key] ?? null)).join(","));
  return `﻿${lines.join("\r\n")}\r\n`;
}
