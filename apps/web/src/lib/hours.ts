import type { BusinessHours } from '@oraviq/shared';

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "07:00" → "7 a.m.", "12:00" → "noon", "17:30" → "5:30 p.m." */
export function formatClock(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return hhmm;
  const h = Number(m[1]);
  const min = m[2]!;
  if (h === 12 && min === '00') return 'noon';
  if (h === 0 && min === '00') return 'midnight';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${min === '00' ? '' : `:${min}`} ${h < 12 ? 'a.m.' : 'p.m.'}`;
}

/** "Mon to Fri 7 a.m. to 6 p.m., Sat 8 a.m. to noon" */
export function describeHours(hours: BusinessHours | null | undefined): string {
  const days = hours?.days ?? [];
  if (!days.some(Boolean)) return 'Set your hours in Settings';
  const order = [1, 2, 3, 4, 5, 6, 0];
  const groups: Array<{ from: number; to: number; open: string; close: string }> = [];
  for (const d of order) {
    const h = days[d];
    if (!h) continue;
    const last = groups[groups.length - 1];
    const prevDay = order[order.indexOf(d) - 1];
    if (last && last.open === h.open && last.close === h.close && prevDay === last.to) last.to = d;
    else groups.push({ from: d, to: d, open: h.open, close: h.close });
  }
  return groups
    .map((g) => `${DAY[g.from]}${g.to !== g.from ? ` to ${DAY[g.to]}` : ''} ${formatClock(g.open)} to ${formatClock(g.close)}`)
    .join(', ');
}

export { DAY, DAY_LONG };
