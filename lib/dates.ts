// Calendar dates are ISO "YYYY-MM-DD" strings, read in Europe/London.
// ISO strings sort and compare correctly as plain strings.

export type IsoDate = string;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export function isIsoDate(value: string): value is IsoDate {
  return ISO_DATE.test(value) && fromUtcMs(toUtcMs(value)) === value;
}

export function todayInLondon(now: Date = new Date()): IsoDate {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function toUtcMs(date: IsoDate): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtcMs(ms: number): IsoDate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromUtcMs(toUtcMs(date) + days * DAY_MS);
}

/** Adds calendar months, clamping to the last day of the target month (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(date: IsoDate, months: number): IsoDate {
  const [y, m, d] = date.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return fromUtcMs(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, lastDay)));
}

export function addYears(date: IsoDate, years: number): IsoDate {
  return addMonths(date, years * 12);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}

/** London's offset from UTC in minutes at an instant (0 in winter, 60 in summer). */
function londonOffsetMinutes(at: Date): number {
  const name = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", timeZoneName: "shortOffset" })
    .formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name);
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : 0;
}

/**
 * "YYYY-MM-DDTHH:MM" as a London wall-clock time (what a datetime-local input gives) to an instant.
 * Returns null for anything else.
 */
export function fromLondonLocal(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m || !isIsoDate(`${m[1]}-${m[2]}-${m[3]}`)) return null;
  const asUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  // Correct by the offset in force at that time; a second pass settles the hour around clock changes.
  let at = asUtc - londonOffsetMinutes(new Date(asUtc)) * 60_000;
  at = asUtc - londonOffsetMinutes(new Date(at)) * 60_000;
  return new Date(at);
}

/** A timestamp on a calendar date at a UTC clock time. */
export function atTime(date: IsoDate, hours: number, minutes = 0): Date {
  return new Date(toUtcMs(date) + (hours * 60 + minutes) * 60_000);
}
