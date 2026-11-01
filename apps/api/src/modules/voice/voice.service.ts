import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { formatMoney, renderQuoteSentence, type Quote } from '@oraviq/pricing';
import { CALL_DISCLOSURE_VERSION, type ConversationFacts, type ReceptionistSettingsDto, type TestCallTurnResponse } from '@oraviq/shared';
import { Prisma, type Call, type Conversation, type ReceptionistSettings } from '@prisma/client';
import { displayPhone, normalizePhone } from '../../common/phone';
import { clockLabel, fmtDuration, isAfterHours } from '../../common/time';
import { TenantContext } from '../../core/tenant-context';
import { env } from '../../config/env';
import { VOICE_AGENT_ADAPTER, type AiState, type VoiceAgentAdapter } from '../../integrations/types';
import { OutboxService } from '../../jobs/outbox.service';
import { DbService } from '../../prisma/db.service';
import type { TenantTx } from '../../prisma/tenant-prisma';
import { AssistantService, type TurnEvents } from '../ai/assistant.service';
import { AssistantBrain, voiceify } from '../ai/brain/brain';
import { parseHuman } from '../ai/brain/parse';
import { AuditService } from '../audit/audit.service';
import { ContactsService } from '../contacts/contacts.service';
import { InboundService } from '../inbox/inbound.service';
import { MessagingService } from '../messaging/messaging.service';
import { PricingService } from '../pricing/pricing.service';
import { QuotesService } from '../quotes/quotes.service';

export const TEST_CALLER = '+14045550199';

interface CallState extends AiState {
  transferred?: boolean;
  quoted?: boolean;
  ordered?: boolean;
}

/**
 * The AI receptionist. Real calls run on Retell (custom functions + webhooks);
 * the in-app "Try a call" runs the mock voice brain (the prototype's
 * sayAsCaller) through the same voice tools, and creates a Call + conversation
 * exactly like a real call.
 */
@Injectable()
export class VoiceService {
  private readonly logger = new Logger('Voice');
  private readonly brain = new AssistantBrain();

  constructor(
    private readonly dbs: DbService,
    private readonly ctx: TenantContext,
    private readonly pricing: PricingService,
    private readonly quotes: QuotesService,
    private readonly assistant: AssistantService,
    private readonly messaging: MessagingService,
    private readonly contacts: ContactsService,
    private readonly inbound: InboundService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
    @Inject(VOICE_AGENT_ADAPTER) private readonly voice: VoiceAgentAdapter,
  ) {}

  /* ------------------------------------------------------------------ settings */

  async settingsRow(): Promise<ReceptionistSettings> {
    const s = await this.dbs.db.receptionistSettings.findFirst();
    if (!s) throw new NotFoundException('Receptionist settings missing.');
    return s;
  }

  toDto(s: ReceptionistSettings): ReceptionistSettingsDto {
    return {
      enabled: s.enabled,
      mode: s.mode,
      greeting: s.greeting,
      voice: s.voice,
      transferWhenAsked: s.transferWhenAsked,
      transferWhenOutsideRules: s.transferWhenOutsideRules,
      transferNumber: s.transferNumber ? displayPhone(s.transferNumber) : null,
      spanish: s.spanish,
      voiceProvider: s.voiceProvider === 'retell' ? 'retell' : 'mock',
      agentId: s.agentId,
    };
  }

  async getSettings(): Promise<ReceptionistSettingsDto> {
    return this.toDto(await this.settingsRow());
  }

  async updateSettings(body: Partial<ReceptionistSettingsDto>): Promise<ReceptionistSettingsDto> {
    const s = await this.settingsRow();
    const data: Prisma.ReceptionistSettingsUpdateInput = {};
    if (body.enabled !== undefined) data.enabled = !!body.enabled;
    if (body.mode !== undefined) {
      if (!['missed', 'after_hours', 'all'].includes(body.mode)) throw new BadRequestException('Mode must be missed, after_hours or all.');
      data.mode = body.mode;
    }
    if (body.greeting !== undefined) {
      const g = String(body.greeting).trim();
      if (!g) throw new BadRequestException('Write a greeting.');
      if (!/automated/i.test(g) || !/record/i.test(g)) {
        throw new BadRequestException('Keep the automated-assistant and call-recording notice in the greeting. Some states require every caller to be told.');
      }
      data.greeting = g;
    }
    if (body.voice !== undefined) {
      if (!['warm', 'clear', 'calm'].includes(body.voice)) throw new BadRequestException('Voice must be warm, clear or calm.');
      data.voice = body.voice;
    }
    if (body.transferWhenAsked !== undefined) data.transferWhenAsked = !!body.transferWhenAsked;
    if (body.transferWhenOutsideRules !== undefined) data.transferWhenOutsideRules = !!body.transferWhenOutsideRules;
    if (body.transferNumber !== undefined) {
      if (body.transferNumber === null || body.transferNumber === '') data.transferNumber = null;
      else {
        const n = normalizePhone(body.transferNumber);
        if (!n) throw new BadRequestException('Enter a 10-digit phone number for transfers.');
        data.transferNumber = n;
      }
    }
    if (body.spanish !== undefined) data.spanish = !!body.spanish;
    let updated = await this.dbs.db.receptionistSettings.update({ where: { id: s.id }, data });
    // Keep the voice agent in sync (Retell agent + LLM, or the mock).
    const tenant = await this.dbs.system.tenant.findUniqueOrThrow({ where: { id: this.dbs.tenantId } });
    try {
      const { agentId } = await this.voice.syncAgent({
        tenantId: tenant.id,
        businessName: tenant.name,
        settings: this.toDto(updated),
        toolsBaseUrl: `${env().PUBLIC_API_URL}/api/v1/voice/tools`,
        webhookUrl: `${env().PUBLIC_API_URL}/api/v1/webhooks/retell`,
        numberE164: tenant.oraviqNumber,
      });
      if (agentId !== updated.agentId || updated.voiceProvider !== this.voice.provider) {
        updated = await this.dbs.db.receptionistSettings.update({ where: { id: s.id }, data: { agentId, voiceProvider: this.voice.provider } });
      }
    } catch (e) {
      this.logger.warn(`Voice agent sync failed: ${(e as Error).message}`);
    }
    await this.audit.log('receptionist.update', 'receptionist_settings', s.id, data as Record<string, unknown>);
    return this.toDto(updated);
  }

  async stats() {
    const since = new Date(Date.now() - 7 * 86400000);
    const calls = await this.dbs.db.call.findMany({ where: { startedAt: { gte: since }, status: 'ended', isTest: false } });
    const callIds = calls.map((c) => c.id);
    const convIds = calls.map((c) => c.conversationId).filter((x): x is string => !!x);
    const orders = await this.dbs.db.order.findMany({ where: { conversationId: { in: convIds }, status: { not: 'cancelled' }, createdAt: { gte: since } }, include: { quote: true } });
    return {
      callsThisWeek: callIds.length,
      afterHours: calls.filter((c) => c.afterHours).length,
      ordersBooked: orders.length,
      ordersValueCents: orders.reduce((s, o) => s + (o.quote?.totalCents ?? 0), 0),
      sentToYou: calls.filter((c) => c.outcome === 'sent_to_you').length,
    };
  }

  /* ------------------------------------------------------------------ call + conversation plumbing */

  private async startCall(
    tx: TenantTx,
    input: { provider: string; providerCallId: string | null; from: string; at: Date; isTest: boolean; simulated: boolean; agentId?: string | null; greeting: string },
  ): Promise<{ call: Call; conv: Conversation }> {
    const tenant = await this.dbs.system.tenant.findUniqueOrThrow({ where: { id: this.dbs.tenantId } });
    const e164 = normalizePhone(input.from) ?? input.from;
    const contact = await this.contacts.findOrCreate('phone', e164, {}, tx);
    await this.contacts.addIdentity(contact.id, 'phone', e164, tx);
    const conv = await tx.conversation.create({
      data: { tenantId: this.dbs.tenantId, contactId: contact.id, channel: 'phone', state: 'assistant', tag: 'On a call', origin: 'call', simulated: input.simulated, aiState: { introduced: true } },
    });
    const afterHours = isAfterHours(input.at, tenant.businessHours as any, tenant.timezone);
    const call = await tx.call.create({
      data: {
        tenantId: this.dbs.tenantId,
        conversationId: conv.id,
        contactId: contact.id,
        provider: input.provider,
        providerCallId: input.providerCallId,
        agentId: input.agentId ?? null,
        callerNumber: e164,
        callerName: contact.name,
        startedAt: input.at,
        afterHours,
        status: 'in_progress',
        transcript: [{ speaker: 'agent', text: input.greeting }],
        disclosureVersion: CALL_DISCLOSURE_VERSION,
        aiState: { introduced: true, stage: 'collect' },
        isTest: input.isTest,
      },
    });
    const t = clockLabel(input.at, tenant.timezone);
    await this.messaging.addSystem(tx, conv, `The AI receptionist answered at ${t}${afterHours ? ', after hours' : ''}.`, input.at);
    await this.messaging.addMessage(tx, conv, { author: 'assistant', body: input.greeting, mode: 'record', meta: `AI receptionist, ${t}`, createdAt: new Date(input.at.getTime() + 500) });
    await this.outbox.realtime(tx, this.dbs.tenantId, { event: 'call.updated', id: call.id });
    return { call, conv };
  }

  /** Finds the Call for a provider call id, creating it (and its conversation) if it isn't known yet. */
  private async callFor(providerCallId: string, from: string, provider = 'retell'): Promise<{ call: Call; conv: Conversation }> {
    const db = this.dbs.db;
    const existing = await db.call.findFirst({ where: { provider, providerCallId }, include: { conversation: true } });
    if (existing?.conversation) return { call: existing, conv: existing.conversation };
    const settings = await this.settingsRow();
    try {
      const r = await this.dbs.tx((tx) => this.startCall(tx, { provider, providerCallId, from, at: new Date(), isTest: false, simulated: false, greeting: settings.greeting, agentId: settings.agentId }));
      await this.outbox.kick();
      return r;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const again = await db.call.findFirst({ where: { provider, providerCallId }, include: { conversation: true } });
        if (again?.conversation) return { call: again, conv: again.conversation };
      }
      throw e;
    }
  }

  /** Texts the caller the conversation's latest quote (send_quote_sms). */
  private async textQuote(tx: TenantTx, conv: Conversation, quote: { sentence: string }, tenantName: string, callerNumber: string): Promise<boolean> {
    if (await this.contacts.isOptedOut(conv.contactId, 'sms', tx)) {
      await this.messaging.addSystem(tx, conv, 'Quote not texted: the caller opted out of texts.');
      return false;
    }
    await this.contacts.ensureInboundConsent(tx, conv.contactId, { source: 'verbal_on_call', callerNumber, note: 'Caller asked for or accepted the quote by text during the call.' });
    await this.messaging.addMessage(tx, conv, { author: 'assistant', body: `${tenantName}: ${quote.sentence} Reply to this text any time to book.`, channel: 'sms', aiGenerated: true });
    await this.messaging.addSystem(tx, conv, `Quote texted to ${displayPhone(callerNumber)}.`);
    return true;
  }

  /* ------------------------------------------------------------------ in-app test call */

  async testCallTurn(req: { callId?: string; text?: string; end?: boolean }): Promise<TestCallTurnResponse> {
    const settings = await this.settingsRow();
    if (!settings.enabled) throw new BadRequestException('Turn the receptionist on to try a call.');
    let callId = req.callId;
    const replies: string[] = [];
    if (!callId) {
      const { call } = await this.dbs.tx((tx) =>
        this.startCall(tx, { provider: 'mock', providerCallId: `test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, from: TEST_CALLER, at: new Date(), isTest: true, simulated: true, greeting: settings.greeting }),
      );
      await this.outbox.kick();
      callId = call.id;
      replies.push(settings.greeting);
    }
    const text = (req.text ?? '').trim();
    if (text) {
      const r = await this.sayAsCaller(callId, text, settings);
      replies.push(...r.replies);
      if (r.ended) return { callId, replies, ended: true, transferredTo: r.transferredTo, summary: r.summary };
    }
    if (req.end || /^(bye|goodbye|that'?s all|thanks,? bye|hang up)\b/i.test(text)) {
      if (text) {
        replies.push(`Thanks for calling. Have a good day.`);
      }
      const ended = await this.endCall(callId, settings);
      return { callId, replies, ended: true, transferredTo: ended.transferredTo, summary: ended.summary };
    }
    return { callId, replies, ended: false, transferredTo: null, summary: null };
  }

  /** Port of the prototype's sayAsCaller(): brain turn, voice phrasing, transfer rules, quote by text. */
  private async sayAsCaller(callId: string, text: string, settings: ReceptionistSettings): Promise<{ replies: string[]; ended: boolean; transferredTo: string | null; summary: string | null }> {
    const db = this.dbs.db;
    const call = await db.call.findUnique({ where: { id: callId }, include: { conversation: true } });
    if (!call || !call.conversation) throw new NotFoundException('Call not found.');
    if (call.status === 'ended') throw new BadRequestException('This call has ended. Start a new one.');
    const conv = call.conversation;
    const tenant = await this.dbs.system.tenant.findUniqueOrThrow({ where: { id: this.dbs.tenantId } });
    const table = await this.pricing.current();
    const customer = await this.assistant.customerContext(conv.contactId);
    const ev: TurnEvents = { quotes: [], handoffs: [], orders: [] };
    const tools = this.assistant.buildTools(conv, table, ev, 'voice');
    const state = (call.aiState ?? {}) as CallState;
    const res = await this.brain.turn({ businessName: tenant.name, table, customer }, (conv.facts ?? {}) as ConversationFacts, state, text, tools);

    let reply = voiceify(res.reply);
    const human = parseHuman(text);
    const transfer = res.events.includes('handoff') && !!settings.transferNumber && ((human && settings.transferWhenAsked) || (!human && settings.transferWhenOutsideRules));
    if (transfer) reply = 'Let me put you through to the owner now. One moment, please.';
    else if (res.events.includes('quote') && !res.events.includes('order')) {
      reply = reply.includes(' Want me to book it?') ? reply.replace(' Want me to book it?', " I'll also text you this quote. Want me to book it?") : `${reply} I'll also text you this quote.`;
    }
    const nextState: CallState = { ...res.state, transferred: transfer || state.transferred, quoted: state.quoted || res.events.includes('quote'), ordered: state.ordered || res.events.includes('order') };
    const now = new Date();
    const t = clockLabel(now, tenant.timezone);
    await this.dbs.tx(async (tx) => {
      const transcript = [...((call.transcript as any[]) ?? []), { speaker: 'caller', text }, { speaker: 'agent', text: reply }];
      await tx.call.update({ where: { id: call.id }, data: { transcript, aiState: nextState as Prisma.InputJsonValue, ...(transfer ? { transferredTo: settings.transferNumber } : {}) } });
      await this.messaging.addInbound(tx, conv, { body: text, provider: 'voice', meta: `Caller, ${t}`, createdAt: now });
      await this.messaging.addMessage(tx, conv, { author: 'assistant', body: reply, mode: 'record', meta: `AI receptionist, ${t}`, createdAt: new Date(now.getTime() + 1), quoteId: ev.quotes[ev.quotes.length - 1]?.id ?? null, aiGenerated: true });
      const lastQuote = ev.quotes[ev.quotes.length - 1];
      if (lastQuote && !transfer && !res.events.includes('order')) await this.textQuote(tx, conv, lastQuote, tenant.name, call.callerNumber);
      await this.assistant.applyEvents(tx, conv, ev, { facts: res.facts, aiState: { ...((conv.aiState ?? {}) as AiState), introduced: true }, customerName: customer.name, channelLabel: 'Phone call', voice: true });
      if (transfer) await this.messaging.addSystem(tx, conv, `Transferred to your cell, ${displayPhone(settings.transferNumber)}.`);
      await this.outbox.realtime(tx, this.dbs.tenantId, { event: 'call.updated', id: call.id });
    });
    await this.outbox.kick();
    if (transfer) {
      const ended = await this.endCall(call.id, settings);
      return { replies: [reply], ended: true, transferredTo: ended.transferredTo, summary: ended.summary };
    }
    return { replies: [reply], ended: false, transferredTo: null, summary: null };
  }

  /** Prototype callSummary(). */
  private summarize(call: Call, state: CallState, facts: ConversationFacts, quote: Quote | null, order: { address: string; deliveryDateLabel: string } | null, handoff: string | null, transferNumber: string | null): string {
    if (state.transferred) return `Transferred to your cell, ${displayPhone(transferNumber)}. Reason: ${handoff ? handoff.charAt(0).toLowerCase() + handoff.slice(1) : 'caller asked for a person'}.`;
    const parts: string[] = [];
    if (facts.yards || facts.zip) parts.push(`Caller asked about ${facts.yards ? `a ${facts.yards}-yard` : 'a dumpster'}${facts.zip ? ` in ${facts.zip}` : ''}.`);
    if (quote) parts.push(`Quoted ${formatMoney(quote.totalCents)} for ${quote.days} days${quote.includedTons != null ? `, ${quote.includedTons} tons included` : ''}. Quote texted to the caller.`);
    if (order) parts.push(`Order requested for ${order.address}, ${order.deliveryDateLabel}. Waiting for you to confirm.`);
    if (handoff && !order) parts.push(`Needs you: ${handoff}.`);
    return parts.join(' ') || 'Short call, no request taken.';
  }

  async endCall(callId: string, settings?: ReceptionistSettings): Promise<{ summary: string; transferredTo: string | null }> {
    const s = settings ?? (await this.settingsRow());
    const db = this.dbs.db;
    const call = await db.call.findUnique({ where: { id: callId }, include: { conversation: true } });
    if (!call) throw new NotFoundException('Call not found.');
    if (call.status === 'ended') return { summary: call.summary ?? '', transferredTo: call.transferredTo };
    const conv = call.conversation;
    const state = (call.aiState ?? {}) as CallState;
    const facts = (conv?.facts ?? {}) as ConversationFacts;
    const quoteRow = conv ? await db.quote.findFirst({ where: { conversationId: conv.id }, orderBy: { createdAt: 'desc' } }) : null;
    const order = conv ? await db.order.findFirst({ where: { conversationId: conv.id }, orderBy: { createdAt: 'desc' } }) : null;
    const handoff = state.handoff ?? conv?.handoffReason ?? null;
    const summary = this.summarize(call, state, facts, (quoteRow?.quote as unknown as Quote) ?? null, order, handoff, s.transferNumber);
    const outcome = state.transferred ? 'sent_to_you' : order ? 'order_requested' : quoteRow ? 'quote_given' : (call.transcript as any[]).length > 1 ? 'message_taken' : 'no_action';
    const now = new Date();
    const duration = Math.max(1, Math.round((now.getTime() - call.startedAt.getTime()) / 1000));
    await this.dbs.tx(async (tx) => {
      await tx.call.update({ where: { id: call.id }, data: { status: 'ended', endedAt: now, durationSeconds: duration, summary, outcome } });
      if (conv) {
        await this.messaging.addSystem(tx, conv, `Call ended after ${fmtDuration(duration)}. Summary: ${summary}`);
        const data: Prisma.ConversationUpdateInput = {};
        const fresh = await tx.conversation.findUnique({ where: { id: conv.id } });
        if (fresh?.tag === 'On a call') data.tag = quoteRow ? 'Quote given' : 'Call ended';
        if (state.transferred) Object.assign(data, { state: 'assistant', tag: 'Sent to you', handoffReason: null });
        if (Object.keys(data).length) await tx.conversation.update({ where: { id: conv.id }, data });
        await this.outbox.realtime(tx, this.dbs.tenantId, { event: 'conversation.updated', id: conv.id });
      }
      await this.outbox.realtime(tx, this.dbs.tenantId, { event: 'call.updated', id: call.id });
    });
    await this.outbox.kick();
    return { summary, transferredTo: state.transferred ? displayPhone(s.transferNumber) : null };
  }

  /* ------------------------------------------------------------------ Retell custom functions */

  /** Resolves the tenant for a Retell call (agent metadata, then the dialled number). */
  async tenantForRetellCall(call: { metadata?: Record<string, unknown> | null; to_number?: string | null; agent_id?: string | null }): Promise<string | null> {
    const meta = call.metadata?.tenantId;
    if (typeof meta === 'string') {
      const t = await this.dbs.system.tenant.findUnique({ where: { id: meta } });
      if (t) return t.id;
    }
    const to = normalizePhone(call.to_number ?? null);
    if (to) {
      const pn = await this.dbs.system.phoneNumber.findUnique({ where: { e164: to } });
      if (pn) return pn.tenantId;
      const t = await this.dbs.system.tenant.findFirst({ where: { OR: [{ oraviqNumber: to }, { phone: to }] } });
      if (t) return t.id;
    }
    if (call.agent_id) {
      const s = await this.dbs.system.receptionistSettings.findFirst({ where: { agentId: call.agent_id } });
      if (s) return s.tenantId;
    }
    return null;
  }

  /** POST /voice/tools/:tool — the same tools the in-app brain uses. Must answer fast (< 300 ms). */
  async runTool(tool: string, body: { call?: any; args?: Record<string, any>; name?: string }): Promise<Record<string, unknown>> {
    const call = body.call ?? {};
    const tenantId = await this.tenantForRetellCall(call);
    if (!tenantId) throw new NotFoundException('Unknown number or agent.');
    return this.ctx.run(tenantId, async () => {
      const args = body.args ?? {};
      const callId = String(call.call_id ?? '');
      const from = String(call.from_number ?? '');
      const table = await this.pricing.current();
      switch (tool) {
        case 'check_zip': {
          const a = this.pricing.serviceArea(table, String(args.zip ?? ''));
          return { served: a.served, zone: a.zoneName, say: a.served ? `Yes, we deliver to ${args.zip}.` : `${args.zip} is outside our usual delivery area. The owner will check and call you back.` };
        }
        case 'lookup_customer': {
          const contact = from ? await this.contacts.findByAddress('phone', from) : null;
          if (!contact) return { found: false };
          const c = await this.assistant.customerContext(contact.id);
          return { found: true, name: c.name, firstName: c.firstName, isRepeat: c.isRepeat, lastOrder: c.lastOrder };
        }
        case 'get_quote': {
          if (!callId) throw new BadRequestException('call.call_id is required.');
          const { conv } = await this.callFor(callId, from);
          const r = await this.quotes.createFromTable(table, { yards: Number(args.yards), days: args.days ? Number(args.days) : undefined, zip: String(args.zip ?? ''), debris: args.debris, items: args.items }, { conversationId: conv.id, contactId: conv.contactId });
          if (!r.ok) return { ok: false, error: r.error.message, suggestYards: r.error.suggestYards ?? null };
          await this.dbs.db.conversation.update({ where: { id: conv.id }, data: { facts: { ...((conv.facts ?? {}) as object), yards: r.quote.yards, days: r.quote.days, zip: r.quote.zip, debris: r.quote.debris } } });
          return { ok: true, sentence: r.sentence, totalCents: r.quote.totalCents, quoteId: r.quoteId };
        }
        case 'create_order_draft': {
          if (!callId) throw new BadRequestException('call.call_id is required.');
          const { conv } = await this.callFor(callId, from);
          const ev: TurnEvents = { quotes: [], handoffs: [], orders: [] };
          const tools = this.assistant.buildTools(conv, table, ev, 'voice');
          const o = await tools.createOrderDraft({ address: String(args.address ?? ''), date: String(args.date ?? ''), placement: args.placement ?? null, name: args.name ?? null });
          await this.dbs.tx((tx) => this.assistant.applyEvents(tx, conv, ev, { facts: { ...((conv.facts ?? {}) as ConversationFacts), address: String(args.address), date: String(args.date) }, aiState: { introduced: true }, customerName: null, channelLabel: 'Phone call', voice: true }));
          await this.outbox.kick();
          return { ok: true, orderNumber: o.orderNumber };
        }
        case 'send_quote_sms': {
          if (!callId) throw new BadRequestException('call.call_id is required.');
          const { call: c, conv } = await this.callFor(callId, from);
          const q = await this.dbs.db.quote.findFirst({ where: { conversationId: conv.id }, orderBy: { createdAt: 'desc' } });
          if (!q) return { ok: false, error: 'No quote yet.' };
          const tenant = await this.dbs.system.tenant.findUniqueOrThrow({ where: { id: tenantId } });
          const sent = await this.dbs.tx((tx) => this.textQuote(tx, conv, { sentence: renderQuoteSentence(q.quote as unknown as Quote) }, tenant.name, c.callerNumber));
          await this.outbox.kick();
          return { ok: sent };
        }
        default:
          throw new NotFoundException(`Unknown tool ${tool}.`);
      }
    });
  }

  /* ------------------------------------------------------------------ Retell webhooks (processed by the worker) */

  async processRetellEvent(payload: { event: string; call: any }): Promise<void> {
    const call = payload.call ?? {};
    const tenantId = await this.tenantForRetellCall(call);
    if (!tenantId) {
      this.logger.warn(`Retell ${payload.event}: no tenant for call ${call.call_id}`);
      return;
    }
    await this.ctx.run(tenantId, async () => {
      const from = String(call.from_number ?? 'unknown');
      const { call: row, conv } = await this.callFor(String(call.call_id), from);
      if (payload.event === 'call_started') return;
      const settings = await this.settingsRow();
      if (payload.event === 'call_ended') {
        const transcript = Array.isArray(call.transcript_object)
          ? call.transcript_object.map((t: any) => ({ speaker: t.role === 'agent' ? 'agent' : 'caller', text: String(t.content ?? '') }))
          : (row.transcript as any[]);
        const startedAt = call.start_timestamp ? new Date(Number(call.start_timestamp)) : row.startedAt;
        const endedAt = call.end_timestamp ? new Date(Number(call.end_timestamp)) : new Date();
        const duration = call.duration_ms ? Math.round(Number(call.duration_ms) / 1000) : Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000));
        const transferred = call.disconnection_reason === 'call_transfer';
        const order = await this.dbs.db.order.findFirst({ where: { conversationId: conv.id } });
        const quote = await this.dbs.db.quote.findFirst({ where: { conversationId: conv.id } });
        const outcome = transferred ? 'sent_to_you' : order ? 'order_requested' : quote ? 'quote_given' : transcript.length > 1 ? 'message_taken' : 'no_action';
        await this.dbs.tx(async (tx) => {
          await tx.call.update({
            where: { id: row.id },
            data: { status: 'ended', startedAt, endedAt, durationSeconds: duration, transcript, outcome, recordingKey: call.recording_url ? `retell:${call.call_id}` : null, transferredTo: transferred ? settings.transferNumber : null },
          });
          // Transcript lines into the conversation (recorded, never re-sent).
          let at = startedAt.getTime() + 1000;
          for (const line of transcript.slice(1)) {
            at += 1000;
            if (line.speaker === 'caller') await this.messaging.addInbound(tx, conv, { body: line.text, provider: 'voice', meta: 'Caller', createdAt: new Date(at) });
            else await this.messaging.addMessage(tx, conv, { author: 'assistant', body: line.text, mode: 'record', meta: 'AI receptionist', createdAt: new Date(at) });
          }
          if (transferred) await tx.conversation.update({ where: { id: conv.id }, data: { tag: 'Sent to you' } });
          await this.outbox.realtime(tx, this.dbs.tenantId, { event: 'call.updated', id: row.id });
        });
      }
      if (payload.event === 'call_analyzed') {
        const analysis = call.call_analysis ?? {};
        const summary: string | null = analysis.call_summary ?? null;
        await this.dbs.tx(async (tx) => {
          await tx.call.update({ where: { id: row.id }, data: { summary, analysis: analysis as Prisma.InputJsonValue } });
          if (summary) await this.messaging.addSystem(tx, conv, `Call ended after ${fmtDuration(row.durationSeconds || Math.round(Number(call.duration_ms ?? 0) / 1000))}. Summary: ${summary}`);
          const fresh = await tx.conversation.findUnique({ where: { id: conv.id } });
          if (fresh?.tag === 'On a call') await tx.conversation.update({ where: { id: conv.id }, data: { tag: (await tx.quote.count({ where: { conversationId: conv.id } })) ? 'Quote given' : 'Call ended' } });
          await this.outbox.realtime(tx, this.dbs.tenantId, { event: 'call.updated', id: row.id });
          await this.outbox.realtime(tx, this.dbs.tenantId, { event: 'conversation.updated', id: conv.id });
        });
      }
      await this.outbox.kick();
    });
  }

  /** POST /setup/test-call */
  missedCallTextback(tenantId: string, from: string): Promise<{ conversationId: string }> {
    return this.inbound.missedCall(tenantId, { from });
  }
}
