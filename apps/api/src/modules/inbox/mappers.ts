/** Pure row → DTO mappers for the API contract (@oraviq/shared). */
import type { Quote } from '@oraviq/pricing';
import type {
  CallDto,
  CallSummaryDto,
  Channel,
  ContactDto,
  ConversationSummaryDto,
  MessageDto,
  OrderDto,
  QuoteDto,
  ReviewDto,
} from '@oraviq/shared';
import type { Call, Contact, ContactIdentity, Conversation, Message, Order, Quote as QuoteRow, Review, ReviewReplyDraft } from '@prisma/client';

export type ContactWithIdentities = Contact & { identities: ContactIdentity[] };
export interface ContactStats {
  orderCount: number;
  completedCount: number;
}

export function contactPhone(c: { identities: ContactIdentity[] }): string | null {
  const id = c.identities.find((i) => i.channel === 'sms') ?? c.identities.find((i) => i.channel === 'phone');
  return id?.addressNormalized ?? null;
}

export function contactHandle(c: { identities: ContactIdentity[] }): string | null {
  const id = c.identities.find((i) => i.channel === 'facebook' || i.channel === 'instagram');
  return id?.displayAddress ?? null;
}

export function toContactDto(c: ContactWithIdentities, stats: ContactStats = { orderCount: 0, completedCount: 0 }): ContactDto {
  return {
    id: c.id,
    name: c.name,
    phone: contactPhone(c),
    email: c.email,
    company: c.company,
    // A repeat customer has rented from the hauler before (a completed order).
    isRepeat: stats.completedCount > 0,
    orderCount: stats.orderCount,
    firstSeenAt: c.firstSeenAt.toISOString(),
  };
}

export function toConversationSummary(conv: Conversation, contact: ContactDto): ConversationSummaryDto {
  return {
    id: conv.id,
    contact,
    channel: conv.channel as Channel,
    state: conv.state,
    tag: conv.tag,
    aiMode: conv.aiMode,
    lastMessagePreview: conv.lastMessagePreview,
    lastMessageAt: conv.lastMessageAt.toISOString(),
    unread: conv.unread,
    assignedUserId: conv.assignedUserId,
  };
}

export function toMessageDto(m: Message): MessageDto {
  return {
    id: m.id,
    conversationId: m.conversationId,
    author: m.author,
    channel: m.channel as Channel,
    body: m.body,
    status: m.status,
    createdAt: m.createdAt.toISOString(),
    meta: m.meta ?? null,
    quoteId: m.quoteId ?? null,
  };
}

export function toQuoteDto(q: QuoteRow): QuoteDto {
  const quote = q.quote as unknown as Quote;
  return { ...quote, id: q.id, conversationId: q.conversationId, createdAt: q.createdAt.toISOString(), sentence: q.sentence };
}

export function toOrderDto(o: Order & { quote: QuoteRow | null }, contact: ContactDto): OrderDto {
  return {
    id: o.id,
    number: o.number,
    status: o.status,
    contact,
    conversationId: o.conversationId,
    channel: o.channel as Channel,
    quote: o.quote ? toQuoteDto(o.quote) : null,
    address: o.address,
    zip: o.zip,
    placement: o.placement,
    permitCheck: o.permitCheck,
    deliveryDate: o.deliveryDate,
    deliveryDateLabel: o.deliveryDateLabel,
    deliveryWindow: o.deliveryWindow,
    depositRequested: o.depositRequested,
    depositPaid: o.depositPaid,
    depositUrl: o.depositUrl,
    notes: o.notes,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  };
}

export function toCallSummary(c: Call): CallSummaryDto {
  return {
    id: c.id,
    callerName: c.callerName,
    callerNumber: c.callerNumber,
    startedAt: c.startedAt.toISOString(),
    durationSeconds: c.durationSeconds,
    afterHours: c.afterHours,
    outcome: c.outcome,
    summary: c.summary,
  };
}

export function toCallDto(c: Call): CallDto {
  const transcript = Array.isArray(c.transcript) ? (c.transcript as Array<{ speaker: 'agent' | 'caller'; text: string }>) : [];
  return { ...toCallSummary(c), conversationId: c.conversationId, transcript, transferredTo: c.transferredTo, recordingAvailable: !!c.recordingKey };
}

export function toReviewDto(r: Review & { drafts: ReviewReplyDraft[] }): ReviewDto {
  const latest = [...r.drafts].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  return {
    id: r.id,
    source: r.source,
    author: r.author,
    rating: r.rating,
    recommends: r.recommends,
    text: r.text,
    createdAt: r.createdAt.toISOString(),
    reply: r.reply,
    repliedAt: r.repliedAt?.toISOString() ?? null,
    draft: r.reply ? null : latest?.text ?? null,
    needsCall: !r.reply && r.rating != null && r.rating <= 2,
    customerPhone: r.customerPhone,
  };
}

/**
 * A customer's first name, safe to put in a text we send: one plain word or null.
 * Names come from public forms and chats, so a "name" like "https://…" must not be relayed.
 */
export function safeFirstName(name: string | null | undefined): string | null {
  const first = String(name ?? '').replace(/\(.*?\)/g, ' ').trim().split(/\s+/)[0] ?? '';
  return /^\p{L}[\p{L}'’.-]{0,29}$/u.test(first) ? first : null;
}

/** Short preview line for the conversation list. */
export function preview(body: string): string {
  const s = body.replace(/\s+/g, ' ').trim();
  return s.length > 160 ? `${s.slice(0, 157)}…` : s;
}
