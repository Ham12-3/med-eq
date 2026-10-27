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
