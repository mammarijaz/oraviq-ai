<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { OvButton, OvCheckbox, OvDatePicker, OvDropdown, OvField, OvModal } from '@oraviq/ui';
import { DELIVERY_WINDOWS, type OrderDto, type RescheduleOrderRequest } from '@oraviq/shared';
import { firstName, isoDay, addDays, tomorrowIso, toDate } from '@/lib/format';

const props = defineProps<{ order: OrderDto | null; busy?: boolean }>();
const open = defineModel<boolean>('open', { default: false });
const emit = defineEmits<{ save: [req: RescheduleOrderRequest] }>();

const date = ref<string | null>(null);
const timeWindow = ref<string>(DELIVERY_WINDOWS[0]);
const notify = ref(true);
const error = ref<string | undefined>();

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** The current delivery day as ISO: the stored date, or the next matching weekday for phrases like "Thursday". */
function startingDay(o: OrderDto): string {
  const min = tomorrowIso();
  if (o.deliveryDate && /^\d{4}-\d{2}-\d{2}$/.test(o.deliveryDate)) return o.deliveryDate < min ? min : o.deliveryDate;
  const i = WEEKDAYS.indexOf(String(o.deliveryDate ?? o.deliveryDateLabel ?? '').trim().toLowerCase().split(/[\s,]/)[0] ?? '');
  const d = new Date();
  if (i < 0) return min;
  let k = (i - d.getDay() + 7) % 7;
  if (k === 0) k = 7;
  return isoDay(addDays(d, k));
}

watch(
  () => [open.value, props.order] as const,
  ([isOpen, o]) => {
    if (!isOpen || !o) return;
    date.value = startingDay(o);
    timeWindow.value = o.deliveryWindow && (DELIVERY_WINDOWS as readonly string[]).includes(o.deliveryWindow) ? o.deliveryWindow : DELIVERY_WINDOWS[0];
    notify.value = true;
    error.value = undefined;
  },
  { immediate: true },
);

const subtitle = computed(() => {
  const o = props.order;
  if (!o) return '';
  return [o.contact.name || 'Customer', o.quote ? `${o.quote.yards}-yard` : 'dumpster', o.address].filter(Boolean).join(' · ');
});
const who = computed(() => firstName(props.order?.contact.name) || 'the customer');
const windowOptions = DELIVERY_WINDOWS.map((w) => ({ value: w, label: w }));

function save() {
  if (!date.value || !toDate(date.value)) {
    error.value = 'Pick a delivery day.';
    return;
  }
  if (date.value < tomorrowIso()) {
    error.value = 'Pick tomorrow or later.';
    return;
  }
  emit('save', { deliveryDate: date.value, deliveryWindow: timeWindow.value, notifyCustomer: notify.value });
}
</script>

<template>
  <OvModal v-model:open="open" title="Change delivery day" :subtitle="subtitle">
    <div class="stack" style="gap: var(--space-4)">
      <OvField label="Delivery day" :error="error">
        <OvDatePicker v-model="date" :min="tomorrowIso()" label="Choose delivery day" @update:model-value="error = undefined" />
      </OvField>
      <OvField label="Time window">
        <OvDropdown v-model="timeWindow" variant="field" label="Time window" :options="windowOptions" />
      </OvField>
      <OvCheckbox v-model="notify" :label="`Text ${who} about the change`" hint="The assistant sends the new day and window from your number." />
    </div>
    <template #footer="{ close }">
      <OvButton variant="quiet" @click="close()">Cancel</OvButton>
      <OvButton variant="primary" :loading="busy" @click="save">Save change</OvButton>
    </template>
  </OvModal>
</template>
