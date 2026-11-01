import { DEFAULT_BUSINESS_HOURS, isAfterHours, isoDateIn, longDateLabel, resolveDayPhrase, shortDateLabel, zonedTimeToUtc } from './time';

const TZ = 'America/New_York';

describe('time helpers', () => {
  it('converts local wall time to UTC across DST', () => {
    expect(zonedTimeToUtc('2026-07-01', 9, 0, TZ).toISOString()).toBe('2026-07-01T13:00:00.000Z');
    expect(zonedTimeToUtc('2026-12-01', 9, 0, TZ).toISOString()).toBe('2026-12-01T14:00:00.000Z');
  });

  it('resolves day phrases to the next occurrence', () => {
    const now = new Date('2026-11-02T15:00:00Z'); // Monday in Atlanta
    expect(isoDateIn(now, TZ)).toBe('2026-11-02');
    expect(resolveDayPhrase('Thursday', now, TZ)).toBe('2026-11-05');
    expect(resolveDayPhrase('Monday', now, TZ)).toBe('2026-11-09');
    expect(resolveDayPhrase('tomorrow', now, TZ)).toBe('2026-11-03');
    expect(resolveDayPhrase('11/14', now, TZ)).toBe('2026-11-14');
    expect(resolveDayPhrase('1/3', now, TZ)).toBe('2027-01-03');
    expect(resolveDayPhrase('next week', now, TZ)).toBeNull();
  });

  it('formats labels', () => {
    expect(shortDateLabel('2026-11-05')).toBe('Thu, Nov 5');
    expect(longDateLabel('2026-11-05')).toBe('Thursday, Nov 5');
  });

  it('knows business hours (Mon–Fri 7–6, Sat 8–12)', () => {
    expect(isAfterHours(new Date('2026-11-02T13:00:00Z'), DEFAULT_BUSINESS_HOURS, TZ)).toBe(false); // Mon 8 a.m.
    expect(isAfterHours(new Date('2026-11-02T23:30:00Z'), DEFAULT_BUSINESS_HOURS, TZ)).toBe(true); // Mon 6:30 p.m.
    expect(isAfterHours(new Date('2026-11-01T15:00:00Z'), DEFAULT_BUSINESS_HOURS, TZ)).toBe(true); // Sunday
    expect(isAfterHours(new Date('2026-11-07T18:00:00Z'), DEFAULT_BUSINESS_HOURS, TZ)).toBe(true); // Sat 1 p.m.
  });
});
