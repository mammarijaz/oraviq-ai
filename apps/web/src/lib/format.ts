import { CHANNEL_LABELS, formatPhone, type Channel, type MessageDto } from '@oraviq/shared';
import { formatMoney } from '@oraviq/pricing';

export { formatMoney, formatPhone };

const pad = (n: number) => String(n).padStart(2, '0');

/** Date → 'YYYY-MM-DD' in local time. */
export function isoDay(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function tomorrowIso(): string {
  return isoDay(addDays(new Date(), 1));
}

/** 'YYYY-MM-DD' or a full ISO timestamp → Date (date-only strings are local midnight). */
export function toDate(v: string | Date | null | undefined): Date | null {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "Thu, Nov 5" */
export function formatDay(v: string | Date | null | undefined): string {
  const d = toDate(v);
  return d ? d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '';
}

/** "Oct 26" */
export function formatShortDate(v: string | Date | null | undefined): string {
  const d = toDate(v);
  return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
}

/** "6:42 p.m." */
export function formatTime(v: string | Date | null | undefined): string {
  const d = toDate(v);
  if (!d) return '';
  return d
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    .replace(/\s?AM$/i, ' a.m.')
    .replace(/\s?PM$/i, ' p.m.');
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Inbox list time: "6:43 p.m." today, "Yesterday", otherwise "Thu, Nov 5". */
export function formatListTime(v: string | null | undefined, now: Date = new Date()): string {
  const d = toDate(v);
  if (!d) return '';
  if (sameDay(d, now)) return formatTime(d);
  if (sameDay(d, addDays(now, -1))) return 'Yesterday';
  return formatDay(d);
}

/** Call log time: "Today, 7:52 a.m.", "Yesterday, 8:40 p.m.", "Oct 30, 9:05 p.m." */
export function formatWhen(v: string | null | undefined, now: Date = new Date()): string {
  const d = toDate(v);
  if (!d) return '';
  const t = formatTime(d);
  if (sameDay(d, now)) return `Today, ${t}`;
  if (sameDay(d, addDays(now, -1))) return `Yesterday, ${t}`;
  return `${formatShortDate(d)}, ${t}`;
}

/** "2 days ago", "1 week ago" for reviews. */
export function formatAgo(v: string | null | undefined, now: Date = new Date()): string {
  const d = toDate(v);
  if (!d) return '';
  const days = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) {
    const w = Math.floor(days / 7);
    return `${w} week${w === 1 ? '' : 's'} ago`;
  }
  if (days < 365) {
    const m = Math.floor(days / 30);
    return `${m} month${m === 1 ? '' : 's'} ago`;
  }
  return formatShortDate(d);
}

/** Seconds → "2:14". */
export function formatDuration(seconds: number | null | undefined): string {
  const s = Math.max(0, Math.round(seconds ?? 0));
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

export function channelLabel(ch: Channel | string): string {
  return (CHANNEL_LABELS as Record<string, string>)[ch] ?? String(ch);
}

/** The small line under a bubble: "Text message, 6:42 p.m." (API meta wins when present). */
export function messageMeta(m: MessageDto): string {
  if (m.meta) return m.meta;
  if (m.author === 'system') return '';
  const t = formatTime(m.createdAt);
  if (m.channel === 'phone') return `${m.author === 'customer' ? 'Caller' : m.author === 'owner' ? 'You' : 'AI receptionist'}, ${t}`;
  if (m.author === 'owner') return `You, ${channelLabel(m.channel === 'booking_form' ? 'sms' : m.channel)}, ${t}`;
  return `${channelLabel(m.channel)}, ${t}`;
}

/** "1 conversation" / "3 conversations" */
export function plural(n: number, word: string, pluralWord = `${word}s`): string {
  return `${n} ${n === 1 ? word : pluralWord}`;
}

export function firstName(name: string | null | undefined): string {
  return String(name ?? '').trim().split(/\s+/)[0] ?? '';
}

/** Initials for avatars: "Demo Roll-Off Co." → "DR". */
export function initials(name: string | null | undefined): string {
  const words = String(name ?? '')
    .replace(/[^A-Za-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((w) => w && !/^(co|inc|llc|the)$/i.test(w));
  return (words.slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || 'O').slice(0, 2);
}

/** Dollars typed by the owner → integer cents. */
export function dollarsToCents(v: string | number | null | undefined): number {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function centsToDollars(c: number | null | undefined): string {
  if (c == null) return '';
  const d = c / 100;
  return Number.isInteger(d) ? String(d) : d.toFixed(2);
}
