import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import OvQuoteCard from '../src/components/OvQuoteCard.vue';
import type { QuoteLike } from '../src';

// Shaped exactly like calculateQuote(SAMPLE_PRICE_TABLE, { yards: 20, days: 10, zip: '30319', debris: 'construction' }).quote
const quote = {
  yards: 20,
  days: 10,
  zip: '30319',
  zoneId: 'z2',
  zoneName: 'Zone 2',
  debris: 'construction',
  heavyFlat: false,
  lineItems: [
    { code: 'base', label: 'Base, 7 days included', amountCents: 62500 },
    { code: 'extra_days', label: '3 extra days at $15', amountCents: 4500, quantity: 3, unitCents: 1500 },
    { code: 'delivery', label: 'Delivery, Zone 2', amountCents: 5000 },
  ],
  totalCents: 72000,
  includedTons: 3,
  overagePerTonCents: 9500,
  includedDays: 7,
  priceTableVersion: 1,
};
const asQuoteLike: QuoteLike = quote; // a real engine Quote is assignable to the prop type

describe('OvQuoteCard', () => {
  it('renders the title, the total first and every line with the weight terms', () => {
    const w = mount(OvQuoteCard, { props: { quote: asQuoteLike } });
    expect(w.get('.ov-quote__title').text()).toBe('20-yard roll-off, 10 days');
    expect(w.get('.ov-quote__total').text()).toBe('Total $720');
    const lines = w.findAll('.ov-quote__lines li').map((li) => li.findAll('span').map((s) => s.text()));
    expect(lines).toEqual([
      ['Base, 7 days included', '$625'],
      ['3 extra days at $15', '$45'],
      ['Delivery, Zone 2', '$50'],
      ['Weight included', '3 tons'],
      ['Over the included weight', '$95 per ton'],
    ]);
    expect(w.find('.ov-quote__note').exists()).toBe(false);
    expect(w.attributes('aria-label')).toBe('Quote: 20-yard roll-off, 10 days, $720 delivered');
  });

  it('handles a flat clean-fill quote, a free delivery zone and a note', () => {
    const w = mount(OvQuoteCard, {
      props: {
        quote: {
          yards: 10,
          days: 7,
          totalCents: 52500,
          heavyFlat: true,
          includedTons: null,
          overagePerTonCents: null,
          lineItems: [
            { code: 'heavy_flat', label: 'Clean fill (concrete, dirt), flat price', amountCents: 52500 },
            { code: 'delivery', label: 'Delivery, Zone 1', amountCents: 0 },
          ],
        },
        note: 'Street placement may need a city permit.',
      },
    });
    expect(w.get('.ov-quote__total').text()).toBe('Total $525');
    const values = w.findAll('.ov-quote__lines li span:last-child').map((s) => s.text());
    expect(values).toEqual(['$525', 'Included', 'No weight charge']);
    expect(w.get('.ov-quote__note').text()).toBe('Street placement may need a city permit.');
  });
});
