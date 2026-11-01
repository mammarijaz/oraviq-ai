import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AI_MODES, CONVERSATION_STATES, type ContactDto, type ConversationDetailDto, type ConversationSummaryDto, type MessageDto, type UpdateConversationRequest } from '@oraviq/shared';
import { Prisma } from '@prisma/client';
import { OutboxService } from '../../jobs/outbox.service';
import { DbService } from '../../prisma/db.service';
import { AuditService } from '../audit/audit.service';
import { MessagingService } from '../messaging/messaging.service';
import { InboxQueries } from './inbox.queries';
import { toMessageDto } from './mappers';

/** Owner actions in the inbox. */
@Injectable()
export class InboxService {
  constructor(
    private readonly dbs: DbService,
    private readonly queries: InboxQueries,
    private readonly messaging: MessagingService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {}

  async detail(id: string): Promise<ConversationDetailDto> {
    const conv = await this.dbs.db.conversation.findUnique({ where: { id } });
    if (!conv) throw new NotFoundException('Conversation not found.');
    if (conv.unread) {
      await this.dbs.db.conversation.update({ where: { id }, data: { unread: false } });
    }
    return this.queries.conversationDetail(id);
  }

  async update(id: string, body: UpdateConversationRequest): Promise<ConversationSummaryDto> {
    const conv = await this.dbs.db.conversation.findUnique({ where: { id } });
    if (!conv) throw new NotFoundException('Conversation not found.');
    const data: Prisma.ConversationUpdateInput = {};
    if (body.aiMode !== undefined) {
      if (!AI_MODES.includes(body.aiMode)) throw new BadRequestException('aiMode must be auto, draft or off.');
      data.aiMode = body.aiMode;
    }
    if (body.state !== undefined) {
      if (!CONVERSATION_STATES.includes(body.state)) throw new BadRequestException('Unknown state.');
      data.state = body.state;
      if (body.state !== 'needs_you') data.handoffReason = null;
      if (body.state === 'closed') data.tag = 'Closed';
    }
    if (body.assignedUserId !== undefined) {
      if (body.assignedUserId) {
        const m = await this.dbs.db.membership.findFirst({ where: { userId: body.assignedUserId } });
        if (!m) throw new BadRequestException('That person is not on your team.');
      }
      data.assignedUserId = body.assignedUserId;
    }
    await this.dbs.tx(async (tx) => {
      await tx.conversation.update({ where: { id }, data });
      if (body.aiMode && body.aiMode !== conv.aiMode) {
        const text =
          body.aiMode === 'off'
            ? 'You took over. The assistant is paused in this conversation.'
            : body.aiMode === 'draft'
              ? 'The assistant will draft replies for you to approve.'
              : 'The assistant is back on in this conversation.';
        await this.messaging.addSystem(tx, conv, text);
      }
      await this.outbox.realtime(tx, this.dbs.tenantId, { event: 'conversation.updated', id });
      await this.audit.log('conversation.update', 'conversation', id, body as Record<string, unknown>, tx);
    });
    await this.outbox.kick();
    return this.queries.conversationSummary(id);
  }

  /** Owner reply on the conversation's channel (phone and booking-form conversations reply by SMS). */
  async reply(id: string, body: string, idempotencyKey?: string): Promise<MessageDto> {
    const key = idempotencyKey?.trim().slice(0, 120) || null;
    if (key) {
      const prior = await this.dbs.db.message.findFirst({ where: { idempotencyKey: key } });
      if (prior) {
        if (prior.conversationId !== id) throw new BadRequestException('That Idempotency-Key was used for another conversation.');
        return toMessageDto(prior);
      }
    }
    const text = String(body ?? '').trim();
    if (!text) throw new BadRequestException('Write a message first.');
    if (text.length > 1530) throw new BadRequestException('Keep texts under 1,530 characters.');
    const conv = await this.dbs.db.conversation.findUnique({ where: { id } });
    if (!conv) throw new NotFoundException('Conversation not found.');
    await this.messaging.assertCanText(conv);
    const msg = await this.dbs.tx(async (tx) => {
      // Sending replaces any pending assistant draft.
      await tx.message.deleteMany({ where: { conversationId: id, status: 'draft' } });
      const m = await this.messaging.addMessage(tx, conv, { author: 'owner', body: text, idempotencyKey: key });
      await tx.conversation.update({ where: { id }, data: { unread: false } });
      await this.audit.log('message.send', 'conversation', id, { messageId: m.id }, tx);
      return m;
    });
    await this.outbox.kick();
    const fresh = await this.dbs.db.message.findUniqueOrThrow({ where: { id: msg.id } });
    return toMessageDto(fresh);
  }

  async contacts(q?: string): Promise<{ items: ContactDto[] }> {
    const where: Prisma.ContactWhereInput = {};
    if (q?.trim()) {
      const term = q.trim();
      const digits = term.replace(/\D/g, '');
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { company: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
        ...(digits.length >= 3 ? [{ identities: { some: { addressNormalized: { contains: digits } } } }] : []),
      ];
    }
    const rows = await this.dbs.db.contact.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100, select: { id: true } });
    const map = await this.queries.contactDtos(rows.map((r) => r.id));
    return { items: rows.map((r) => map.get(r.id)!).filter(Boolean) };
  }
}
