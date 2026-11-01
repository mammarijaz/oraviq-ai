import { describe, expect, it } from 'vitest';
import { SAMPLE_PRICE_TABLE, calculateQuote } from '@oraviq/pricing';
import { formatDay, formatDuration, formatListTime, formatTime, initials, dollarsToCents, centsToDollars } from '@/lib/format';
import { describeHours, formatClock } from '@/lib/hours';
import { fieldProblems, toDraft, toRequest, toTable } from '@/lib/priceDraft';
import { nextStep } from '@/lib/status';

describe('format', () => {
  it('writes dates and times the Oraviq way', () => {
    expect(formatDay('2026-11-05')).toBe('Thu, Nov 5');
    expect(formatTime(new Date(2026, 10, 1, 18, 42))).toBe('6:42 p.m.');
    expect(formatTime(new Date(2026, 10, 1, 7, 5))).toBe('7:05 a.m.');
    expect(formatDuration(134)).toBe('2:14');
    const now = new Date(2026, 10, 2, 9, 0);
    expect(formatListTime(new Date(2026, 10, 1, 20, 0).toISOString(), now)).toBe('Yesterday');
    expect(initials('Demo Roll-Off Co.')).toBe('DR');
    expect(dollarsToCents('$1,250.5')).toBe(125050);
    expect(centsToDollars(62500)).toBe('625');
  });

  it('describes business hours like the prototype', () => {
    expect(formatClock('12:00')).toBe('noon');
    const day = (d: number, open: string, close: string) => ({ day: d, open, close });
    expect(describeHours({ days: [null, day(1, '07:00', '18:00'), day(2, '07:00', '18:00'), day(3, '07:00', '18:00'), day(4, '07:00', '18:00'), day(5, '07:00', '18:00'), day(6, '08:00', '12:00')] })).toBe(
      'Mon to Fri 7 a.m. to 6 p.m., Sat 8 a.m. to noon',
    );
  });

  it('offers the next order step from ORDER_TRANSITIONS', () => {
    expect(nextStep({ status: 'confirmed' })?.status).toBe('delivered');
    expect(nextStep({ status: 'delivered' })?.status).toBe('picked_up');
    expect(nextStep({ status: 'requested' })).toBeNull();
  });
});

describe('price table draft', () => {
  it('round-trips the table through dollars without changing it', () => {
    const { version: _v, currency: _c, ...rest } = SAMPLE_PRICE_TABLE;
    expect(toRequest(toDraft(SAMPLE_PRICE_TABLE))).toEqual(rest);
  });

  it('quotes from unsaved edits', () => {
    const d = toDraft(SAMPLE_PRICE_TABLE);
    expect(calculateQuote(toTable(d), { yards: 20, days: 10, zip: '30319', debris: 'construction' })).toMatchObject({ ok: true, quote: { totalCents: 72000 } });
    d.sizes.find((s) => s.yards === 20)!.base = '650';
    expect(calculateQuote(toTable(d), { yards: 20, days: 10, zip: '30319', debris: 'construction' })).toMatchObject({ ok: true, quote: { totalCents: 74500 } });
  });

  it('marks the fields that need attention', () => {
    const d = toDraft(SAMPLE_PRICE_TABLE);
    d.sizes[0]!.base = '';
    d.zones[1]!.zips += ' 30303';
    const p = fieldProblems(d);
    expect(p.base0).toBe('Enter a price.');
    expect(p.zips1).toBe('ZIP 30303 is also in Zone 1.');
  });
});
