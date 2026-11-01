/**
 * The rule-based assistant, ported from the approved prototype's assistantTurn().
 * It is the MockLlmProvider for text channels and the mock voice brain for calls.
 *
 * Differences from the prototype, all on purpose:
 *  - Prices come only from tools.getQuote (→ @oraviq/pricing); the quote sentence
 *    is the code-rendered renderQuoteSentence(). No dollar figure is computed here.
 *  - Size lists, the heavy-load rule and included days are read from the tenant's price table.
 *  - Repeat customers ("same as last time") get their last order's details.
 *  - Three turns with nothing understood hand off to the owner ("unknown").
 *  - Extension and pickup requests hand off (no unbacked fee is quoted).
 */
import { activeSizes, findSize, formatMoney, type PriceTable } from '@oraviq/pricing';
import type { ConversationFacts, Placement } from '@oraviq/shared';
import type { AiState, AssistantTools, CustomerContext } from '../../../integrations/types';
import { isEmptyParse, parse, recommendSize } from './parse';

export type BrainEvent = 'quote' | 'handoff' | 'order';

export interface BrainContext {
  businessName: string;
  table: PriceTable;
  customer: CustomerContext;
}

export interface BrainResult {
  reply: string;
  events: BrainEvent[];
  facts: ConversationFacts;
  state: AiState;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function listWords(items: Array<string | number>, conj: 'and' | 'or'): string {
  const a = items.map(String);
  if (a.length <= 1) return a.join('');
  return `${a.slice(0, -1).join(', ')} ${conj} ${a[a.length - 1]}`;
}

export class AssistantBrain {
  async turn(ctx: BrainContext, factsIn: ConversationFacts, stateIn: AiState, text: string, tools: AssistantTools): Promise<BrainResult> {
    const facts: ConversationFacts = { ...factsIn, items: factsIn.items ? { ...factsIn.items } : undefined };
    const state: AiState = { stage: 'collect', misses: 0, lastText: '', ...stateIn };
    const events: BrainEvent[] = [];
    const reply = await this.step(ctx, facts, state, text, tools, events);
    return { reply, events, facts, state };
  }

  private async handoff(state: AiState, tools: AssistantTools, events: BrainEvent[], reason: string) {
    state.handoff = reason;
    events.push('handoff');
    await tools.handoffToHuman(reason);
  }

  private intro(ctx: BrainContext, state: AiState): string {
    if (state.introduced) return '';
    state.introduced = true;
    const first = ctx.customer.firstName;
    if (ctx.customer.isRepeat && first) return `Welcome back, ${first}. This is ${ctx.businessName}'s automated assistant. `;
    if (first) return `Hi ${first}, this is ${ctx.businessName}'s automated assistant. `;
    return `Hi, this is ${ctx.businessName}'s automated assistant. `;
  }

  private async step(ctx: BrainContext, s: ConversationFacts, state: AiState, text: string, tools: AssistantTools, ev: BrainEvent[]): Promise<string> {
    const table = ctx.table;
    const p = parse(text, table.prohibited);
    state.lastText = `${state.lastText ?? ''} ${text}`.slice(-2000);

    // Repeat customer: "same as last time" fills what they didn't say from their last order.
    if (p.sameAsLast && ctx.customer.lastOrder) {
      const lo = ctx.customer.lastOrder;
      if (p.size === undefined && lo.yards) p.size = lo.yards;
      if (p.days === undefined && lo.days) p.days = lo.days;
      if (p.zip === undefined && lo.zip) p.zip = lo.zip;
      if (p.debris === undefined && lo.debris) p.debris = lo.debris;
      if (p.address === undefined && lo.address) p.address = lo.address;
      if (p.placement === undefined) p.placement = lo.placement;
    }

    if (p.size !== undefined) s.yards = p.size;
    if (p.days !== undefined) s.days = p.days;
    if (p.zip !== undefined) s.zip = p.zip;
    if (p.debris !== undefined) s.debris = p.debris;
    if (p.address !== undefined) s.address = p.address;
    if (p.date !== undefined) s.date = p.date;
    if (p.placement !== undefined) s.placement = p.placement;
    if (p.name !== undefined) s.name = p.name;
    if (p.items) s.items = { ...(s.items ?? {}), ...p.items };

    const intro = this.intro(ctx, state);
    state.misses = isEmptyParse(p) && text.trim() !== '' ? (state.misses ?? 0) + 1 : 0;

    if (p.prohibited) {
      await this.handoff(state, tools, ev, `Asked about ${p.prohibited}`);
      return intro + `${cap(p.prohibited)} can't go in our dumpsters. I've asked the owner to call you about safe disposal options.`;
    }
    if (p.human) {
      await this.handoff(state, tools, ev, 'Customer asked for a person');
      return intro + "Sure, I've let the owner know. They'll call or text you shortly.";
    }
    if (p.extension && !p.size && !p.zip) {
      const n = typeof p.extension === 'number' ? p.extension : null;
      await this.handoff(state, tools, ev, n ? `Customer asked to keep the dumpster ${n} more day${n === 1 ? '' : 's'}` : 'Customer asked to extend the rental');
      return intro + `No problem. I've asked the owner to extend your rental${n ? ` by ${n} day${n === 1 ? '' : 's'}` : ''}. They'll text you to confirm the new pickup day and any extra-day fee.`;
    }
    if (p.pickup && state.stage !== 'booking' && !p.size) {
      await this.handoff(state, tools, ev, `Customer asked for a pickup${p.date ? ` on ${p.date}` : ''}`);
      return intro + `Got it. I've asked dispatch to schedule your pickup${p.date ? ` for ${p.date}` : ''}. You'll get a text to confirm.`;
    }

    if (state.stage === 'booking' && (p.size || p.days || p.zip || p.debris || p.items)) state.stage = 'collect';

    if (state.stage === 'booking' || state.stage === 'booked') {
      if (state.stage === 'booked') {
        if (p.size || p.days || p.zip || p.debris || p.items || p.address || p.date) {
          await this.handoff(state, tools, ev, 'Customer changed a requested order');
          return intro + "Got it. I've passed the change to the owner, who will confirm the new details and price.";
        }
        return intro + "Your request is with the owner. They'll text you to confirm the delivery time.";
      }
      const need: string[] = [];
      if (!s.address) need.push('the delivery address');
      if (!s.date) need.push('the delivery day');
      if (need.length) return intro + `Thanks. I still need ${need.join(' and ')}.`;
      const order = await tools.createOrderDraft({ address: s.address!, date: s.date!, placement: (s.placement as Placement) ?? null, name: s.name ?? ctx.customer.name ?? null });
      state.stage = 'booked';
      state.orderNumber = order.orderNumber;
      ev.push('order');
      let r = `Got it: ${state.quoteYards}-yard to ${s.address}, delivery ${s.date}, ${formatMoney(state.quoteTotalCents ?? 0)}. I've sent this to the owner to confirm the drop-off time; you'll get a text with a deposit link to lock it in.`;
      if (s.placement === 'street') r += ' Street placement may need a city permit; the owner will check.';
      return intro + r;
    }

    // collecting
    const sizes = activeSizes(table);
    const sizeList = sizes.map((x) => x.yards);
    const heavySizes = sizes.filter((x) => x.heavyAllowed && x.heavyFlatCents != null).map((x) => x.yards);
    const rule = s.yards ? findSize(table, s.yards) : null;

    if (s.debris === 'heavy' && s.yards && rule && !rule.heavyAllowed) {
      await this.handoff(state, tools, ev, `Concrete or dirt in a ${s.yards}-yard`);
      let r = `Concrete and dirt are heavy, so we only take them in ${listWords(heavySizes, 'or')}-yard dumpsters at a flat price.`;
      if (s.zip && heavySizes.length) {
        const q = await tools.getQuote({ yards: heavySizes[0], days: s.days ?? table.includedDays, zip: s.zip, debris: 'heavy' });
        if (q.ok) r += ` A ${q.quote.yards}-yard clean-fill is ${formatMoney(q.quote.totalCents)} delivered.`;
      }
      return intro + r + " I've also asked the owner to check your job.";
    }

    if (!s.yards) {
      if (p.sizeHelp || s.debris) {
        let r = recommendSize(s.debris ?? null, state.lastText ?? '');
        if (!sizeList.includes(r)) r = sizeList.reduce((best, y) => (Math.abs(y - r) < Math.abs(best - r) ? y : best), sizeList[0]);
        const others = sizeList.filter((y) => y !== r);
        return intro + `For that job most customers pick a ${r}-yard. Want a price on a ${r}-yard? Just reply "${r} yard". Other sizes: ${listWords(others, 'and')}-yard.`;
      }
      if ((state.misses ?? 0) >= 3) {
        await this.handoff(state, tools, ev, "The assistant couldn't work out what the customer needs");
        return intro + "I'm not sure I understood. I've asked the owner to text you back shortly.";
      }
      return intro + `Happy to help. What size dumpster do you need (${listWords(sizeList, 'or')}-yard), and what are you throwing away?`;
    }
    if (!rule || rule.active === false) {
      return intro + `We rent ${listWords(sizeList, 'and')}-yard dumpsters. Which one would you like?`;
    }
    if (!s.zip) return intro + `Great, a ${s.yards}-yard. What's the ZIP code for delivery?`;
    const area = await tools.checkServiceArea(s.zip);
    if (!area.served) {
      await this.handoff(state, tools, ev, `ZIP ${s.zip} is outside the service zones`);
      return intro + `${s.zip} is outside our usual delivery area. I've asked the owner to check if we can reach you; they'll text you shortly.`;
    }
    if (!s.days) return intro + `How many days do you need it? Rentals include ${table.includedDays} days.`;
    if (!s.debris) return intro + 'What will go in it: household junk, construction debris, or concrete and dirt?';

    const q = await tools.getQuote({ yards: s.yards, days: s.days, zip: s.zip, debris: s.debris, items: s.items });
    if (!q.ok) {
      await this.handoff(state, tools, ev, `Could not price this job: ${q.error.message}`);
      return intro + "Let me get the owner to price this one. They'll text you shortly.";
    }
    const requote = !!state.quoteId;
    state.quoteId = q.quoteId;
    state.quoteTotalCents = q.quote.totalCents;
    state.quoteYards = q.quote.yards;
    state.quoteDays = q.quote.days;
    state.stage = 'booking';
    ev.push('quote');
    if (requote && s.address && s.date) {
      const r2 = await this.step(ctx, s, state, '', tools, ev);
      return intro + r2;
    }
    const extras = s.items && Object.values(s.items).some((n) => n > 0) ? ' That includes the fees for the items you mentioned.' : '';
    const weightNote = /roof|shingle/.test((state.lastText ?? '').toLowerCase()) && s.debris !== 'heavy' ? " Shingles are heavy, so I'll note the weight on your order." : '';
    const ask = s.address && s.date ? ` Want me to book it for ${s.date} at ${s.address}?` : ' Want me to book it? Send the delivery address and the day you need it.';
    return intro + q.sentence + extras + weightNote + ask;
  }
}

/* ------------------------------------------------------------------ voice */

/** Prototype voiceify(): turns text-channel phrasing into something a caller can act on. */
export function voiceify(t: string): string {
  return t
    .replace('Send the delivery address and the day you need it.', "What's the delivery address, and what day do you need it?")
    .replace(/Just reply "(\d+) yard"\./, 'Just say $1-yard.')
    .replace(/(\d+) is outside our usual delivery area\. I've asked the owner to check if we can reach you; they'll text you shortly\./, '$1 is outside our usual delivery area. The owner will check and call you back.');
}
