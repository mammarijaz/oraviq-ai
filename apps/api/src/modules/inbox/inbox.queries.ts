import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  CallDto,
  CallOutcome,
  Channel,
  ContactDto,
  ConversationDetailDto,
  ConversationFacts,
  ConversationState,
  ConversationSummaryDto,
  MessageDto,
  OrderDto,
  OrderStatus,
} from '@oraviq/shared';
import { Prisma } from '@prisma/client';
import { DbService } from '../../prisma/db.service';
import { contactPhone, ContactStats, toCallDto, toCallSummary, toContactDto, toConversationSummary, toMessageDto, toOrderDto, toQuoteDto } from './mappers';

const COMPLETED: OrderStatus[] = ['picked_up', 'closed'];

/** Read side of the inbox, orders and calls: loads rows (tenant-scoped) and maps them to DTOs. */
@Injectable()
export class InboxQueries {
  constructor(private readonly dbs: DbService) {}

  private get db() {
    return this.dbs.db;
  }

  async contactStats(contactIds: string[]): Promise<Map<string, ContactStats>> {
    const map = new Map<string, ContactStats>();
    if (!contactIds.length) return map;
    const rows = await this.db.order.groupBy({ by: ['contactId', 'status'], where: { contactId: { in: contactIds }, status: { not: 'cancelled' } }, _count: { _all: true } });
    for (const r of rows) {
      const s = map.get(r.contactId) ?? { orderCount: 0, completedCount: 0 };
      s.orderCount += r._count._all;
      if (COMPLETED.includes(r.status)) s.completedCount += r._count._all;
      map.set(r.contactId, s);
    }
    return map;
  }

  async contactDtos(contactIds: string[]): Promise<Map<string, ContactDto>> {
    const ids = [...new Set(contactIds)];
    const [contacts, stats] = await Promise.all([this.db.contact.findMany({ where: { id: { in: ids } }, include: { identities: true } }), this.contactStats(ids)]);
    return new Map(contacts.map((c) => [c.id, toContactDto(c, stats.get(c.id))]));
  }

  async contactDto(contactId: string): Promise<ContactDto> {
    const m = await this.contactDtos([contactId]);
    const c = m.get(contactId);
    if (!c) throw new NotFoundException('Contact not found.');
    return c;
  }

  /* ------------------------------------------------------------------ conversations */

  async listConversations(q: { state?: string[]; channel?: string[]; q?: string; cursor?: string; limit?: number }): Promise<{ items: ConversationSummaryDto[]; nextCursor: string | null }> {
    const limit = Math.min(Math.max(q.limit ?? 30, 1), 100);
    const where: Prisma.ConversationWhereInput = {};
    if (q.state?.length) where.state = { in: q.state as ConversationState[] };
    if (q.channel?.length) where.channel = { in: q.channel as Channel[] };
    if (q.q?.trim()) {
      const term = q.q.trim();
      const digits = term.replace(/\D/g, '');
      where.OR = [
        { contact: { name: { contains: term, mode: 'insensitive' } } },
        { contact: { company: { contains: term, mode: 'insensitive' } } },
        { messages: { some: { body: { contains: term, mode: 'insensitive' } } } },
        { lastMessagePreview: { contains: term, mode: 'insensitive' } },
        ...(digits.length >= 3 ? [{ contact: { identities: { some: { addressNormalized: { contains: digits } } } } }] : []),
        { contact: { identities: { some: { displayAddress: { contains: term, mode: 'insensitive' as const } } } } },
      ];
    }
    if (q.cursor) {
      const [at, id] = Buffer.from(q.cursor, 'base64url').toString().split('|');
      const d = new Date(at);
      if (id && !Number.isNaN(d.getTime())) {
        where.AND = [{ OR: [{ lastMessageAt: { lt: d } }, { lastMessageAt: d, id: { lt: id } }] }];
      }
    }
    const rows = await this.db.conversation.findMany({ where, orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }], take: limit + 1 });
    const page = rows.slice(0, limit);
    const contacts = await this.contactDtos(page.map((r) => r.contactId));
    const last = page[page.length - 1];
    return {
      items: page.map((r) => toConversationSummary(r, contacts.get(r.contactId)!)),
      nextCursor: rows.length > limit && last ? Buffer.from(`${last.lastMessageAt.toISOString()}|${last.id}`).toString('base64url') : null,
    };
  }

  async conversationSummary(id: string): Promise<ConversationSummaryDto> {
    const conv = await this.db.conversation.findUnique({ where: { id } });
    if (!conv) throw new NotFoundException('Conversation not found.');
    return toConversationSummary(conv, await this.contactDto(conv.contactId));
  }

  async conversationDetail(id: string): Promise<ConversationDetailDto> {
    const conv = await this.db.conversation.findUnique({ where: { id } });
    if (!conv) throw new NotFoundException('Conversation not found.');
    const [contact, messages, quote, order, calls] = await Promise.all([
      this.contactDto(conv.contactId),
      this.db.message.findMany({ where: { conversationId: id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
      this.db.quote.findFirst({ where: { conversationId: id }, orderBy: { createdAt: 'desc' } }),
      this.db.order.findFirst({ where: { conversationId: id }, orderBy: { createdAt: 'desc' }, include: { quote: true } }),
      this.db.call.findMany({ where: { conversationId: id }, orderBy: { startedAt: 'desc' } }),
    ]);
    return {
      ...toConversationSummary(conv, contact),
      messages: messages.map(toMessageDto),
      facts: (conv.facts ?? {}) as ConversationFacts,
      latestQuote: quote ? toQuoteDto(quote) : null,
      order: order ? toOrderDto(order, contact) : null,
      handoffReason: conv.state === 'needs_you' ? conv.handoffReason : null,
      calls: calls.map(toCallSummary),
    };
  }

  async messageDto(id: string): Promise<MessageDto> {
    const m = await this.db.message.findUnique({ where: { id } });
    if (!m) throw new NotFoundException('Message not found.');
    return toMessageDto(m);
  }

  /* ------------------------------------------------------------------ orders */

  async orderDto(id: string): Promise<OrderDto> {
    const o = await this.db.order.findUnique({ where: { id }, include: { quote: true } });
    if (!o) throw new NotFoundException('Order not found.');
    return toOrderDto(o, await this.contactDto(o.contactId));
  }

  async listOrders(q: { q?: string; status?: string[]; channel?: string[]; sort?: string }): Promise<{ items: OrderDto[] }> {
    const where: Prisma.OrderWhereInput = {};
    if (q.status?.length) where.status = { in: q.status as OrderStatus[] };
    if (q.channel?.length) where.channel = { in: q.channel as Channel[] };
    if (q.q?.trim()) {
      const term = q.q.trim();
      const digits = term.replace(/\D/g, '');
      where.OR = [
        { address: { contains: term, mode: 'insensitive' } },
        { number: { contains: term, mode: 'insensitive' } },
        { contact: { name: { contains: term, mode: 'insensitive' } } },
        ...(digits.length >= 3 ? [{ contact: { identities: { some: { addressNormalized: { contains: digits } } } } }] : []),
      ];
    }
    const rows = await this.db.order.findMany({ where, include: { quote: true }, orderBy: { createdAt: 'desc' }, take: 500 });
    const contacts = await this.contactDtos(rows.map((r) => r.contactId));
    const items = rows.map((r) => toOrderDto(r, contacts.get(r.contactId)!));
    if (q.sort === 'total_desc' || q.sort === 'total_asc') {
      const dir = q.sort === 'total_asc' ? 1 : -1;
      items.sort((a, b) => ((a.quote?.totalCents ?? -1) - (b.quote?.totalCents ?? -1)) * dir);
    }
    return { items };
  }

  /* ------------------------------------------------------------------ calls */

  async listCalls(outcomes?: string[]): Promise<{ items: ReturnType<typeof toCallSummary>[] }> {
    const rows = await this.db.call.findMany({
      where: { status: 'ended', ...(outcomes?.length ? { outcome: { in: outcomes as CallOutcome[] } } : {}) },
      orderBy: { startedAt: 'desc' },
      take: 200,
    });
    return { items: rows.map(toCallSummary) };
  }

  async callDto(id: string): Promise<CallDto> {
    const c = await this.db.call.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Call not found.');
    return toCallDto(c);
  }

  async contactPhoneOf(contactId: string): Promise<string | null> {
    const c = await this.db.contact.findUnique({ where: { id: contactId }, include: { identities: true } });
    return c ? contactPhone(c) : null;
  }
}
