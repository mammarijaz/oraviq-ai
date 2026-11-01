<script setup lang="ts">
import { computed, nextTick, ref, useId } from 'vue';
import { FocusScope } from 'reka-ui';
import OvIcon from './OvIcon.vue';
import { useControl } from '../composables/useField';
import { useModel } from '../composables/useModel';
import { LAYER_ATTRS, tabbables, usePopover, type PopoverCloseReason } from '../composables/usePopover';
import { MONTHS, WEEKDAYS, addDays, formatDate, parseIsoDate, toIsoDate, todayIso } from '../utils/format';

/**
 * A field that opens a month calendar for a delivery or pickup day. Shows "Thu, Nov 5"; v-model is ISO 'YYYY-MM-DD'.
 * `min` blocks earlier days (struck through). Quick picks: Today, Tomorrow, Saturday.
 * Keys: arrows move by day and week, Page Up/Down by month, Home/End to the start/end of the week, Enter picks, Escape closes.
 */
const props = withDefaults(
  defineProps<{
    /** The day as ISO 'YYYY-MM-DD', or null. */
    modelValue?: string | null;
    /** Accessible name when not inside an OvField, and the panel's name ("Choose delivery day"). */
    label?: string;
    placeholder?: string;
    /** Earliest day that can be picked, ISO. */
    min?: string;
    /** Latest day that can be picked, ISO. */
    max?: string;
    quickPicks?: boolean;
    disabled?: boolean;
    invalid?: boolean;
    id?: string;
    name?: string;
    /** Override "today" (ISO), e.g. the hauler's local day. */
    today?: string;
    teleportTo?: string | HTMLElement;
  }>(),
  {
    label: 'Date',
    placeholder: 'Pick a date',
    min: undefined,
    max: undefined,
    quickPicks: true,
    id: undefined,
    name: undefined,
    today: undefined,
    teleportTo: 'body',
  },
);

const emit = defineEmits<{ 'update:modelValue': [value: string]; open: []; close: [] }>();
const model = useModel<string | null>(() => props.modelValue, (v) => emit('update:modelValue', v ?? ''), null);

const uid = useId();
const base = `ov-date-${uid}`;
const { field, id: controlId, invalid: isInvalid, describedBy } = useControl(props, 'ov-date');
const triggerId = computed(() => (props.id || field ? controlId.value : `${base}-btn`));
const valueId = `${base}-v`;
const panelId = `${base}-panel`;
const titleId = `${base}-title`;

const open = ref(false);
const root = ref<HTMLElement | null>(null);
const trigger = ref<HTMLButtonElement | null>(null);
const panel = ref<HTMLElement | null>(null);
const view = ref(new Date());
const focusDate = ref(new Date());

const todayDate = computed(() => parseIsoDate(props.today ?? todayIso()) ?? new Date());
const minDate = computed(() => parseIsoDate(props.min));
const maxDate = computed(() => parseIsoDate(props.max));
const selectedDate = computed(() => parseIsoDate(model.value ?? undefined));
const blocked = (d: Date) => (!!minDate.value && d < minDate.value) || (!!maxDate.value && d > maxDate.value);

const display = computed(() => (selectedDate.value ? formatDate(selectedDate.value) : props.placeholder));
const triggerLabel = computed(() => `${props.label}, ${selectedDate.value ? formatDate(selectedDate.value, true) : 'not set'}`);

const weeks = computed(() => {
  const first = new Date(view.value.getFullYear(), view.value.getMonth(), 1);
  const start = addDays(first, -first.getDay());
  const sel = selectedDate.value ? toIsoDate(selectedDate.value) : '';
  const today = toIsoDate(todayDate.value);
  const foc = toIsoDate(focusDate.value);
  return Array.from({ length: 6 }, (_, w) =>
    Array.from({ length: 7 }, (_, k) => {
      const d = addDays(start, w * 7 + k);
      const iso = toIsoDate(d);
      return {
        iso,
        day: d.getDate(),
        out: d.getMonth() !== view.value.getMonth(),
        disabled: blocked(d),
        selected: iso === sel,
        today: iso === today,
        focused: iso === foc,
        label: `${formatDate(d, true)}${iso === today ? ', today' : ''}`,
      };
    }),
  );
});

const quick = computed(() => {
  if (!props.quickPicks) return [];
  const t = todayDate.value;
  const sat = addDays(t, (6 - t.getDay() + 7) % 7 || 7);
  return (
    [
      ['Today', t],
      ['Tomorrow', addDays(t, 1)],
      ['Saturday', sat],
    ] as Array<[string, Date]>
  )
    .filter(([, d]) => !blocked(d))
    .map(([label, d]) => ({ label, iso: toIsoDate(d) }));
});

const { place } = usePopover({
  open,
  root,
  trigger,
  panel,
  width: 300,
  onDismiss: (reason: PopoverCloseReason) => close(reason === 'outside' ? false : undefined),
});

function openPanel() {
  if (props.disabled || open.value) return;
  const min = minDate.value;
  const f = selectedDate.value ?? (min && min > todayDate.value ? min : todayDate.value);
  focusDate.value = f;
  view.value = new Date(f.getFullYear(), f.getMonth(), 1);
  open.value = true;
  emit('open');
}

function close(refocus?: boolean) {
  if (!open.value) return;
  const focusWasInside = !!panel.value && panel.value.contains(document.activeElement);
  open.value = false;
  emit('close');
  if (refocus === true || (refocus === undefined && focusWasInside)) trigger.value?.focus({ preventScroll: true });
}

function toggle() {
  if (open.value) close(true);
  else openPanel();
}

function focusDay() {
  nextTick(() => {
    const b = panel.value?.querySelector<HTMLButtonElement>(`[data-day="${toIsoDate(focusDate.value)}"]`);
    b?.focus({ preventScroll: true });
  });
}

function onMountFocus(e: Event) {
  e.preventDefault();
  focusDay();
}
function onUnmountFocus(e: Event) {
  e.preventDefault();
}

function pick(iso: string) {
  const d = parseIsoDate(iso);
  if (!d || blocked(d)) return;
  model.value = iso;
  close(true);
}

function step(months: number) {
  view.value = new Date(view.value.getFullYear(), view.value.getMonth() + months, 1);
  focusDate.value = new Date(view.value);
  nextTick(place);
}

function moveFocus(days: number, months = 0) {
  const f = new Date(focusDate.value);
  if (months) f.setMonth(f.getMonth() + months);
  else f.setDate(f.getDate() + days);
  focusDate.value = f;
  view.value = new Date(f.getFullYear(), f.getMonth(), 1);
  focusDay();
  nextTick(place);
}

function onDayKeydown(e: KeyboardEvent) {
  const map: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
  const k = e.key;
  if (map[k] != null) {
    e.preventDefault();
    moveFocus(map[k]);
  } else if (k === 'PageUp' || k === 'PageDown') {
    e.preventDefault();
    moveFocus(0, k === 'PageUp' ? -1 : 1);
  } else if (k === 'Home') {
    e.preventDefault();
    moveFocus(-focusDate.value.getDay());
  } else if (k === 'End') {
    e.preventDefault();
    moveFocus(6 - focusDate.value.getDay());
  }
}

function onPanelKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    close(true);
    return;
  }
  if (e.key === 'Tab' && panel.value) {
    const items = tabbables(panel.value);
    const t = e.target as HTMLElement;
    if (e.shiftKey && t === items[0]) {
      e.preventDefault();
      close(true);
    } else if (!e.shiftKey && t === items[items.length - 1]) {
      close(true);
    }
  }
}

defineExpose({ open: openPanel, close, focus: () => trigger.value?.focus() });
</script>

<template>
  <div ref="root" :class="['ov-date', { 'ov-date--invalid': isInvalid, 'ov-date--disabled': disabled }]">
    <button
      :id="triggerId"
      ref="trigger"
      type="button"
      class="ov-date__trigger"
      aria-haspopup="dialog"
      :aria-expanded="open ? 'true' : 'false'"
      :aria-controls="open ? panelId : undefined"
      :aria-labelledby="field ? `${field.labelId} ${valueId}` : undefined"
      :aria-label="field ? undefined : triggerLabel"
      :aria-describedby="describedBy"
      :aria-invalid="isInvalid ? 'true' : undefined"
      :disabled="disabled"
      @click="toggle"
      @keydown.down.prevent="openPanel"
    >
      <OvIcon name="calendarSmall" :size="18" />
      <span :id="valueId" :class="{ 'is-empty': !selectedDate }">{{ display }}</span>
    </button>
    <input v-if="name" type="hidden" :name="name" :value="model ?? ''" />
    <Teleport :to="teleportTo">
      <FocusScope v-if="open" as-child @mount-auto-focus="onMountFocus" @unmount-auto-focus="onUnmountFocus">
        <div
          :id="panelId"
          ref="panel"
          class="ov-date__panel"
          role="dialog"
          aria-modal="false"
          :aria-label="`Choose ${label.toLowerCase()}`"
          v-bind="LAYER_ATTRS"
          style="pointer-events: auto"
          @keydown="onPanelKeydown"
        >
          <div class="ov-date__head">
            <button type="button" class="ov-date__nav" aria-label="Previous month" @click="step(-1)">
              <OvIcon name="chevronLeft" :size="16" />
            </button>
            <p :id="titleId" class="ov-date__title" aria-live="polite">{{ MONTHS[view.getMonth()] }} {{ view.getFullYear() }}</p>
            <button type="button" class="ov-date__nav" aria-label="Next month" @click="step(1)">
              <OvIcon name="chevronRight" :size="16" />
            </button>
          </div>
          <table class="ov-date__grid" role="grid" :aria-labelledby="titleId">
            <thead>
              <tr>
                <th v-for="d in WEEKDAYS" :key="d[1]" scope="col" :abbr="d[1]">{{ d[0] }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(week, w) in weeks" :key="w">
                <td v-for="d in week" :key="d.iso">
                  <button
                    type="button"
                    :class="['ov-date__day', { 'is-out': d.out, 'is-today': d.today }]"
                    v-bind="{ 'data-day': d.iso }"
                    :tabindex="d.focused ? 0 : -1"
                    :aria-pressed="d.selected ? 'true' : 'false'"
                    :aria-disabled="d.disabled ? 'true' : undefined"
                    :aria-label="d.label"
                    @click="pick(d.iso)"
                    @keydown="onDayKeydown"
                  >
                    {{ d.day }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-if="quick.length" class="ov-date__quick">
            <button v-for="q in quick" :key="q.label" type="button" @click="pick(q.iso)">{{ q.label }}</button>
          </div>
        </div>
      </FocusScope>
    </Teleport>
  </div>
</template>
