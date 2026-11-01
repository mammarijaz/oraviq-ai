import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  SAMPLE_PRICE_TABLE as T,
  calculateQuote,
  findProhibited,
  formatMoney,
  renderQuoteSentence,
  unbackedAmounts,
  validatePriceTable,
  extensionFee,
  type DebrisType,
} from '../src/index';

const ok = (r: ReturnType<typeof calculateQuote>) => {
  if (!r.ok) throw new Error(`expected a quote, got ${r.error.code}`);
  return r.quote;
};

describe('calculateQuote: worked examples from the feature list', () => {
  it('20-yard, 10 days, zone 2, construction = $720', () => {
    const q = ok(calculateQuote(T, { yards: 20, days: 10, zip: '30319', debris: 'construction' }));
    expect(q.totalCents).toBe(72000);
    expect(q.lineItems.map((l) => l.amountCents)).toEqual([62500, 4500, 5000]);
    expect(q.includedTons).toBe(3);
    expect(q.overagePerTonCents).toBe(9500);
    expect(q.priceTableVersion).toBe(1);
  });

  it('10-yard household, default days, zone 1 = base only', () => {
    const q = ok(calculateQuote(T, { yards: 10, zip: '30307', debris: 'household' }));
    expect(q.days).toBe(7);
    expect(q.totalCents).toBe(42500);
  });

  it('15-yard clean fill uses the flat price and has no weight charge', () => {
    const q = ok(calculateQuote(T, { yards: 15, days: 5, zip: '30062', debris: 'heavy' }));
    expect(q.heavyFlat).toBe(true);
    expect(q.totalCents).toBe(62500 + 10000);
    expect(q.includedTons).toBeNull();
    expect(q.overagePerTonCents).toBeNull();
  });

  it('adds item surcharges', () => {
    const q = ok(calculateQuote(T, { yards: 20, days: 7, zip: '30318', debris: 'household', items: { mattress: 2, appliance: 1 } }));
    expect(q.totalCents).toBe(62500 + 2 * 2500 + 4000);
    expect(q.lineItems.find((l) => l.key === 'mattress')?.label).toBe('2 mattresses at $25');
  });
});

describe('calculateQuote: typed errors force a handoff', () => {
  it('unknown size', () => {
    const r = calculateQuote(T, { yards: 25, zip: '30318', debris: 'household' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('unknown_size');
      expect(r.error.suggestYards).toEqual([10, 15, 20, 30, 40]);
    }
  });
  it('ZIP outside zones', () => {
    const r = calculateQuote(T, { yards: 20, zip: '90210', debris: 'household' });
    expect(!r.ok && r.error.code).toBe('zone_not_served');
  });
  it('bad ZIP', () => {
    const r = calculateQuote(T, { yards: 20, zip: '303', debris: 'household' });
    expect(!r.ok && r.error.code).toBe('invalid_zip');
  });
  it('heavy debris in a 30-yard suggests 10 and 15', () => {
    const r = calculateQuote(T, { yards: 30, zip: '30318', debris: 'heavy' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatchObject({ code: 'heavy_not_allowed', suggestYards: [10, 15] });
  });
  it('rejects fractional, zero and too-long rentals', () => {
    expect((calculateQuote(T, { yards: 20, days: 0, zip: '30318', debris: 'household' }) as any).error.code).toBe('invalid_days');
    expect((calculateQuote(T, { yards: 20, days: 2.5, zip: '30318', debris: 'household' }) as any).error.code).toBe('invalid_days');
    expect((calculateQuote(T, { yards: 20, days: 61, zip: '30318', debris: 'household' }) as any).error.code).toBe('too_many_days');
  });
  it('unknown surcharge item', () => {
    expect((calculateQuote(T, { yards: 20, zip: '30318', debris: 'household', items: { piano: 1 } }) as any).error.code).toBe('unknown_item');
  });
});

describe('properties', () => {
  const sizes = T.sizes.map((s) => s.yards);
  const zips = T.zones.flatMap((z) => z.zips);
  const debris: DebrisType[] = ['household', 'construction', 'heavy'];
  const input = fc.record({
    yards: fc.constantFrom(...sizes),
    days: fc.integer({ min: 1, max: T.maxDays }),
    zip: fc.constantFrom(...zips),
    debris: fc.constantFrom(...debris),
    mattress: fc.integer({ min: 0, max: 5 }),
    tire: fc.integer({ min: 0, max: 5 }),
  });

  it('total always equals the sum of line items and is positive', () => {
    fc.assert(fc.property(input, (i) => {
      const r = calculateQuote(T, { ...i, items: { mattress: i.mattress, tire: i.tire } });
      if (!r.ok) return r.error.code === 'heavy_not_allowed';
      return r.quote.totalCents === r.quote.lineItems.reduce((s, l) => s + l.amountCents, 0) && r.quote.totalCents > 0;
    }));
  });

  it('more days never costs less', () => {
    fc.assert(fc.property(input, fc.integer({ min: 1, max: 10 }), (i, more) => {
      const a = calculateQuote(T, { ...i, days: Math.min(i.days, T.maxDays - more) });
      const b = calculateQuote(T, { ...i, days: Math.min(i.days, T.maxDays - more) + more });
      if (!a.ok || !b.ok) return true;
      return b.quote.totalCents >= a.quote.totalCents;
    }));
  });

  it('the rendered sentence never contains an amount the quote does not back', () => {
    fc.assert(fc.property(input, (i) => {
      const r = calculateQuote(T, i);
      if (!r.ok) return true;
      return unbackedAmounts(renderQuoteSentence(r.quote), [r.quote]).length === 0;
    }));
  });
});

describe('guardrails and helpers', () => {
  it('flags invented dollar amounts', () => {
    const q = ok(calculateQuote(T, { yards: 20, days: 10, zip: '30319', debris: 'construction' }));
    expect(unbackedAmounts('That comes to $720, and $95 per ton over.', [q])).toEqual([]);
    expect(unbackedAmounts('I can do it for $650 today.', [q])).toEqual(['$650']);
  });
  it('finds prohibited words as whole words', () => {
    expect(findProhibited(T, 'some old paint cans and a battery')).toEqual(['paint', 'battery']);
    expect(findProhibited(T, 'painting the kitchen')).toEqual([]);
  });
  it('formats money', () => {
    expect(formatMoney(72000)).toBe('$720');
    expect(formatMoney(123456)).toBe('$1,234.56');
    expect(formatMoney(0)).toBe('$0');
  });
  it('extension fee', () => {
    expect(extensionFee(T, 3)).toBe(4500);
    expect(() => extensionFee(T, -1)).toThrow();
  });
  it('the sample table is valid and a broken one is caught', () => {
    expect(validatePriceTable(T)).toEqual([]);
    const broken = { ...T, zones: [...T.zones, { id: 'z9', name: 'Zone 9', feeCents: 0, zips: ['30319'] }] };
    expect(validatePriceTable(broken)).toContain('ZIP 30319 is in both Zone 2 and Zone 9.');
  });
});
