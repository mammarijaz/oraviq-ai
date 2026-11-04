import { Inject, Injectable, Logger } from '@nestjs/common';
import { formatMoney, unbackedAmounts, type PriceTable, type Quote } from '@oraviq/pricing';
import { CHANNEL_LABELS, type ConversationFacts, type DebrisType } from '@oraviq/shared';
import { Prisma, type Conversation, type Message } from '@prisma/client';
import { displayPhone } from '../../common/phone';
import { LLM_PROVIDER, type AiState, type AssistantTools, type CustomerContext, type LlmProvider } from '../../integrations/types';
import { OutboxService } from '../../jobs/outbox.service';
import { DbService } from '../../prisma/db.service';
import type { TenantTx } from '../../prisma/tenant-prisma';
import { safeFirstName } from '../inbox/mappers';
import { MessagingService } from '../messaging/messaging.service';
import { NotificationsService } from '../notifications/notifications.service';
import { OrdersService } from '../orders/orders.service';
import { PricingService } from '../pricing/pricing.service';
import { QuotesService } from '../quotes/quotes.service';

export interface TurnEvents {
  quotes: Array<{ id: string; quote: Quote; sentence: string }>;
  handoffs: string[];
  orders: Array<{ id: string; number: string }>;
}

export const AUTOMATED_RE = /automated assistant/i;

/**
 * unbackedAmounts() only sees "$123". Rewrite the other ways a model can state money
 * ("500 dollars", "USD 500", fullwidth "＄500") into that form before checking, and
 * report spelled-out amounts ("five hundred dollars"), which can't be checked at all.
 */
export function moneyGuardText(reply: string): { text: string; spelledOut: boolean } {
  const text = reply
    .replace(/[＄﹩]/g, '$')
    .replace(/\b(?:USD|US\$)\s?(\d[\d,]*(?:\.\d{1,2})?)/gi, '$$$1')
    .replace(/(\d[\d,]*(?:\.\d{1,2})?)\s?(?:dollars?|bucks|usd)\b/gi, '$$$1');
  return { text, spelledOut: /\b(?:dollars?|bucks)\b/i.test(text) };
}

/** "Concrete or dirt in a 20-yard" → "concrete or dirt in a 20-yard" (keeps "ZIP …"). */
export function lowerFirst(s: string): string {
  return /^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

/**
 * The assistant orchestrator: one loop for SMS, web chat, Messenger, Instagram
 * and booking follow-ups. The LlmProvider gathers facts and calls tools; this
 * service owns the tools, the guardrails and every side effect:
 *  - prices only via QuotesService (@oraviq/pricing), sentence rendered by code;
 *  - any $ amount not backed by a quote blocks the send and hands off;
 *  - the first reply always says it's an automated assistant;
 *  - aiMode: auto sends, draft stores a draft, off does nothing.
 */
@Injectable()
export class AssistantService {
  private readonly logger = new Logger('Assistant');

  constructor(
    private readonly dbs: DbService,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    private readonly pricing: PricingService,
    private readonly quotes: QuotesService,
    private readonly orders: OrdersService,
    private readonly messaging: MessagingService,
    private readonly notifications: NotificationsService,
    private readonly outbox: OutboxService,
  ) {}

  async customerContext(contactId: string): Promise<CustomerContext> {
    const db = this.dbs.db;
    const contact = await db.contact.findUnique({ where: { id: contactId } });
    const completed = await db.order.count({ where: { contactId, status: { in: ['picked_up', 'closed'] } } });
    const last = await db.order.findFirst({ where: { contactId, status: { not: 'cancelled' } }, orderBy: { createdAt: 'desc' }, include: { quote: true } });
    const name = contact?.name ?? null;
    const first = safeFirstName(name);
    return {
      name,
      firstName: first || null,
      isRepeat: completed > 0,
      lastOrder: last
        ? {
            yards: last.quote?.yards ?? null,
            days: last.quote?.days ?? null,
            zip: last.quote?.zip ?? last.zip ?? null,
            debris: (last.quote?.debris as DebrisType | undefined) ?? null,
            address: last.address,
            placement: last.placement,
          }
        : null,
    };
  }

  /** Builds the tools for one turn. Side effects are recorded in `ev`. */
  buildTools(conv: Conversation, table: PriceTable, ev: TurnEvents, source: 'assistant' | 'voice' = 'assistant'): AssistantTools {
    return {
      getQuote: async (input) => {
        const r = await this.quotes.createFromTable(table, input, { conversationId: conv.id, contactId: conv.contactId });
        if (r.ok) ev.quotes.push({ id: r.quoteId, quote: r.quote, sentence: r.sentence });
        return r.ok ? { ok: true, quoteId: r.quoteId, quote: r.quote, sentence: r.sentence } : r;
      },
      checkServiceArea: async (zip) => this.pricing.serviceArea(table, zip),
      createOrderDraft: async (input) => {
        // One order per turn, and none while this conversation already has an open order.
        if (ev.orders.length) throw new Error('An order was already created in this turn.');
        const open = await this.dbs.db.order.findFirst({ where: { conversationId: conv.id, status: { notIn: ['closed', 'cancelled', 'picked_up'] } } });
        if (open) throw new Error(`Order ${open.number} is already open for this customer; the owner will handle changes.`);
        const quoteId =
          ev.quotes[ev.quotes.length - 1]?.id ?? (await this.dbs.db.quote.findFirst({ where: { conversationId: conv.id }, orderBy: { createdAt: 'desc' } }))?.id;
        if (!quoteId) throw new Error('Quote the job before booking it.');
        const order = await this.dbs.tx((tx) => this.orders.createFromAssistant(tx, { conversation: conv, quoteId, address: input.address, date: input.date, placement: input.placement, name: input.name, source }));
        ev.orders.push({ id: order.id, number: order.number });
        return { orderNumber: order.number };
      },
      handoffToHuman: async (reason) => {
        ev.handoffs.push(reason);
      },
    };
  }

  /**
   * Runs one assistant turn for an inbound customer message and applies the
   * result. Returns the assistant messages it created (sent or drafted).
   */
  async respond(conversationId: string, text: string): Promise<Message[]> {
    const db = this.dbs.db;
    const conv = await db.conversation.findUnique({ where: { id: conversationId } });
    if (!conv || conv.aiMode === 'off') return [];
    const tenant = await this.dbs.system.tenant.findUniqueOrThrow({ where: { id: this.dbs.tenantId } });
    const table = await this.pricing.current();
    const history = await db.message.findMany({ where: { conversationId, status: { not: 'draft' } }, orderBy: { createdAt: 'desc' }, take: 20 });
    const customer = await this.customerContext(conv.contactId);
    const aiState = (conv.aiState ?? {}) as AiState;
    const introducedBefore = !!aiState.introduced || history.some((m) => m.author === 'assistant' && AUTOMATED_RE.test(m.body));
    const ev: TurnEvents = { quotes: [], handoffs: [], orders: [] };
    const tools = this.buildTools(conv, table, ev);

    let reply = '';
    let facts = (conv.facts ?? {}) as ConversationFacts;
    let nextState: AiState = { ...aiState, introduced: introducedBefore };
    let traceId: string | null = null;
    try {
      const out = await this.llm.runAssistantTurn(
        {
          businessName: tenant.name,
          businessPhone: tenant.phone ? displayPhone(tenant.phone) : null,
          channel: conv.channel,
          mode: 'text',
          text,
          history: history.reverse().map((m) => ({ author: m.author, body: m.body })),
          facts,
          aiState: nextState,
          customer,
          priceTable: table,
        },
        tools,
      );
      reply = out.reply.trim();
      facts = out.facts;
      nextState = out.aiState;
      traceId = out.traceId;
    } catch (e) {
      this.logger.error(`Assistant turn failed: ${(e as Error).stack ?? e}`);
      ev.handoffs.push('The assistant had a problem replying');
      reply = "Thanks for your message. I've asked the owner to get back to you shortly.";
    }

    // Guardrail 1: the code-rendered quote sentence must be present when a quote was made this turn.
    const latest = ev.quotes[ev.quotes.length - 1];
    if (latest && !reply.includes(latest.sentence) && !ev.orders.length && !ev.handoffs.length) {
      reply = `${latest.sentence} ${reply}`.trim();
    }

    // Guardrail 2: every $ amount must be backed by a quote from @oraviq/pricing.
    const earlier = await db.quote.findMany({ where: { conversationId }, orderBy: { createdAt: 'desc' }, take: 10 });
    const backing = [...ev.quotes.map((q) => q.quote), ...earlier.map((q) => q.quote as unknown as Quote)];
    const guard = moneyGuardText(reply);
    const bad = unbackedAmounts(guard.text, backing);
    if (guard.spelledOut) bad.push('an amount in words');
    let blocked: string | null = null;
    if (bad.length) {
      blocked = reply;
      ev.handoffs.push(`Blocked a reply with a price that isn't from your price list (${bad.join(', ')})`);
      reply = "Let me get the owner to confirm that for you. They'll text you shortly.";
      this.logger.warn(`Blocked unbacked amounts ${bad.join(', ')} in conversation ${conversationId}`);
    }

    // Guardrail 3: the first reply says it's an automated assistant.
    if (reply && !introducedBefore && !AUTOMATED_RE.test(reply)) {
      reply = `Hi, this is ${tenant.name}'s automated assistant. ${reply}`;
    }
    if (reply) nextState.introduced = true;

    const created = await this.dbs.tx(async (tx) => {
      const out: Message[] = [];
      if (facts.name) {
        const c = await tx.contact.findUnique({ where: { id: conv.contactId } });
        if (c && !c.name) await tx.contact.update({ where: { id: c.id }, data: { name: facts.name } });
      }
      if (blocked) {
        await this.messaging.addSystem(tx, conv, `Blocked an assistant reply because it named a price that isn't from your price list. Draft was: "${blocked.slice(0, 300)}"`);
      }
      if (reply) {
        const msg = await this.messaging.addMessage(tx, conv, {
          author: 'assistant',
          body: reply,
          mode: conv.aiMode === 'draft' ? 'draft' : 'send',
          aiGenerated: true,
          aiTraceId: traceId,
          quoteId: latest?.id ?? null,
        });
        out.push(msg);
      }
      await this.applyEvents(tx, conv, ev, { facts, aiState: nextState, customerName: customer.name, channelLabel: CHANNEL_LABELS[conv.channel] });
      return out;
    });
    await this.outbox.kick();
    return created;
  }

  /** Conversation state, tag, handoff system message and owner alerts for one turn's events. */
  async applyEvents(
    tx: TenantTx,
    conv: Conversation,
    ev: TurnEvents,
    opts: { facts: ConversationFacts; aiState: AiState; customerName: string | null; channelLabel: string; voice?: boolean },
  ): Promise<void> {
    const data: Prisma.ConversationUpdateInput = { facts: opts.facts as Prisma.InputJsonValue, aiState: opts.aiState as Prisma.InputJsonValue };
    const who = opts.customerName ?? 'a customer';
    if (ev.quotes.length && conv.state !== 'needs_you' && !opts.voice) data.tag = 'Quote sent';
    if (ev.handoffs.length) {
      const reason = ev.handoffs[ev.handoffs.length - 1];
      data.state = 'needs_you';
      data.tag = 'Needs you';
      data.handoffReason = reason;
      await this.messaging.addSystem(tx, conv, `Handed to the owner: ${lowerFirst(reason)}.`);
      await this.notifications.notifyOwner(tx, { title: 'Needs you', body: `Needs you: ${reason}. ${who === 'a customer' ? '' : `(${who}) `}Reply from your inbox.`, href: `/inbox/${conv.id}`, sms: true });
    }
    if (ev.orders.length) {
      const o = ev.orders[ev.orders.length - 1];
      const order = await tx.order.findUnique({ where: { id: o.id }, include: { quote: true } });
      data.state = 'needs_you';
      data.tag = 'Order to confirm';
      if (!ev.handoffs.length) data.handoffReason = null;
      if (order) {
        await this.notifications.notifyOwner(tx, {
          title: 'New order',
          body: `New order: ${order.quote ? `${order.quote.yards}-yard` : 'dumpster'} to ${order.address}, ${order.deliveryDateLabel || order.deliveryDate}, ${order.quote ? formatMoney(order.quote.totalCents) : 'price needed'}. Tap to confirm.`,
          href: `/orders/${order.id}`,
          sms: true,
        });
      }
    } else if (ev.quotes.length && !ev.handoffs.length) {
      const q = ev.quotes[ev.quotes.length - 1].quote;
      await this.outbox.realtime(tx, this.dbs.tenantId, {
        event: 'notification',
        data: { title: 'Quote sent', body: `Quote sent by ${opts.channelLabel.toLowerCase()}: ${q.yards}-yard, ${q.days} days, ${formatMoney(q.totalCents)} to ${who}.`, href: `/inbox/${conv.id}` },
      });
    }
    await tx.conversation.update({ where: { id: conv.id }, data });
    await this.outbox.realtime(tx, this.dbs.tenantId, { event: 'conversation.updated', id: conv.id });
  }
}
