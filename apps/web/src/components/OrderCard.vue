<script setup lang="ts">
import { computed } from 'vue';
import { OvButton, OvCard, OvNote } from '@oraviq/ui';
import type { OrderDto } from '@oraviq/shared';
import { depositLabel, orderStatusLabel } from '@/lib/status';

/** The order request in the inbox details panel, with Confirm order and Send deposit link. */
const props = defineProps<{ order: OrderDto; busy?: string; canMarkPaid?: boolean }>();
defineEmits<{ confirm: []; deposit: []; reschedule: []; paid: [] }>();

const isRequest = computed(() => props.order.status === 'requested');
const closed = computed(() => ['cancelled', 'closed', 'picked_up'].includes(props.order.status));
const day = computed(() => [props.order.deliveryDateLabel, props.order.deliveryWindow].filter(Boolean).join(', '));
const placement = computed(() => ({ driveway: 'Driveway', street: 'Street', other: 'Other' })[props.order.placement] ?? props.order.placement);
const showPermit = computed(() => props.order.permitCheck || props.order.placement === 'street');
</script>

<template>
  <OvCard radius="md" :label="isRequest ? 'Order request' : `Order ${order.number}`" :heading-level="3">
    <dl class="kv" style="margin: 8px 0 12px">
      <dt>Deliver to</dt>
      <dd>{{ order.address }}</dd>
      <dt>Day</dt>
      <dd>{{ day || 'Not set' }}</dd>
      <dt>Placement</dt>
      <dd>{{ placement }}</dd>
      <dt>Status</dt>
      <dd>{{ isRequest ? 'Waiting for you' : orderStatusLabel(order.status) }}</dd>
      <dt>Deposit</dt>
      <dd>{{ depositLabel(order) }}</dd>
    </dl>
    <OvNote v-if="showPermit" tone="warning" style="margin: 0 0 12px">Street placement may need a city permit.</OvNote>
    <div v-if="!closed" class="actions">
      <OvButton v-if="isRequest" variant="primary" :loading="busy === 'confirm'" @click="$emit('confirm')">Confirm order</OvButton>
      <OvButton v-if="!order.depositRequested && !order.depositPaid" variant="secondary" :loading="busy === 'deposit'" @click="$emit('deposit')">
        Send deposit link
      </OvButton>
      <OvButton v-else-if="!order.depositPaid" variant="quiet" size="sm" :loading="busy === 'deposit'" @click="$emit('deposit')">Send link again</OvButton>
      <OvButton variant="quiet" size="sm" @click="$emit('reschedule')">Change day</OvButton>
    </div>
    <p v-if="canMarkPaid" style="margin-top: 8px">
      <OvButton variant="quiet" size="sm" :loading="busy === 'paid'" @click="$emit('paid')">Mark deposit paid (demo)</OvButton>
    </p>
  </OvCard>
</template>
