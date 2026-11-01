import { Injectable, Logger } from '@nestjs/common';
import { CHANNEL_LABELS, type Channel } from '@oraviq/shared';
import type { Conversation, Message } from '@prisma/client';
import { displayPhone, normalizePhone } from '../../common/phone';
import { clockLabel } from '../../common/time';
import { TenantContext } from '../../core/tenant-context';
import type { InboundMessageEvent } from '../../integrations/types';
import { OutboxService } from '../../jobs/outbox.service';
import { DbService } from '../../prisma/db.service';
import type { TenantTx } from '../../prisma/tenant-prisma';
import { AssistantService } from '../ai/assistant.service';
import { complianceKeyword } from '../ai/brain/parse';
import { ContactsService } from '../contacts/contacts.service';
import { MessagingService } from '../messaging/messaging.service';
import { NotificationsService } from '../notifications/notifications.service';

const SMS_FAMILY: Channel[] = ['sms', 'phone', 'booking_form'];

export interface InboundResult {
  conversationId: string;
  replies: Message[];
  duplicate?: boolean;
}

/**
 * The inbound pipeline, shared by provider webhooks and the simulator:
 * dedupe → contact + conversation → store → consent / STOP / HELP → assistant.
 */
@Injectable()
export class InboundService {
  private readonly logger = new Logger('Inbound');

  constructor(
    private readonly dbs: DbService,
    private readonly ctx: TenantContext,
    private readonly contacts: ContactsService,
    private readonly messaging: MessagingService,
    private readonly assistant: AssistantService,
    private readonly notifications: NotificationsService,
    private readonly outbox: OutboxService,
  ) {}

  private async tenant() {
    return this.dbs.system.tenant.findUniqueOrThrow({ where: { id: this.dbs.tenantId } });
  }

  /** Finds the open conversation for this contact and channel, or starts one. */
  async conversationFor(
    tx: TenantTx,
    contactId: string,
    channel: Channel,
    opts: { simulated?: boolean; origin?: string; externalThreadId?: string | null; tag?: string | null; forceNew?: boolean },
  ): Promise<Conversation> {
    if (!opts.forceNew) {
      const existing = await tx.conversation.findFirst({
        where: {
          contactId,
          channel: SMS_FAMILY.includes(channel) && channel !== 'phone' ? { in: SMS_FAMILY } : channel,
          state: { not: 'closed' },
          simulated: !!opts.simulated,
        },
        orderBy: { lastMessageAt: 'desc' },
      });
      if (existing) {
        if (opts.externalThreadId && !existing.externalThreadId) return tx.conversation.update({ where: { id: existing.id }, data: { externalThreadId: opts.externalThreadId } });
        return existing;
      }
    }
    return tx.conversation.create({
      data: {
        tenantId: this.dbs.tenantId,
        contactId,
        channel,
        state: 'assistant',
        tag: opts.tag === undefined ? 'Quoting' : opts.tag,
        origin: opts.origin ?? 'inbound_message',
        simulated: !!opts.simulated,
        externalThreadId: opts.externalThreadId ?? null,
      },
    });
  }

  /** Runs the pipeline for a tenant (call inside or outside a tenant context). */
  handle(tenantId: string, evt: InboundMessageEvent): Promise<InboundResult> {
    return this.ctx.run(tenantId, () => this.handleInContext(evt));
  }

  private async handleInContext(evt: InboundMessageEvent): Promise<InboundResult> {
    const db = this.dbs.db;
    if (evt.providerMessageId) {
      const dup = await db.message.findFirst({ where: { provider: evt.provider, providerMessageId: evt.providerMessageId } });
      if (dup) return { conversationId: dup.conversationId, replies: [], duplicate: true };
    }
    const tenant = await this.tenant();
    const body = String(evt.body ?? '').trim();
    const isPhone = SMS_FAMILY.includes(evt.channel);
    const from = isPhone ? normalizePhone(evt.from) ?? evt.from : evt.from;
    const keyword = isPhone ? complianceKeyword(body) : null;

    const { conv, msg } = await this.dbs.tx(async (tx) => {
      const contact = await this.contacts.findOrCreate(evt.channel, from, { name: evt.fromName ?? null, displayAddress: isPhone ? null : evt.fromName ?? `${CHANNEL_LABELS[evt.channel]} visitor` }, tx);
      const conv = await this.conversationFor(tx, contact.id, evt.channel, { simulated: evt.simulated, externalThreadId: evt.externalThreadId, origin: evt.channel === 'web_chat' ? 'web_chat' : 'inbound_message' });
      const msg = await this.messaging.addInbound(tx, conv, { body, provider: evt.provider, providerMessageId: evt.providerMessageId, createdAt: evt.receivedAt });
      if (isPhone && !keyword) {
        await this.contacts.ensureInboundConsent(tx, contact.id, { messageId: msg.id, from, excerpt: body.slice(0, 160), receivedAt: (evt.receivedAt ?? new Date()).toISOString() });
      }
      return { conv, msg };
    });

    if (keyword) return this.handleKeyword(keyword, conv, msg, tenant, from);

    if (isPhone && (await this.contacts.isOptedOut(conv.contactId))) {
      await this.dbs.tx(async (tx) => {
        await tx.conversation.update({ where: { id: conv.id }, data: { state: 'needs_you', tag: 'Needs you', handoffReason: 'Customer opted out of texts (replied STOP). Call them to reply.' } });
        await this.outbox.realtime(tx, this.dbs.tenantId, { event: 'conversation.updated', id: conv.id });
      });
      await this.outbox.kick();
      return { conversationId: conv.id, replies: [] };
    }

    await this.outbox.kick();
    const replies = await this.assistant.respond(conv.id, body);
    const fresh = replies.length ? await db.message.findMany({ where: { id: { in: replies.map((r) => r.id) } }, orderBy: { createdAt: 'asc' } }) : [];
    return { conversationId: conv.id, replies: fresh };
  }

  private async handleKeyword(keyword: 'stop' | 'help' | 'start', conv: Conversation, msg: Message, tenant: { name: string; phone: string | null }, from: string): Promise<InboundResult> {
    const replies: Message[] = [];
    await this.dbs.tx(async (tx) => {
      if (keyword === 'stop') {
        const first = await this.contacts.revokeSms(tx, conv.contactId, { messageId: msg.id, keyword: msg.body, from, receivedAt: msg.createdAt.toISOString() });
        if (first) {
          replies.push(
            await this.messaging.addMessage(tx, conv, {
              author: 'assistant',
              body: `You're unsubscribed from ${tenant.name} texts and won't get more messages. Reply START to resubscribe.`,
              compliance: true,
            }),
          );
        }
        await this.messaging.addSystem(tx, conv, 'The customer replied STOP. Texts to them are blocked.');
        await tx.conversation.update({ where: { id: conv.id }, data: { aiMode: 'off', tag: 'Opted out' } });
      } else if (keyword === 'help') {
        replies.push(
          await this.messaging.addMessage(tx, conv, {
            author: 'assistant',
            body: `${tenant.name}: dumpster rentals.${tenant.phone ? ` Call ${displayPhone(tenant.phone)} for help.` : ''} Msg & data rates may apply. Reply STOP to opt out.`,
            compliance: true,
          }),
        );
      } else {
        await this.contacts.grant(tx, { contactId: conv.contactId, source: 'inbound_message', evidence: { messageId: msg.id, keyword: msg.body, from } });
        replies.push(await this.messaging.addMessage(tx, conv, { author: 'assistant', body: `You're resubscribed to ${tenant.name} texts. Reply STOP to opt out.`, compliance: true }));
        await tx.conversation.update({ where: { id: conv.id }, data: { aiMode: 'auto', tag: null } });
      }
      await this.outbox.realtime(tx, this.dbs.tenantId, { event: 'conversation.updated', id: conv.id });
    });
    await this.outbox.kick();
    const fresh = replies.length ? await this.dbs.db.message.findMany({ where: { id: { in: replies.map((r) => r.id) } } }) : [];
    return { conversationId: conv.id, replies: fresh };
  }

  /** Missed call → the assistant texts back (same conversation as later texts). */
  missedCall(tenantId: string, input: { from: string; at?: Date; simulated?: boolean }): Promise<{ conversationId: string }> {
    return this.ctx.run(tenantId, async () => {
      const tenant = await this.tenant();
      const at = input.at ?? new Date();
      const e164 = normalizePhone(input.from) ?? input.from;
      const conv = await this.dbs.tx(async (tx) => {
        const contact = await this.contacts.findOrCreate('sms', e164, {}, tx);
        const conv = await this.conversationFor(tx, contact.id, 'sms', { simulated: input.simulated, origin: 'missed_call', tag: 'Quoting' });
        const optedOut = await this.contacts.isOptedOut(contact.id, 'sms', tx);
        await this.messaging.addSystem(tx, conv, `Missed call from ${displayPhone(e164)}, ${clockLabel(at, tenant.timezone)}.${optedOut ? ' Not texted back: the caller opted out of texts.' : ' The assistant texted back.'}`, at);
        if (!optedOut) {
          await this.messaging.addMessage(tx, conv, {
            author: 'assistant',
            body: `Sorry we missed your call. This is ${tenant.name}'s automated assistant. What size dumpster do you need, and where?`,
            aiGenerated: true,
            createdAt: new Date(at.getTime() + 1000),
          });
          const state = { ...((conv.aiState ?? {}) as object), introduced: true };
          await tx.conversation.update({ where: { id: conv.id }, data: { aiState: state, unread: true } });
        }
        await this.notifications.notifyOwner(tx, { title: 'Missed call', body: `Missed call from ${displayPhone(e164)}.${optedOut ? '' : ' The assistant texted back.'}`, href: `/inbox/${conv.id}`, sms: false });
        return conv;
      });
      await this.outbox.kick();
      return { conversationId: conv.id };
    });
  }
}
