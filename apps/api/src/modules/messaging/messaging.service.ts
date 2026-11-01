import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Channel, MessageAuthor } from '@oraviq/shared';
import type { Conversation, Message } from '@prisma/client';
import { ConflictActionException } from '../../common/errors';
import { ChannelRouter, deliveryChannel } from '../../integrations/channel-router';
import { OutboxService } from '../../jobs/outbox.service';
import { DbService } from '../../prisma/db.service';
import type { TenantTx } from '../../prisma/tenant-prisma';
import { ContactsService } from '../contacts/contacts.service';
import { contactPhone, preview } from '../inbox/mappers';

export interface OutboundInput {
  author: MessageAuthor;
  body: string;
  /** queued = send through the channel; draft = store for the owner; record = already happened (call transcript). */
  mode?: 'send' | 'draft' | 'record';
  aiGenerated?: boolean;
  aiTraceId?: string | null;
  quoteId?: string | null;
  meta?: string | null;
  /** STOP/HELP confirmations may go to opted-out numbers. */
  compliance?: boolean;
  /** Overrides the channel the message is recorded on (defaults to the conversation's). */
  channel?: Channel;
  createdAt?: Date;
  /** Client-supplied key (owner sends) so retries never double-send. */
  idempotencyKey?: string | null;
}

/**
 * Writes messages and their side effects. Outbound messages are rows + an
 * outbox entry, written in the caller's transaction; the outbox dispatcher
 * sends them through the channel router after commit (Idempotency-Key = message id).
 */
@Injectable()
export class MessagingService implements OnModuleInit {
  private readonly logger = new Logger('Messaging');

  constructor(
    private readonly dbs: DbService,
    private readonly outbox: OutboxService,
    private readonly router: ChannelRouter,
    private readonly contacts: ContactsService,
  ) {}

  onModuleInit(): void {
    this.outbox.registerDispatcher('message.send', (p) => this.deliver(String(p.messageId), !!p.compliance));
    this.outbox.registerDispatcher('message.send:failed', async (p) => {
      await this.dbs.db.message.update({ where: { id: String(p.messageId) }, data: { status: 'failed', error: 'Could not deliver after several tries.' } });
    });
  }

  /** Throws a clear 409 when the customer has opted out of texts and this would go by SMS. */
  async assertCanText(conv: Pick<Conversation, 'contactId' | 'channel'>, tx: TenantTx = this.dbs.db): Promise<void> {
    if (deliveryChannel(conv.channel) !== 'sms') return;
    if (await this.contacts.isOptedOut(conv.contactId, 'sms', tx)) {
      throw new ConflictActionException('This customer replied STOP, so texts to them are blocked. Call them instead.', { reason: 'opted_out' });
    }
  }

  async addMessage(tx: TenantTx, conv: Conversation, input: OutboundInput): Promise<Message> {
    const tenantId = this.dbs.tenantId;
    const mode = input.mode ?? 'send';
    const now = input.createdAt ?? new Date();
    const internal = input.author === 'system';
    const msg = await tx.message.create({
      data: {
        tenantId,
        conversationId: conv.id,
        direction: internal ? 'internal' : 'outbound',
        author: input.author,
        channel: input.channel ?? conv.channel,
        body: input.body,
        status: internal || mode === 'record' ? 'sent' : mode === 'draft' ? 'draft' : 'queued',
        provider: mode === 'record' ? 'voice' : null,
        aiGenerated: !!input.aiGenerated,
        aiTraceId: input.aiTraceId ?? null,
        quoteId: input.quoteId ?? null,
        meta: input.meta ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        createdAt: now,
      },
    });
    if (mode !== 'draft') {
      await tx.conversation.update({ where: { id: conv.id }, data: { lastMessageAt: now, lastMessagePreview: preview(input.body) } });
    }
    if (!internal && mode === 'send') await this.outbox.add(tx, tenantId, 'message.send', { messageId: msg.id, compliance: !!input.compliance });
    await this.outbox.realtime(tx, tenantId, { event: 'message.created', id: msg.id });
    await this.outbox.realtime(tx, tenantId, { event: 'conversation.updated', id: conv.id });
    return msg;
  }

  async addSystem(tx: TenantTx, conv: Conversation, body: string, createdAt?: Date): Promise<Message> {
    return this.addMessage(tx, conv, { author: 'system', body, createdAt });
  }

  /** Records an inbound customer message (already deduped by the caller). */
  async addInbound(tx: TenantTx, conv: Conversation, input: { body: string; provider: string; providerMessageId?: string | null; meta?: string | null; createdAt?: Date; channel?: Channel }): Promise<Message> {
    const tenantId = this.dbs.tenantId;
    const at = input.createdAt ?? new Date();
    const msg = await tx.message.create({
      data: {
        tenantId,
        conversationId: conv.id,
        direction: 'inbound',
        author: 'customer',
        channel: input.channel ?? conv.channel,
        body: input.body,
        status: 'received',
        provider: input.provider,
        providerMessageId: input.providerMessageId ?? null,
        meta: input.meta ?? null,
        createdAt: at,
      },
    });
    await tx.conversation.update({ where: { id: conv.id }, data: { lastMessageAt: at, lastMessagePreview: preview(input.body), unread: true } });
    await this.outbox.realtime(tx, tenantId, { event: 'message.created', id: msg.id });
    await this.outbox.realtime(tx, tenantId, { event: 'conversation.updated', id: conv.id });
    return msg;
  }

  /** Outbox dispatcher: sends one queued message through the routed provider. */
  private async deliver(messageId: string, compliance: boolean): Promise<void> {
    const db = this.dbs.db;
    const msg = await db.message.findUnique({ where: { id: messageId }, include: { conversation: { include: { contact: { include: { identities: true } } } } } });
    if (!msg || msg.status !== 'queued') return;
    const conv = msg.conversation;
    const route = await this.router.resolve(conv.channel, { simulated: conv.simulated });
    let to: string | null = null;
    if (route.channel === 'sms' || route.channel === 'whatsapp') to = contactPhone(conv.contact);
    else if (route.channel === 'web_chat') to = conv.externalThreadId;
    else to = conv.contact.identities.find((i) => i.channel === route.channel)?.addressNormalized ?? null;
    if (!to) {
      await db.message.update({ where: { id: msg.id }, data: { status: 'failed', error: 'No address to send to on this channel.' } });
      return;
    }
    if (route.channel === 'sms' && !compliance && (await this.contacts.isOptedOut(conv.contactId))) {
      await db.message.update({ where: { id: msg.id }, data: { status: 'failed', error: 'Customer opted out (STOP).' } });
      return;
    }
    const res = await route.adapter.send({
      tenantId: this.dbs.tenantId,
      channel: route.channel,
      from: route.from,
      to,
      body: msg.body,
      idempotencyKey: msg.id,
      externalThreadId: conv.externalThreadId && !conv.externalThreadId.startsWith('mock_') ? conv.externalThreadId : null,
      accountId: route.accountId,
    });
    await db.message.update({ where: { id: msg.id }, data: { status: 'sent', sentAt: new Date(), provider: res.provider, providerMessageId: res.providerMessageId } });
    if (res.externalThreadId && !conv.externalThreadId && route.channel !== 'web_chat') {
      await db.conversation.update({ where: { id: conv.id }, data: { externalThreadId: res.externalThreadId } });
    }
  }
}
