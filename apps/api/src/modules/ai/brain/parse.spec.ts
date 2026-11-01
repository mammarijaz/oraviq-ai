import { SAMPLE_PRICE_TABLE } from '@oraviq/pricing';
import { complianceKeyword, parse, parseHuman, recommendSize } from './parse';

const P = (t: string) => parse(t, SAMPLE_PRICE_TABLE.prohibited);

describe('parse() — the prototype example phrases', () => {
  it.each([
    ['Kitchen remodel, need a 20 yard in 30319 for like 10 days', { size: 20, zip: '30319', days: 10, debris: 'construction' }],
    ["How much for a 10 yard this weekend? Cleaning out my mom's garage in 30307", { size: 10, days: 3, zip: '30307', debris: 'household' }],
    ['do you take roofing shingles? need a 30 for a reroof in 30318 next tuesday, 7 days', { size: 30, zip: '30318', days: 7, debris: 'construction', date: 'Tuesday' }],
    ['Yeah hi, I need a dumpster for a roof tear-off, probably a 20, in 30344.', { size: 20, zip: '30344', debris: 'construction' }],
    ['Need a 15 yard for a garage clean out in 30062, 5 days', { size: 15, zip: '30062', days: 5, debris: 'household' }],
    ['Can I put broken concrete from my patio in a 20 yard?', { size: 20, debris: 'heavy' }],
    ['twenty yard please', { size: 20 }],
    ['about two weeks', { days: 14 }],
    ['a month', { days: 30 }],
    ['30318', { zip: '30318' }],
  ])('%s', (text, expected) => {
    expect(P(text)).toMatchObject(expected);
  });

  it('reads addresses, days and placement', () => {
    expect(P('2215 Briarwood Rd, Thursday morning please. Driveway is fine')).toMatchObject({ address: '2215 Briarwood Rd', date: 'Thursday', placement: 'driveway' });
    expect(P('118 Peach Ave, Friday')).toMatchObject({ address: '118 Peach Ave', date: 'Friday' });
    expect(P('Put it on the street')).toMatchObject({ placement: 'street' });
    expect(P('tomorrow works').date).toBe('tomorrow');
    expect(P('deliver 11/14').date).toBe('11/14');
  });

  it('does not mistake a size for a house number', () => {
    const p = P('Same as last time, 30 yd to the Elm St job. Monday');
    expect(p.address).toBeUndefined();
    expect(p).toMatchObject({ size: 30, sameAsLast: true, date: 'Monday' });
  });

  it('finds items with fees and prohibited items', () => {
    expect(P('two mattresses and 4 tires').items).toEqual({ mattress: 2, tire: 4 });
    expect(P('an old fridge').items).toEqual({ appliance: 1 });
    expect(P('Can I throw out paint?').prohibited).toBe('paint');
    expect(P('some motor oil').prohibited).toBe('motor oil');
    expect(P('a painting crew').prohibited).toBeUndefined();
  });

  it('reads intent: yes, a person, size help, names, extensions, pickups', () => {
    expect(P('Yes').yes).toBe(true);
    expect(P('Can I talk to a person?').human).toBe(true);
    expect(P('Not sure what size, kitchen remodel')).toMatchObject({ sizeHelp: true, debris: 'construction' });
    expect(P("Hi, I'm Jasmine").name).toBe('Jasmine');
    expect(P('Hey can we keep the dumpster 3 more days? Not done yet').extension).toBe(3);
    expect(P('Can you pick up my dumpster Monday instead?')).toMatchObject({ pickup: true, date: 'Monday' });
    expect(parseHuman('Can I talk to someone?')).toBe(true);
  });

  it('recommends sizes like the prototype', () => {
    expect(recommendSize('heavy', '')).toBe(10);
    expect(recommendSize('construction', 'kitchen remodel')).toBe(20);
    expect(recommendSize('construction', 'roof tear-off')).toBe(20);
    expect(recommendSize('household', 'whole house estate cleanout')).toBe(30);
    expect(recommendSize('household', 'garage')).toBe(15);
  });

  it('detects STOP/HELP/START keywords on the whole message only', () => {
    for (const w of ['STOP', 'stop', 'Unsubscribe', 'CANCEL', 'end', 'QUIT', 'STOPALL']) expect(complianceKeyword(w)).toBe('stop');
    expect(complianceKeyword('HELP')).toBe('help');
    expect(complianceKeyword('START')).toBe('start');
    expect(complianceKeyword('please stop by tomorrow')).toBeNull();
    expect(complianceKeyword('cancel my order')).toBeNull();
  });
});
