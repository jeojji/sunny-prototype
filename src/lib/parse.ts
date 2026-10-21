/**
 * Extract amounts and durations from free text. Used to ground model-proposed
 * fact updates in what the customer actually said, and by the scripted
 * interpreter. Signs are preserved so negative amounts are never silently
 * turned positive.
 */

export interface FoundAmount {
  value: number;
  negative: boolean;
}

const AMOUNT_RE =
  /(-|−|\bminus\s+|\bnegative\s+)?\$?\s?(?<![\d.,])(\d[\d,]*(?:\.\d+)?)(?![\d.,]*\d)\s?(k\b|thousand\b)?(?!\s*(?:%|(?:percent|years?|yrs?|months?|mos?)\b))/gi;
const DURATION_RE = /(\d+(?:\.\d+)?)\s*(years?|yrs?|months?|mos?)\b/gi;

/** All dollar-like amounts in the text, e.g. "$1,200", "14000", "1.5k", "-500". Excludes durations and percentages. */
export function findAmounts(text: string): FoundAmount[] {
  const out: FoundAmount[] = [];
  for (const m of text.matchAll(AMOUNT_RE)) {
    const digits = m[2].replace(/,/g, '');
    if (!/^\d+(\.\d+)?$/.test(digits)) continue;
    let value = parseFloat(digits);
    if (m[3]) value *= 1000;
    if (!Number.isFinite(value)) continue;
    out.push({ value: Math.round(value * 100) / 100, negative: Boolean(m[1]) });
  }
  return out;
}

/** All durations in the text, in whole months ("3 years" → 36, "18 months" → 18). */
export function findDurations(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(DURATION_RE)) {
    const n = parseFloat(m[1]);
    const months = /^y/i.test(m[2]) ? Math.round(n * 12) : Math.round(n);
    if (months >= 1) out.push(months);
  }
  return out;
}

export function parseDuration(text: string): number | null {
  return findDurations(text)[0] ?? null;
}

/** Lowercase, drop $ and thousands separators, collapse whitespace and curly quotes. */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[$,]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
