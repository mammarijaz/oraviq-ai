import type { ContactDto, ConversationDetailDto, ConversationSummaryDto, MessageDto, OrderDto, QuoteDto } from '@oraviq/shared';

let n = 0;
const id = (p: string) => `${p}_${++n}`;

export function contact(o: Partial<ContactDto> = {}): ContactDto {
  return { id: id('ct'), name: 'Jasmine Carter', phone: '+14045550182', email: null, company: null, isRepeat: false, orderCount: 0, firstSeenAt: '2026-11-01T18:40:00.000Z', ...o };
}

export function summary(o: Partial<ConversationSummaryDto> = {}): ConversationSummaryDto {
  return {
    id: id('cv'),
    contact: contact(),
    channel: 'sms',
    state: 'assistant',
    tag: 'Quote sent',
    aiMode: 'auto',
    lastMessagePreview: 'A 20-yard for 10 days is $720 delivered.',
    lastMessageAt: '2026-11-01T18:42:00.000Z',
    unread: false,
    assignedUserId: null,
    ...o,
  };
}

export function message(o: Partial<MessageDto> = {}): MessageDto {
  return { id: id('msg'), conversationId: 'cv_x', author: 'customer', channel: 'sms', body: 'Hello', status: 'received', createdAt: '2026-11-01T18:43:00.000Z', ...o };
}

export function quote(o: Partial<QuoteDto> = {}): QuoteDto {
  return {
    id: id('q'),
    conversationId: null,
    createdAt: '2026-11-01T18:42:00.000Z',
    sentence: 'A 20-yard for 10 days is $720 delivered. It includes 3 tons, then $95 per ton over.',
    yards: 20,
    days: 10,
    zip: '30319',
    zoneId: 'z2',
    zoneName: 'Zone 2',
    debris: 'construction',
    heavyFlat: false,
    lineItems: [
      { code: 'base', label: 'Base, 7 days included', amountCents: 62500 },
      { code: 'extra_days', label: '3 extra days at $15', amountCents: 4500, quantity: 3, unitCents: 1500 },
      { code: 'delivery', label: 'Delivery, Zone 2', amountCents: 5000 },
    ],
    totalCents: 72000,
    includedTons: 3,
    overagePerTonCents: 9500,
    includedDays: 7,
    priceTableVersion: 1,
    ...o,
  };
}

export function order(o: Partial<OrderDto> = {}): OrderDto {
  return {
    id: id('ord'),
    number: 'RO-1042',
    status: 'requested',
    contact: contact(),
    conversationId: null,
    channel: 'sms',
    quote: quote(),
    address: '2215 Briarwood Rd',
    zip: '30319',
    placement: 'driveway',
    permitCheck: false,
    deliveryDate: '2026-11-05',
    deliveryDateLabel: 'Thu, Nov 5',
    deliveryWindow: null,
    depositRequested: false,
    depositPaid: false,
    depositUrl: null,
    notes: null,
    createdAt: '2026-11-01T18:43:00.000Z',
    updatedAt: '2026-11-01T18:43:00.000Z',
    ...o,
  };
}

export function detail(o: Partial<ConversationDetailDto> = {}): ConversationDetailDto {
  const s = summary(o);
  return { ...s, messages: [], facts: {}, latestQuote: null, order: null, handoffReason: null, calls: [], ...o };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
