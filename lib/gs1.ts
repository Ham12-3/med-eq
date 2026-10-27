// GS1 identifiers used by Scan4Safety: GLN for places, GIAI for assets.
// All synthetic codes use a company prefix in GS1's 02x restricted-circulation
// range, so they can never collide with a real allocated number.

export const COMPANY_PREFIX = "0299999";

/** GS1 mod-10 check digit for the digits before it (GTIN, GLN, SSCC). */
export function gs1CheckDigit(body: string): number {
  if (!/^\d+$/.test(body)) throw new Error(`GS1 body must be digits: ${body}`);
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const digit = Number(body[body.length - 1 - i]);
    sum += digit * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

/** 13-digit GLN: company prefix + 5-digit location reference + check digit. */
export function makeGln(locationRef: number): string {
  const body = COMPANY_PREFIX + String(locationRef).padStart(5, "0");
  if (body.length !== 12) throw new Error(`Location reference too long: ${locationRef}`);
  return body + gs1CheckDigit(body);
}

export function isValidGln(gln: string): boolean {
  return /^\d{13}$/.test(gln) && gs1CheckDigit(gln.slice(0, 12)) === Number(gln[12]);
}

// GIAI (AI 8004): company prefix + individual asset reference, up to 30 characters.
// Asset references here use digits and upper-case letters only, a subset of GS1's allowed set.
const GIAI = /^\d{7}[0-9A-Z]{1,23}$/;

export function makeGiai(assetRef: string): string {
  const giai = COMPANY_PREFIX + assetRef;
  if (!GIAI.test(giai)) throw new Error(`Invalid GIAI: ${giai}`);
  return giai;
}

export function isValidGiai(giai: string): boolean {
  return GIAI.test(giai);
}

export type ScanResult = { kind: "giai" | "gln"; value: string };

const GS = "\u001d"; // FNC1 / group separator between variable-length element strings

/**
 * Reads what a scanner or a person typed: a GS1 element string with or without
 * brackets, "(8004)…" for a device or "(414)…" for a place, or a bare GIAI or GLN.
 * Returns null for anything else.
 */
export function parseScan(input: string): ScanResult | null {
  let text = input.trim().replace(/^\][A-Za-z]\d/, ""); // symbology identifier, e.g. ]d2 for GS1 DataMatrix
  if (text.startsWith(GS)) text = text.slice(1);
  if (!text) return null;

  const bracketed = [...text.matchAll(/\((\d{2,4})\)([^(]*)/g)];
  if (bracketed.length > 0) {
    for (const [, ai, value] of bracketed) {
      const result = fromAi(ai, value.replaceAll(GS, "").trim());
      if (result) return result;
    }
    return null;
  }

  if (text.startsWith("8004")) return fromAi("8004", text.slice(4).split(GS)[0]);
  if (text.startsWith("414") && /^414\d{13}(\u001d|$)/.test(text)) return fromAi("414", text.slice(3, 16));

  // No AI to say which it is. 13 digits can only be a GLN (a mistyped one must not pass as a GIAI),
  // and a bare GIAI must be one of ours.
  const bare = text.toUpperCase();
  if (/^\d{13}$/.test(bare)) return isValidGln(bare) ? { kind: "gln", value: bare } : null;
  if (isValidGiai(bare) && bare.startsWith(COMPANY_PREFIX)) return { kind: "giai", value: bare };
  return null;
}

function fromAi(ai: string, value: string): ScanResult | null {
  if (ai === "8004" && isValidGiai(value)) return { kind: "giai", value };
  if (ai === "414" && isValidGln(value)) return { kind: "gln", value };
  return null;
}
