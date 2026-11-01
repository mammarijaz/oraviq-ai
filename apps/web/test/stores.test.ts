import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('@/api', async (orig) => {
  const actual = await orig<typeof import('@/api')>();
  return {
    ...actual,
    api: {
      conversations: { list: vi.fn(), get: vi.fn(), update: vi.fn(), send: vi.fn() },
      orders: { list: vi.fn(), confirm: vi.fn(), reschedule: vi.fn(), setStatus: vi.fn(), depositLink: vi.fn() },
      reviews: { list: vi.fn() },
    },
  };
});

import { api } from '@/api';
import { useInboxStore } from '@/stores/inbox';
import { useNavStore } from '@/stores/nav';
import { useOrdersStore } from '@/stores/orders';
import { notificationText, realtimeHandlers } from '@/composables/useRealtime';
import { contact, detail, message, order, quote, summary } from './fixtures';

const mocked = api as unknown as {
  conversations: Record<'list' | 'get' | 'update' | 'send', ReturnType<typeof vi.fn>>;
  orders: Record<'list' | 'confirm' | 'reschedule' | 'setStatus' | 'depositLink', ReturnType<typeof vi.fn>>;
  reviews: Record<'list', ReturnType<typeof vi.fn>>;
};

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe('inbox store', () => {
  it('loads conversations and channel counts', async () => {
    const a = summary({ channel: 'sms' });
    const b = summary({ channel: 'facebook', lastMessageAt: '2026-11-01T17:00:00.000Z' });
    mocked.conversations.list.mockResolvedValue({ items: [a, b], nextCursor: null });
    const inbox = useInboxStore();
    await inbox.fetch();
    expect(inbox.status).toBe('ready');
    expect(inbox.items.map((c) => c.id)).toEqual([a.id, b.id]);
    expect(inbox.channelCounts).toEqual({ sms: 1, facebook: 1 });
  });

  it('asks the API for the channel filter and keeps counts from the unfiltered list', async () => {
    const a = summary({ channel: 'sms' });
    const b = summary({ channel: 'facebook' });
    mocked.conversations.list.mockImplementation(async (q: { channel?: string[] }) => ({ items: q.channel ? [b] : [a, b], nextCursor: null }));
    const inbox = useInboxStore();
    await inbox.setFilters({ channels: ['facebook'], state: 'needs_you' });
    expect(mocked.conversations.list).toHaveBeenCalledWith({ state: 'needs_you', q: undefined, channel: ['facebook'] }, expect.anything());
    expect(inbox.items).toEqual([b]);
    expect(inbox.channelCounts).toEqual({ sms: 1, facebook: 1 });
  });

  it('applies conversation.updated: new ones go on top, ones leaving the filter drop out', async () => {
    const old = summary({ state: 'needs_you', lastMessageAt: '2026-11-01T10:00:00.000Z' });
    mocked.conversations.list.mockResolvedValue({ items: [old], nextCursor: null });
    const inbox = useInboxStore();
    await inbox.setFilters({ state: 'needs_you' });

    const fresh = summary({ state: 'needs_you', lastMessageAt: '2026-11-01T19:00:00.000Z' });
    inbox.applyConversationUpdated(fresh);
    expect(inbox.items.map((c) => c.id)).toEqual([fresh.id, old.id]);

    inbox.applyConversationUpdated({ ...old, state: 'confirmed' });
    expect(inbox.items.map((c) => c.id)).toEqual([fresh.id]);

    // Not matching the filter and not listed: ignored.
    inbox.applyConversationUpdated(summary({ state: 'assistant' }));
    expect(inbox.items).toHaveLength(1);
  });

  it('applies message.created to the open thread once and updates the preview', async () => {
    const s = summary();
    mocked.conversations.list.mockResolvedValue({ items: [s], nextCursor: null });
    mocked.conversations.get.mockResolvedValue(detail({ ...s, messages: [] }));
    const inbox = useInboxStore();
    await inbox.fetch();
    await inbox.select(s.id);

    const m = message({ conversationId: s.id, body: '2215 Briarwood Rd, Thursday', createdAt: '2026-11-01T19:30:00.000Z' });
    inbox.applyMessageCreated(m);
    inbox.applyMessageCreated(m); // the socket and the POST response can both deliver it
    expect(inbox.selected!.messages).toHaveLength(1);
    expect(inbox.items[0]!.lastMessagePreview).toBe('2215 Briarwood Rd, Thursday');
    expect(inbox.items[0]!.unread).toBe(false); // the thread is open
  });

  it('marks unread for customer messages in other conversations', async () => {
    const a = summary();
    const b = summary();
    mocked.conversations.list.mockResolvedValue({ items: [a, b], nextCursor: null });
    const inbox = useInboxStore();
    await inbox.fetch();
    inbox.applyMessageCreated(message({ conversationId: b.id, createdAt: '2026-11-02T08:00:00.000Z' }));
    expect(inbox.items[0]!.id).toBe(b.id);
    expect(inbox.items[0]!.unread).toBe(true);
  });

  it('applies order.updated to the conversation detail', async () => {
    const s = summary();
    const o = order({ conversationId: s.id });
    mocked.conversations.list.mockResolvedValue({ items: [s], nextCursor: null });
    mocked.conversations.get.mockResolvedValue(detail({ ...s, order: o }));
    const inbox = useInboxStore();
    await inbox.fetch();
    await inbox.select(s.id);
    inbox.applyOrderUpdated({ ...o, status: 'confirmed' });
    expect(inbox.selected!.order!.status).toBe('confirmed');
  });

  it('takes over: PATCH aiMode off, then reloads the thread', async () => {
    const s = summary();
    mocked.conversations.list.mockResolvedValue({ items: [s], nextCursor: null });
    mocked.conversations.get.mockResolvedValue(detail({ ...s, aiMode: 'off' }));
    mocked.conversations.update.mockResolvedValue({ ...s, aiMode: 'off' });
    const inbox = useInboxStore();
    await inbox.fetch();
    await inbox.setAiMode(s.id, 'off');
    expect(mocked.conversations.update).toHaveBeenCalledWith(s.id, { aiMode: 'off' });
    expect(inbox.items[0]!.aiMode).toBe('off');
  });
});

describe('nav counts', () => {
  it('counts needs-you conversations and waiting reviews, then follows live events', async () => {
    const a = summary({ state: 'needs_you' });
    mocked.conversations.list.mockResolvedValue({ items: [a], nextCursor: null });
    mocked.reviews.list.mockResolvedValue({ items: [], stats: { waitingForReply: 3 } });
    const nav = useNavStore();
    await nav.load();
    expect(nav.needsYou).toBe(1);
    expect(nav.reviewsWaiting).toBe(3);

    nav.applyConversationUpdated(summary({ state: 'needs_you' }));
    expect(nav.needsYou).toBe(2);
    nav.applyConversationUpdated({ id: a.id, state: 'confirmed' });
    expect(nav.needsYou).toBe(1);
    nav.applyReviewCreated({ reply: null });
    expect(nav.reviewsWaiting).toBe(4);
  });
});

describe('orders store', () => {
  it('sorts by total and applies order.updated within the filters', async () => {
    const cheap = order({ quote: quote({ totalCents: 42500 }) });
    const dear = order({ quote: quote({ totalCents: 79500 }) });
    mocked.orders.list.mockResolvedValue({ items: [dear, cheap] });
    const orders = useOrdersStore();
    await orders.setFilters({ sort: 'total_desc', status: ['requested'] });
    expect(mocked.orders.list).toHaveBeenLastCalledWith({ q: undefined, sort: 'total_desc', status: ['requested'], channel: [] }, expect.anything());

    orders.applyOrderUpdated({ ...cheap, status: 'confirmed' });
    expect(orders.items.map((o) => o.id)).toEqual([dear.id]); // left the status filter
    expect(orders.statusCounts).toEqual({ requested: 1, confirmed: 1 });

    const mid = order({ quote: quote({ totalCents: 62500 }), contact: contact({ name: 'Grace Lee' }) });
    orders.applyOrderUpdated(mid);
    expect(orders.items.map((o) => o.quote!.totalCents)).toEqual([79500, 62500]);
  });

  it('confirm replaces the row with the API result', async () => {
    const o = order();
    mocked.orders.list.mockResolvedValue({ items: [o] });
    mocked.orders.confirm.mockResolvedValue({ ...o, status: 'confirmed', depositRequested: true });
    const orders = useOrdersStore();
    await orders.fetch();
    await orders.confirm(o.id);
    expect(orders.items[0]!.status).toBe('confirmed');
    expect(orders.toConfirm).toBe(0);
  });
});

describe('realtime handlers', () => {
  it('route each server event to the right stores', async () => {
    const s = summary({ state: 'assistant' });
    const o = order({ conversationId: s.id });
    mocked.conversations.list.mockResolvedValue({ items: [s], nextCursor: null });
    mocked.conversations.get.mockResolvedValue(detail({ ...s, order: o }));
    mocked.orders.list.mockResolvedValue({ items: [o] });
    const inbox = useInboxStore();
    const orders = useOrdersStore();
    const nav = useNavStore();
    await Promise.all([inbox.fetch(), orders.fetch()]);
    await inbox.select(s.id);
    const notify = vi.fn();
    const h = realtimeHandlers({ inbox, orders, nav, notify });

    h['conversation.updated']({ ...s, state: 'needs_you', tag: 'Order to confirm' });
    expect(inbox.items[0]!.tag).toBe('Order to confirm');
    expect(nav.needsYou).toBe(1);

    h['order.updated']({ ...o, status: 'confirmed' });
    expect(orders.items[0]!.status).toBe('confirmed');
    expect(inbox.details[s.id]!.order!.status).toBe('confirmed');

    h['message.created'](message({ conversationId: s.id, author: 'owner', body: 'See you Thursday', createdAt: '2026-11-02T09:00:00.000Z' }));
    expect(inbox.details[s.id]!.messages.at(-1)!.body).toBe('See you Thursday');

    h.notification({ title: 'New order', body: '20-yard to 2215 Briarwood Rd', href: '/inbox/x' });
    expect(notify).toHaveBeenCalledWith({ title: 'New order', body: '20-yard to 2215 Briarwood Rd', href: '/inbox/x' });
  });
});

describe('notification text', () => {
  it('does not repeat the title when the body already starts with it', () => {
    expect(notificationText({ title: 'New order', body: 'New order: 20-yard to 2215 Briarwood Rd, Thursday, $720.' })).toBe('New order: 20-yard to 2215 Briarwood Rd, Thursday, $720.');
    expect(notificationText({ title: 'Needs you', body: 'Concrete in a 20-yard.' })).toBe('Needs you. Concrete in a 20-yard.');
  });
});
