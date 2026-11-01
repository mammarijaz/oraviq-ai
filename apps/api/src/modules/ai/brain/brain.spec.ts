import { calculateQuote, findZone, renderQuoteSentence, SAMPLE_PRICE_TABLE } from '@oraviq/pricing';
import type { ConversationFacts } from '@oraviq/shared';
import type { AiState, AssistantTools, CustomerContext } from '../../../integrations/types';
import { AssistantBrain, voiceify } from './brain';

const table = SAMPLE_PRICE_TABLE;
const newCustomer: CustomerContext = { name: null, firstName: null, isRepeat: false, lastOrder: null };

function harness(customer: CustomerContext = newCustomer) {
  const brain = new AssistantBrain();
  const log = { quotes: 0, orders: [] as unknown[], handoffs: [] as string[] };
  const tools: AssistantTools = {
    getQuote: async (input) => {
      const r = calculateQuote(table, input);
      if (!r.ok) return r;
      log.quotes++;
      return { ok: true, quoteId: `q${log.quotes}`, quote: r.quote, sentence: renderQuoteSentence(r.quote) };
    },
    checkServiceArea: async (zip) => ({ served: !!findZone(table, zip), zoneName: findZone(table, zip)?.name ?? null }),
    createOrderDraft: async (input) => {
      log.orders.push(input);
      return { orderNumber: 'RO-1' };
    },
    handoffToHuman: async (reason) => {
      log.handoffs.push(reason);
    },
  };
  let facts: ConversationFacts = {};
  let state: AiState = {};
  const say = async (text: string) => {
    const r = await brain.turn({ businessName: 'Demo Roll-Off Co.', table, customer }, facts, state, text, tools);
    facts = r.facts;
    state = r.state;
    return r;
  };
  return { say, log, get facts() { return facts; }, get state() { return state; } };
}

describe('AssistantBrain (prototype assistantTurn)', () => {
  it('runs the prototype conversation: size help → size → zip → days → debris → quote → booking', async () => {
    const h = harness();
    expect((await h.say('I need a dumpster')).reply).toBe("Hi, this is Demo Roll-Off Co.'s automated assistant. Happy to help. What size dumpster do you need (10, 15, 20, 30 or 40-yard), and what are you throwing away?");
    expect((await h.say('Not sure what size, kitchen remodel')).reply).toBe('For that job most customers pick a 20-yard. Want a price on a 20-yard? Just reply "20 yard". Other sizes: 10, 15, 30 and 40-yard.');
    expect((await h.say('20 yard')).reply).toBe("Great, a 20-yard. What's the ZIP code for delivery?");
    expect((await h.say('30318')).reply).toBe('How many days do you need it? Rentals include 7 days.');
    const q = await h.say('10 days');
    expect(q.events).toEqual(['quote']);
    expect(q.reply).toBe('A 20-yard for 10 days is $670 delivered. It includes 3 tons, then $95 per ton over. Want me to book it? Send the delivery address and the day you need it.');
    expect((await h.say('yes')).reply).toBe('Thanks. I still need the delivery address and the delivery day.');
    const b = await h.say('118 Peach Ave, Friday');
    expect(b.events).toEqual(['order']);
    expect(b.reply).toBe("Got it: 20-yard to 118 Peach Ave, delivery Friday, $670. I've sent this to the owner to confirm the drop-off time; you'll get a text with a deposit link to lock it in.");
    expect((await h.say('thanks!')).reply).toBe("Your request is with the owner. They'll text you to confirm the delivery time.");
    const change = await h.say('actually make it a 30 yard');
    expect(change.events).toEqual(['handoff']);
    expect(h.log.handoffs).toEqual(['Customer changed a requested order']);
  });

  it('quotes everything in one message and asks for debris when missing', async () => {
    const h = harness();
    const r = await h.say('20 yard in 30319 for 10 days');
    expect(r.reply).toBe("Hi, this is Demo Roll-Off Co.'s automated assistant. What will go in it: household junk, construction debris, or concrete and dirt?");
    expect((await h.say('construction debris')).reply).toContain('A 20-yard for 10 days is $720 delivered.');
  });

  it('includes item fees and notes them', async () => {
    const h = harness();
    const r = await h.say('15 yard garage cleanout in 30303 for a week with 2 mattresses');
    expect(r.reply).toContain('$545 delivered'); // 495 + 2 × 25
    expect(r.reply).toContain('That includes the fees for the items you mentioned.');
  });

  it('re-quotes and books in one go when address and day are known', async () => {
    const h = harness();
    await h.say('20 yard in 30319 for 10 days, construction');
    await h.say('2215 Briarwood Rd, Thursday');
    expect(h.log.orders).toHaveLength(1);
  });

  it('hands off: prohibited item, a person, out of zone, heavy in a big size, too many days, three misses', async () => {
    let h = harness();
    expect((await h.say('Can I throw out paint?')).reply).toBe("Hi, this is Demo Roll-Off Co.'s automated assistant. Paint can't go in our dumpsters. I've asked the owner to call you about safe disposal options.");
    expect(h.log.handoffs).toEqual(['Asked about paint']);

    h = harness();
    expect((await h.say('Can I talk to a person?')).reply).toContain("I've let the owner know");

    h = harness();
    const z = await h.say('20 yard in 99999');
    expect(z.reply).toContain("99999 is outside our usual delivery area. I've asked the owner to check if we can reach you; they'll text you shortly.");
    expect(h.log.handoffs).toEqual(['ZIP 99999 is outside the service zones']);

    h = harness();
    const c = await h.say('Can I put broken concrete from my patio in a 20 yard?');
    expect(c.reply).toBe("Hi, this is Demo Roll-Off Co.'s automated assistant. Concrete and dirt are heavy, so we only take them in 10 or 15-yard dumpsters at a flat price. I've also asked the owner to check your job.");
    expect(h.log.handoffs).toEqual(['Concrete or dirt in a 20-yard']);

    h = harness();
    await h.say('20 yard in 30319, construction, 90 days');
    expect(h.log.handoffs[0]).toMatch(/^Could not price this job: Rentals longer than 60 days/);

    h = harness();
    await h.say('hello');
    await h.say('hmm');
    const m = await h.say('???');
    expect(m.events).toEqual(['handoff']);
  });

  it('greets known and repeat customers by name and reuses the last order', async () => {
    const h = harness({ name: 'Marcus Bell', firstName: 'Marcus', isRepeat: true, lastOrder: { yards: 30, days: 7, zip: '30318', debris: 'construction', address: '418 Elm St', placement: 'street' } });
    const r = await h.say('Same as last time, 30 yd to the Elm St job. Monday');
    expect(r.reply.startsWith("Welcome back, Marcus. This is Demo Roll-Off Co.'s automated assistant. A 30-yard for 7 days is $795 delivered.")).toBe(true);
    expect(r.reply).toContain('Want me to book it for Monday at 418 Elm St?');
    const y = await h.say('Yes');
    expect(y.events).toEqual(['order']);
    expect(y.reply).toContain('Street placement may need a city permit');
  });

  it('never names a price it did not get from getQuote', async () => {
    const h = harness();
    const replies: string[] = [];
    for (const t of ['I need a dumpster', '20 yard', '30319', '10 days', 'remodel', '2215 Briarwood Rd, Thursday']) replies.push((await h.say(t)).reply);
    const amounts = replies.join(' ').match(/\$\d[\d,]*/g) ?? [];
    expect(new Set(amounts)).toEqual(new Set(['$720', '$95']));
  });

  it('voiceify() rewrites text phrasing for calls', () => {
    expect(voiceify('Want me to book it? Send the delivery address and the day you need it.')).toBe("Want me to book it? What's the delivery address, and what day do you need it?");
    expect(voiceify('Just reply "20 yard".')).toBe('Just say 20-yard.');
  });
});
