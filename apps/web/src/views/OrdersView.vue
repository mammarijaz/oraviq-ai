<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { useDebounceFn } from '@vueuse/core';
import { OvButton, OvChannelTag, OvDropdown, OvEmptyState, OvPageHeader, OvSearch, OvSkeleton, OvStatus, OvTable, type TableColumn, type TableSort } from '@oraviq/ui';
import { formatPhone, ORDER_STATUS_LABELS, ORDER_STATUSES, type Channel, type OrderDto, type OrderStatus } from '@oraviq/shared';
import { formatMoney } from '@oraviq/pricing';
import ErrorState from '@/components/ErrorState.vue';
import RescheduleModal from '@/components/RescheduleModal.vue';
import { useOrdersStore } from '@/stores/orders';
import { useOrderActions } from '@/composables/useOrderActions';
import { plural } from '@/lib/format';
import { canReschedule, channelOptions, contactName, nextStep, orderStatusTone } from '@/lib/status';

const orders = useOrdersStore();
const actions = useOrderActions();

onMounted(() => void orders.fetch());

const search = ref(orders.filters.q);
const applySearch = useDebounceFn((q: string) => orders.setFilters({ q }), 250);
watch(search, (q) => void applySearch(q));

const statusFilter = computed<OrderStatus[]>({ get: () => orders.filters.status, set: (v) => void orders.setFilters({ status: v ?? [] }) });
const channelFilter = computed<Channel[]>({ get: () => orders.filters.channel, set: (v) => void orders.setFilters({ channel: v ?? [] }) });

const statusOptions = computed(() =>
  ORDER_STATUSES.filter((s) => s === 'requested' || s === 'confirmed' || (orders.statusCounts[s] ?? 0) > 0 || orders.filters.status.includes(s)).map((s) => ({
    value: s,
    label: ORDER_STATUS_LABELS[s],
    count: orders.statusCounts[s] ?? 0,
  })),
);
const channelOpts = computed(() => channelOptions(orders.channelCounts, orders.filters.channel));

const sort = computed<TableSort | null>({
  get: (): TableSort | null => (orders.filters.sort ? { key: 'total', dir: orders.filters.sort === 'total_asc' ? 'asc' : 'desc' } : null),
  set: (v: TableSort | null) => void orders.setFilters({ sort: v ? (v.dir === 'asc' ? 'total_asc' : 'total_desc') : null }),
});

const columns: TableColumn<OrderDto>[] = [
  { key: 'customer', label: 'Customer' },
  { key: 'dumpster', label: 'Dumpster' },
  { key: 'address', label: 'Deliver to', wrap: true },
  { key: 'day', label: 'Day', wrap: true },
  { key: 'total', label: 'Total', align: 'right', sortable: true, sortFirst: 'desc' },
  { key: 'status', label: 'Status' },
  { key: 'actions', label: 'Actions', hideLabel: true, align: 'right' },
];

const placement = (o: OrderDto) => ({ driveway: 'Driveway', street: 'Street', other: 'Other' })[o.placement] ?? o.placement;

function clearFilters() {
  search.value = '';
  void orders.clearFilters();
}

const rescheduling = ref<OrderDto | null>(null);
const rescheduleOpen = ref(false);
function openReschedule(o: OrderDto) {
  rescheduling.value = o;
  rescheduleOpen.value = true;
}
async function saveReschedule(req: Parameters<typeof actions.reschedule>[1]) {
  if (!rescheduling.value) return;
  if (await actions.reschedule(rescheduling.value, req)) rescheduleOpen.value = false;
}
</script>

<template>
  <OvPageHeader title="Orders">
    <template v-if="orders.status === 'ready'">
      {{ orders.toConfirm ? `${plural(orders.toConfirm, 'request')} waiting for you to confirm.` : 'No requests waiting for you.' }}
    </template>
    <template v-else>Requests from every channel, in one list.</template>
  </OvPageHeader>

  <div class="toolbar">
    <OvSearch v-model="search" placeholder="Search customer or address" label="Search orders" />
    <OvDropdown v-model="statusFilter" multiple variant="filter" label="Status" all-label="All" :searchable="false" :options="statusOptions" />
    <OvDropdown v-model="channelFilter" multiple variant="filter" label="Channel" all-label="All" :searchable="false" :options="channelOpts" />
    <OvButton v-if="orders.hasFilters" variant="quiet" size="sm" @click="clearFilters">Clear filters</OvButton>
  </div>

  <div v-if="orders.status === 'loading' || orders.status === 'idle'" class="stack" aria-busy="true" aria-label="Loading orders">
    <OvSkeleton v-for="i in 4" :key="i" height="64" radius="md" />
  </div>
  <ErrorState v-else-if="orders.status === 'error'" :message="orders.error" @retry="orders.fetch()" />
  <OvTable
    v-else
    v-model:sort="sort"
    class="orders-table"
    :columns="columns"
    :rows="orders.items"
    caption="Orders"
    stack-on-mobile
    manual-sort
  >
    <template #empty>
      <OvEmptyState
        v-if="orders.hasFilters"
        title="No orders match"
        text="Try another status or channel, or clear the filters."
        action-label="Clear filters"
        @action="clearFilters"
      />
      <OvEmptyState v-else title="No orders yet" icon="truck" text="Orders the assistant takes, and bookings from your website, show up here." />
    </template>
    <template #cell-customer="{ row }">
      <div class="cust">
        <b>{{ contactName(row.contact, formatPhone, row.channel) }}</b>
        <OvChannelTag :channel="row.channel" />
      </div>
    </template>
    <template #cell-dumpster="{ row }">
      <span v-if="row.quote">{{ row.quote.yards }}-yard, {{ row.quote.days }} days</span>
      <span v-else class="muted">Price needed</span>
    </template>
    <template #cell-address="{ row }">
      <div>
        {{ row.address }}<br />
        <span class="small muted">{{ placement(row) }}{{ row.permitCheck || row.placement === 'street' ? ' · permit check' : '' }}</span>
      </div>
    </template>
    <template #cell-day="{ row }">
      <div>
        {{ row.deliveryDateLabel || 'Not set' }}
        <template v-if="row.deliveryWindow"><br /><span class="small muted">{{ row.deliveryWindow }}</span></template>
      </div>
    </template>
    <template #cell-total="{ row }">
      <b class="num">{{ row.quote ? formatMoney(row.quote.totalCents) : '—' }}</b>
    </template>
    <template #cell-status="{ row }">
      <div class="status-cell">
        <OvStatus :tone="orderStatusTone(row.status)">{{ ORDER_STATUS_LABELS[row.status] }}</OvStatus>
        <OvStatus v-if="row.depositPaid" tone="confirmed">Deposit paid</OvStatus>
        <OvStatus v-else-if="row.depositRequested" tone="info">Deposit sent</OvStatus>
        <OvButton
          v-if="nextStep(row)"
          variant="quiet"
          size="sm"
          class="step-link"
          :loading="actions.busy.value[row.id] === 'status'"
          @click="actions.advance(row)"
        >
          {{ nextStep(row)!.label }}
        </OvButton>
      </div>
    </template>
    <template #cell-actions="{ row }">
      <div class="order-actions">
        <OvButton v-if="row.status === 'requested'" variant="primary" size="sm" :loading="actions.busy.value[row.id] === 'confirm'" @click="actions.confirm(row)">
          Confirm
        </OvButton>
        <OvButton v-else-if="row.conversationId" :as="RouterLink" :to="`/inbox/${row.conversationId}`" variant="quiet" size="sm">View</OvButton>
        <OvButton v-if="canReschedule(row)" variant="quiet" size="sm" @click="openReschedule(row)">Change day</OvButton>
      </div>
    </template>
  </OvTable>

  <RescheduleModal
    v-model:open="rescheduleOpen"
    :order="rescheduling"
    :busy="rescheduling ? actions.busy.value[rescheduling.id] === 'reschedule' : false"
    @save="saveReschedule"
  />
</template>
