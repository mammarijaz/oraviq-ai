import type { BusinessHours } from '@oraviq/shared';

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** Parts of `date` in the IANA time zone `tz`. */
export function zonedParts(date: Date, tz: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  });
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  const dayIdx = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
  return { year: Number(p.year), month: Number(p.month), day: Number(p.day), hour: Number(p.hour), minute: Number(p.minute), weekday: dayIdx };
}

/** YYYY-MM-DD of `date` in `tz`. */
export function isoDateIn(date: Date, tz: string): string {
  const p = zonedParts(date, tz);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** The UTC instant of local wall time `iso` (YYYY-MM-DD) `hh:mm` in `tz`. */
export function zonedTimeToUtc(iso: string, hh: number, mm: number, tz: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm));
  const p = zonedParts(guess, tz);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  const offset = asIfUtc - guess.getTime();
  return new Date(guess.getTime() - offset);
}

export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

export function weekdayOfIso(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** "6:43 p.m." in `tz`. */
export function clockLabel(date: Date, tz: string): string {
  return date
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz })
    .replace('AM', 'a.m.')
    .replace('PM', 'p.m.');
}

/** "Thu, Nov 6" for an ISO date. */
export function shortDateLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** "Thursday, Nov 6" for an ISO date. */
export function longDateLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/**
 * Resolves a customer's day phrase ("Thursday", "tomorrow", "11/14") to an ISO
 * date in the tenant's zone, or null when it can't be pinned down ("next week").
 */
export function resolveDayPhrase(phrase: string | null | undefined, now: Date, tz: string): string | null {
  if (!phrase) return null;
  const t = phrase.trim().toLowerCase();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const today = isoDateIn(now, tz);
  if (t === 'today') return today;
  if (t === 'tomorrow') return addDaysIso(today, 1);
  const wd = WEEKDAYS.indexOf(t.split(/\s+/)[0]);
  if (wd >= 0) {
    let k = (wd - weekdayOfIso(today) + 7) % 7;
    if (k === 0) k = 7;
    return addDaysIso(today, k);
  }
  const m = /^(\d{1,2})\/(\d{1,2})$/.exec(t);
  if (m) {
    const [y] = today.split('-').map(Number);
    const mo = Number(m[1]);
    const da = Number(m[2]);
    if (mo < 1 || mo > 12 || da < 1 || da > 31) return null;
    let iso = `${y}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}`;
    if (iso < today) iso = `${y + 1}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}`;
    return iso;
  }
  return null;
}

export function dayLabelFromPhrase(phrase: string): string {
  const t = phrase.trim();
  return /^[a-z]+day$/i.test(t) && !/^today$/i.test(t) ? t[0].toUpperCase() + t.slice(1).toLowerCase() : t;
}

/** Is `at` outside the tenant's business hours? */
export function isAfterHours(at: Date, hours: BusinessHours | null | undefined, tz: string): boolean {
  if (!hours?.days?.length) return false;
  const p = zonedParts(at, tz);
  const day = hours.days[p.weekday];
  if (!day) return true;
  const minutes = p.hour * 60 + p.minute;
  const [oh, om] = day.open.split(':').map(Number);
  const [ch, cm] = day.close.split(':').map(Number);
  return minutes < oh * 60 + om || minutes >= ch * 60 + cm;
}

export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  days: [
    null,
    { day: 1, open: '07:00', close: '18:00' },
    { day: 2, open: '07:00', close: '18:00' },
    { day: 3, open: '07:00', close: '18:00' },
    { day: 4, open: '07:00', close: '18:00' },
    { day: 5, open: '07:00', close: '18:00' },
    { day: 6, open: '08:00', close: '12:00' },
  ],
};

export function fmtDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
