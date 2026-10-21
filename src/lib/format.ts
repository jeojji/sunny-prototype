const cad = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });
const cadCents = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 2 });

/** Format a dollar amount; whole dollars unless the value has cents. Never prints NaN/Infinity. */
export function money(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return Number.isInteger(value) ? cad.format(value) : cadCents.format(value);
}

export function months(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return `${value} ${value === 1 ? 'month' : 'months'}`;
}

/** "36 months (about 3 years)" style description. */
export function horizon(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (value < 12) return months(value);
  const years = value / 12;
  const yearText = Number.isInteger(years) ? `${years} ${years === 1 ? 'year' : 'years'}` : `about ${years.toFixed(1)} years`;
  return `${months(value)} (${yearText})`;
}
