import { defineStore } from 'pinia';
import { computed, reactive, ref } from 'vue';
import type { Channel, OrderDto, OrderStatus, RescheduleOrderRequest } from '@oraviq/shared';
import { api, errorMessage } from '@/api';
import type { LoadStatus } from './inbox';

export type OrderSort = 'total_desc' | 'total_asc' | null;

export interface OrderFilters {
  q: string;
  status: OrderStatus[];
  channel: Channel[];
  sort: OrderSort;
}

const total = (o: OrderDto) => o.quote?.totalCents ?? -1;

export function sortOrders(list: OrderDto[], sort: OrderSort): OrderDto[] {
  const out = [...list];
  if (sort === 'total_desc') out.sort((a, b) => total(b) - total(a));
  else if (sort === 'total_asc') out.sort((a, b) => total(a) - total(b));
  else out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return out;
}

export const useOrdersStore = defineStore('orders', () => {
  const filters = reactive<OrderFilters>({ q: '', status: [], channel: [], sort: null });
  const items = ref<OrderDto[]>([]);
  /** Orders matching only the search: feeds the status and channel counts. */
  const facet = ref<OrderDto[]>([]);
  const status = ref<LoadStatus>('idle');
  const error = ref<string | null>(null);
  let controller: AbortController | null = null;

  const hasFilters = computed(() => !!(filters.q.trim() || filters.status.length || filters.channel.length));
  const statusCounts = computed(() => {
    const out: Partial<Record<OrderStatus, number>> = {};
    for (const o of facet.value) out[o.status] = (out[o.status] ?? 0) + 1;
    return out;
  });
  const channelCounts = computed(() => {
    const out: Partial<Record<Channel, number>> = {};
    for (const o of facet.value) out[o.channel] = (out[o.channel] ?? 0) + 1;
    return out;
  });
  const toConfirm = computed(() => facet.value.filter((o) => o.status === 'requested').length);

  function matches(o: OrderDto, ignoreFilters = false) {
    const q = filters.q.trim().toLowerCase();
    if (q) {
      const hay = [o.contact.name, o.contact.phone, o.address, o.number].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (ignoreFilters) return true;
    if (filters.status.length && !filters.status.includes(o.status)) return false;
    if (filters.channel.length && !filters.channel.includes(o.channel)) return false;
    return true;
  }

  async function fetch() {
    controller?.abort();
    const ctl = new AbortController();
    controller = ctl;
    if (status.value !== 'ready') status.value = 'loading';
    error.value = null;
    const q = filters.q.trim() || undefined;
    const sort = filters.sort ?? 'created_desc';
    const filtered = filters.status.length || filters.channel.length;
    try {
      const [all, some] = await Promise.all([
        api.orders.list({ q, sort }, ctl.signal),
        filtered ? api.orders.list({ q, sort, status: filters.status, channel: filters.channel }, ctl.signal) : Promise.resolve(null),
      ]);
      if (ctl.signal.aborted) return;
      facet.value = all.items;
      items.value = (some ?? all).items;
      status.value = 'ready';
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError' || ctl.signal.aborted) return;
      error.value = errorMessage(e);
      status.value = 'error';
    }
  }

  function setFilters(patch: Partial<OrderFilters>) {
    Object.assign(filters, patch);
    return fetch();
  }

  function clearFilters() {
    return setFilters({ q: '', status: [], channel: [] });
  }

  function cycleSort() {
    return setFilters({ sort: filters.sort === 'total_desc' ? 'total_asc' : 'total_desc' });
  }

  /** Insert, replace or drop an order after an action or a realtime event. */
  function applyOrderUpdated(o: OrderDto) {
    for (const [list, ignore] of [
      [items, false],
      [facet, true],
    ] as const) {
      const i = list.value.findIndex((x) => x.id === o.id);
      const ok = matches(o, ignore);
      if (i >= 0) {
        if (ok) list.value.splice(i, 1, o);
        else list.value.splice(i, 1);
      } else if (ok && status.value !== 'idle') {
        list.value = sortOrders([...list.value, o], filters.sort);
      }
    }
  }

  async function confirm(id: string) {
    const o = await api.orders.confirm(id);
    applyOrderUpdated(o);
    return o;
  }

  async function sendDepositLink(id: string) {
    const o = await api.orders.depositLink(id);
    applyOrderUpdated(o);
    return o;
  }

  async function reschedule(id: string, req: RescheduleOrderRequest) {
    const o = await api.orders.reschedule(id, req);
    applyOrderUpdated(o);
    return o;
  }

  async function setStatus(id: string, next: OrderStatus) {
    const o = await api.orders.setStatus(id, next);
    applyOrderUpdated(o);
    return o;
  }

  function reset() {
    controller?.abort();
    items.value = [];
    facet.value = [];
    status.value = 'idle';
    error.value = null;
    Object.assign(filters, { q: '', status: [], channel: [], sort: null });
  }

  return {
    filters,
    items,
    facet,
    status,
    error,
    hasFilters,
    statusCounts,
    channelCounts,
    toConfirm,
    matches,
    fetch,
    setFilters,
    clearFilters,
    cycleSort,
    applyOrderUpdated,
    confirm,
    sendDepositLink,
    reschedule,
    setStatus,
    reset,
  };
});
