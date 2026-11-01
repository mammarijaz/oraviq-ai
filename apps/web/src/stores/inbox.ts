import { defineStore } from 'pinia';
import { computed, reactive, ref } from 'vue';
import type { Channel, ConversationDetailDto, ConversationState, ConversationSummaryDto, MessageDto, OrderDto } from '@oraviq/shared';
import { api, errorMessage } from '@/api';

export type InboxStateFilter = 'all' | ConversationState;
export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface InboxFilters {
  state: InboxStateFilter;
  channels: Channel[];
  q: string;
}

const byRecent = (a: ConversationSummaryDto, b: ConversationSummaryDto) => (a.lastMessageAt < b.lastMessageAt ? 1 : a.lastMessageAt > b.lastMessageAt ? -1 : 0);

function summaryOf(d: ConversationSummaryDto): ConversationSummaryDto {
  const { id, contact, channel, state, tag, aiMode, lastMessagePreview, lastMessageAt, unread, assignedUserId } = d;
  return { id, contact, channel, state, tag, aiMode, lastMessagePreview, lastMessageAt, unread, assignedUserId };
}

export const useInboxStore = defineStore('inbox', () => {
  const filters = reactive<InboxFilters>({ state: 'all', channels: [], q: '' });
  /** Conversations for the current filters, newest first. */
  const items = ref<ConversationSummaryDto[]>([]);
  /** Same filters without the channel filter: feeds the channel counts. */
  const facet = ref<ConversationSummaryDto[]>([]);
  const nextCursor = ref<string | null>(null);
  const status = ref<LoadStatus>('idle');
  const error = ref<string | null>(null);
  const loadingMore = ref(false);

  const details = ref<Record<string, ConversationDetailDto>>({});
  const detailStatus = ref<Record<string, LoadStatus>>({});
  const detailError = ref<Record<string, string>>({});
  const selectedId = ref<string | null>(null);

  let controller: AbortController | null = null;
  const pendingDetail = new Map<string, Promise<void>>();

  const channelCounts = computed(() => {
    const out: Partial<Record<Channel, number>> = {};
    for (const c of facet.value) out[c.channel] = (out[c.channel] ?? 0) + 1;
    return out;
  });

  const selected = computed(() => (selectedId.value ? details.value[selectedId.value] ?? null : null));
  const selectedSummary = computed(
    () => (selectedId.value ? items.value.find((c) => c.id === selectedId.value) ?? facet.value.find((c) => c.id === selectedId.value) : null) ?? null,
  );

  function matches(c: ConversationSummaryDto, opts: { ignoreChannel?: boolean; ignoreQuery?: boolean } = {}): boolean {
    if (filters.state !== 'all' && c.state !== filters.state) return false;
    if (!opts.ignoreChannel && filters.channels.length && !filters.channels.includes(c.channel)) return false;
    const q = filters.q.trim().toLowerCase();
    if (q && !opts.ignoreQuery) {
      const hay = [c.contact.name, c.contact.phone, c.contact.email, c.contact.company, c.lastMessagePreview].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }

  async function fetch() {
    controller?.abort();
    const ctl = new AbortController();
    controller = ctl;
    // Keep showing the current list while re-filtering; only the first load shows skeletons.
    if (status.value !== 'ready') status.value = 'loading';
    error.value = null;
    const base = { state: filters.state === 'all' ? undefined : filters.state, q: filters.q.trim() || undefined };
    try {
      const [all, filtered] = await Promise.all([
        api.conversations.list(base, ctl.signal),
        filters.channels.length ? api.conversations.list({ ...base, channel: filters.channels }, ctl.signal) : Promise.resolve(null),
      ]);
      if (ctl.signal.aborted) return;
      facet.value = all.items;
      items.value = (filtered ?? all).items;
      nextCursor.value = (filtered ?? all).nextCursor;
      status.value = 'ready';
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError' || ctl.signal.aborted) return;
      error.value = errorMessage(e);
      status.value = 'error';
    }
  }

  async function loadMore() {
    if (!nextCursor.value || loadingMore.value) return;
    loadingMore.value = true;
    try {
      const page = await api.conversations.list({
        state: filters.state === 'all' ? undefined : filters.state,
        q: filters.q.trim() || undefined,
        channel: filters.channels.length ? filters.channels : undefined,
        cursor: nextCursor.value,
      });
      const seen = new Set(items.value.map((c) => c.id));
      items.value = [...items.value, ...page.items.filter((c) => !seen.has(c.id))];
      if (!filters.channels.length) {
        const seenF = new Set(facet.value.map((c) => c.id));
        facet.value = [...facet.value, ...page.items.filter((c) => !seenF.has(c.id))];
      }
      nextCursor.value = page.nextCursor;
    } finally {
      loadingMore.value = false;
    }
  }

  function setFilters(patch: Partial<InboxFilters>) {
    Object.assign(filters, patch);
    return fetch();
  }

  function clearFilters() {
    return setFilters({ state: 'all', channels: [], q: '' });
  }

  function fetchDetail(id: string, opts: { silent?: boolean } = {}): Promise<void> {
    const pending = pendingDetail.get(id);
    if (pending) return pending;
    if (!opts.silent || !details.value[id]) detailStatus.value[id] = 'loading';
    const p = api.conversations
      .get(id)
      .then((d) => {
        details.value[id] = d;
        detailStatus.value[id] = 'ready';
        delete detailError.value[id];
        upsertSummary(summaryOf({ ...d, unread: false }));
      })
      .catch((e) => {
        if (!opts.silent || !details.value[id]) {
          detailStatus.value[id] = 'error';
          detailError.value[id] = errorMessage(e);
        }
      })
      .finally(() => pendingDetail.delete(id));
    pendingDetail.set(id, p);
    return p;
  }

  function select(id: string | null) {
    selectedId.value = id;
    if (id) return fetchDetail(id, { silent: !!details.value[id] });
    return Promise.resolve();
  }

  /** Insert or update a summary in the list and facet, respecting the current filters. */
  function upsertSummary(c: ConversationSummaryDto) {
    for (const list of [items, facet] as const) {
      const ignoreChannel = list === facet;
      const i = list.value.findIndex((x) => x.id === c.id);
      if (i >= 0) {
        // Already listed (the server matched the search): drop it only when state/channel no longer match.
        if (matches(c, { ignoreChannel, ignoreQuery: true })) list.value.splice(i, 1, c);
        else list.value.splice(i, 1);
      } else if (matches(c, { ignoreChannel }) && status.value !== 'idle') {
        list.value.push(c);
      }
      list.value.sort(byRecent);
    }
  }

  /* -------------------------------------------------------------- realtime */

  function applyConversationUpdated(c: ConversationSummaryDto) {
    const isOpen = selectedId.value === c.id;
    upsertSummary(isOpen ? { ...c, unread: false } : c);
    const d = details.value[c.id];
    if (d) {
      details.value[c.id] = { ...d, ...c, unread: isOpen ? false : c.unread };
      // State, handoff, quote or order may have changed with it: refresh the open thread quietly.
      if (isOpen) void fetchDetail(c.id, { silent: true });
    }
  }

  function applyMessageCreated(m: MessageDto) {
    const d = details.value[m.conversationId];
    if (d && !d.messages.some((x) => x.id === m.id)) {
      d.messages = [...d.messages, m].sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
    }
    for (const list of [items, facet]) {
      const s = list.value.find((x) => x.id === m.conversationId);
      if (s && m.author !== 'system' && m.createdAt >= s.lastMessageAt) {
        s.lastMessagePreview = m.body;
        s.lastMessageAt = m.createdAt;
        if (m.author === 'customer' && selectedId.value !== m.conversationId) s.unread = true;
        list.value.sort(byRecent);
      }
    }
  }

  function applyOrderUpdated(o: OrderDto) {
    for (const d of Object.values(details.value)) {
      if (d.order?.id === o.id || (o.conversationId && d.id === o.conversationId)) d.order = o;
    }
  }

  /* -------------------------------------------------------------- actions */

  async function setAiMode(id: string, aiMode: 'auto' | 'off') {
    const summary = await api.conversations.update(id, { aiMode });
    applyConversationUpdated(summary);
    await fetchDetail(id, { silent: true });
    return summary;
  }

  async function sendMessage(id: string, body: string, idempotencyKey?: string) {
    const m = await api.conversations.send(id, body, idempotencyKey);
    applyMessageCreated(m);
    return m;
  }

  function reset() {
    controller?.abort();
    items.value = [];
    facet.value = [];
    nextCursor.value = null;
    status.value = 'idle';
    error.value = null;
    details.value = {};
    detailStatus.value = {};
    detailError.value = {};
    selectedId.value = null;
    Object.assign(filters, { state: 'all', channels: [], q: '' });
  }

  return {
    filters,
    items,
    facet,
    nextCursor,
    status,
    error,
    loadingMore,
    details,
    detailStatus,
    detailError,
    selectedId,
    selected,
    selectedSummary,
    channelCounts,
    matches,
    fetch,
    loadMore,
    setFilters,
    clearFilters,
    fetchDetail,
    select,
    upsertSummary,
    applyConversationUpdated,
    applyMessageCreated,
    applyOrderUpdated,
    setAiMode,
    sendMessage,
    reset,
  };
});
