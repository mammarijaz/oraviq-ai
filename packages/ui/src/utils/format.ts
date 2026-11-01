/**
 * Formatting helpers. formatMoney and formatTons mirror @oraviq/pricing exactly (that package is not a
 * dependency of @oraviq/ui), so a quote rendered here reads the same as the engine's own sentences.
 */
export function formatMoney(cents: number, opts: { showZeroCents?: boolean } = {}): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const dollars = Math.floor(abs / 100);
  const rest = abs % 100;
  const d = dollars.toLocaleString('en-US');
  const s = rest === 0 && !opts.showZeroCents ? `$${d}` : `$${d}.${String(rest).padStart(2, '0')}`;
  return negative ? `-${s}` : s;
}

export function formatTons(tons: number): string {
  return `${Number.isInteger(tons) ? tons : tons.toFixed(1)} ton${tons === 1 ? '' : 's'}`;
}

/* ----------------------------------------------------------------- dates (local calendar days) */

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const WEEKDAYS: Array<[short: string, long: string]> = [
  ['Su', 'Sunday'], ['Mo', 'Monday'], ['Tu', 'Tuesday'], ['We', 'Wednesday'], ['Th', 'Thursday'], ['Fr', 'Friday'], ['Sa', 'Saturday'],
];

const pad = (n: number) => (n < 10 ? '0' : '') + n;

/** Date → 'YYYY-MM-DD' in local time. */
export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 'YYYY-MM-DD' → local Date at midnight, or null. */
export function parseIsoDate(s: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? '');
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function todayIso(): string {
  return toIsoDate(new Date());
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** "Thu, Nov 5", or with long=true "Thursday, November 5". */
export function formatDate(value: string | Date | null | undefined, long = false): string {
  const d = typeof value === 'string' || value == null ? parseIsoDate(value as string | null) : value;
  if (!d) return '';
  return d.toLocaleDateString('en-US', long ? { weekday: 'long', month: 'long', day: 'numeric' } : { weekday: 'short', month: 'short', day: 'numeric' });
}
