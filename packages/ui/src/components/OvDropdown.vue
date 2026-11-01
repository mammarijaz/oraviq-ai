<script setup lang="ts" generic="V extends string | string[] | null = string">
import { computed, nextTick, ref, useId, watch } from 'vue';
import { FocusScope } from 'reka-ui';
import OvIcon from './OvIcon.vue';
import { useControl } from '../composables/useField';
import { useModel } from '../composables/useModel';
import { LAYER_ATTRS, tabbables, usePopover, type PopoverCloseReason } from '../composables/usePopover';
import type { DropdownOption } from '../utils/types';

/**
 * The modern select. Two looks:
 *  - filter (multi-check): pill trigger with the filter's name, a summary ("All", "Facebook +1") and a violet count;
 *    search above 7 options, a checkbox per option with icon and count, Select all / Clear / Done. Changes apply live.
 *  - field (single): input-shaped trigger; options may carry a hint line; the chosen one gets a violet tick; choosing closes.
 * The panel is teleported to <body> and positioned in the viewport, so it is never clipped, and flips above near the bottom.
 * Listbox pattern: aria-expanded, aria-multiselectable, aria-activedescendant.
 */
const props = withDefaults(
  defineProps<{
    /** string for a single field, string[] for a multi filter (empty = no filter). */
    modelValue?: V;
    options: DropdownOption[];
    multiple?: boolean;
    variant?: 'filter' | 'field';
    /** The filter's name ("Channel"), or the field's accessible name when it is not inside an OvField. */
    label: string;
    /** Summary when everything (or nothing) is chosen in a multi filter. */
    allLabel?: string;
    /** Shown when nothing is chosen in a single field. */
    placeholder?: string;
    /** Search box; on by default above 7 options. */
    searchable?: boolean;
    disabled?: boolean;
    invalid?: boolean;
    /** Full width (fields are always full width). */
    block?: boolean;
    id?: string;
    /** Adds hidden inputs so the value posts with a native form. */
    name?: string;
    /** Teleport target for the panel. */
    teleportTo?: string | HTMLElement;
  }>(),
  {
    multiple: false,
    variant: 'filter',
    allLabel: 'All',
    placeholder: 'Choose',
    searchable: undefined,
    id: undefined,
    name: undefined,
    teleportTo: 'body',
  },
);

const emit = defineEmits<{ 'update:modelValue': [value: V]; open: []; close: [] }>();
const model = useModel<V>(() => props.modelValue, (v) => emit('update:modelValue', v), (props.multiple ? [] : null) as V);

const uid = useId();
const base = `ov-dd-${uid}`;
const { field, id: controlId, invalid: isInvalid, describedBy } = useControl(props, 'ov-dd');
const triggerId = computed(() => (props.id || field ? controlId.value : `${base}-btn`));
const valueId = `${base}-v`;
const panelId = `${base}-panel`;
const listId = `${base}-list`;
const optId = (i: number) => `${base}-o${i}`;

const isField = computed(() => props.variant === 'field');
const isSearchable = computed(() => props.searchable ?? props.options.length > 7);

/* ---------------------------------------------------------------- value */
const selected = computed<string[]>(() => {
  const v = model.value as string | string[] | null | undefined;
  if (props.multiple) return Array.isArray(v) ? v.map(String) : v ? [String(v)] : [];
  return v == null || v === '' ? [] : [String(Array.isArray(v) ? v[0] ?? '' : v)].filter(Boolean);
});
const isSelected = (v: string) => selected.value.includes(v);

const summary = computed(() => {
  if (!props.multiple) {
    const hit = props.options.find((o) => o.value === selected.value[0]);
    return hit ? { text: hit.label, empty: false, partial: false, count: 1 } : { text: props.placeholder, empty: true, partial: false, count: 0 };
  }
  const chosen = props.options.filter((o) => isSelected(o.value));
  const partial = chosen.length > 0 && chosen.length < props.options.length;
  const first = chosen[0];
  const text = !partial || !first ? props.allLabel : chosen.length === 1 ? first.label : `${first.label} +${chosen.length - 1}`;
  return { text, empty: false, partial, count: chosen.length };
});

function commit(values: string[]) {
  // Keep option order, like the kit.
  const ordered = props.options.map((o) => o.value).filter((v) => values.includes(v));
  model.value = (props.multiple ? ordered : (ordered[0] ?? null)) as V;
}

/* ---------------------------------------------------------------- open state */
const open = ref(false);
const query = ref('');
const activeValue = ref<string | null>(null);
const root = ref<HTMLElement | null>(null);
const trigger = ref<HTMLButtonElement | null>(null);
const panel = ref<HTMLElement | null>(null);
const searchInput = ref<HTMLInputElement | null>(null);
const list = ref<HTMLElement | null>(null);

const visibleOptions = computed(() => {
  const q = query.value.trim().toLowerCase();
  return props.options
    .map((option, index) => ({ option, index }))
    .filter(({ option }) => !q || `${option.label} ${option.hint ?? ''} ${option.count ?? ''}`.toLowerCase().includes(q));
});
const enabledVisible = computed(() => visibleOptions.value.filter(({ option }) => !option.disabled));
const activeId = computed(() => {
  const hit = visibleOptions.value.find(({ option }) => option.value === activeValue.value);
  return hit ? optId(hit.index) : undefined;
});

const { place } = usePopover({
  open,
  root,
  trigger,
  panel,
  minWidth: 240,
  onDismiss: (reason: PopoverCloseReason) => close(reason === 'outside' ? false : undefined),
});

function openPanel(opts: { active?: 'first' | 'last' } = {}) {
  if (props.disabled || open.value) return;
  query.value = '';
  const sel = props.options.find((o) => isSelected(o.value) && !o.disabled);
  const enabled = props.options.filter((o) => !o.disabled);
  activeValue.value = opts.active === 'last' ? (enabled[enabled.length - 1]?.value ?? null) : (sel?.value ?? enabled[0]?.value ?? null);
  open.value = true;
  emit('open');
}

/** refocus: true = back to the trigger; false = leave focus alone; undefined = only if focus was inside the panel. */
function close(refocus?: boolean) {
  if (!open.value) return;
  const focusWasInside = !!panel.value && panel.value.contains(document.activeElement);
  open.value = false;
  activeValue.value = null;
  emit('close');
  if (refocus === true || (refocus === undefined && focusWasInside)) trigger.value?.focus({ preventScroll: true });
}

function toggle() {
  if (open.value) close(true);
  else openPanel();
}

function onMountFocus(e: Event) {
  e.preventDefault();
  (searchInput.value ?? list.value)?.focus({ preventScroll: true });
  scrollActiveIntoView();
}
function onUnmountFocus(e: Event) {
  // Focus return is handled by close().
  e.preventDefault();
}

/* ---------------------------------------------------------------- choosing */
function choose(option: DropdownOption) {
  if (option.disabled) return;
  if (props.multiple) {
    const next = isSelected(option.value) ? selected.value.filter((v) => v !== option.value) : [...selected.value, option.value];
    activeValue.value = option.value;
    commit(next);
  } else {
    commit([option.value]);
    close(true);
  }
}

function setAll(on: boolean) {
  const keep = props.options.filter((o) => o.disabled && isSelected(o.value)).map((o) => o.value);
  commit(on ? [...keep, ...props.options.filter((o) => !o.disabled).map((o) => o.value)] : keep);
}

/* ---------------------------------------------------------------- keyboard */
function scrollActiveIntoView() {
  nextTick(() => {
    const id = activeId.value;
    if (!id || !panel.value) return;
    const el = document.getElementById(id);
    if (el && panel.value.contains(el)) el.scrollIntoView?.({ block: 'nearest' });
  });
}

function move(step: number | 'first' | 'last') {
  const vis = enabledVisible.value;
  if (!vis.length) return;
  let i = vis.findIndex(({ option }) => option.value === activeValue.value);
  if (step === 'first') i = 0;
  else if (step === 'last') i = vis.length - 1;
  else i = i < 0 ? 0 : Math.min(vis.length - 1, Math.max(0, i + step));
  activeValue.value = vis[i]?.option.value ?? null;
  scrollActiveIntoView();
}

function onTriggerKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!open.value) openPanel({ active: e.key === 'ArrowUp' ? 'last' : undefined });
  }
}

function onPanelKeydown(e: KeyboardEvent) {
  const t = e.target as HTMLElement;
  const inSearch = t === searchInput.value;
  const onList = t === list.value;
  const k = e.key;
  if (k === 'ArrowDown') {
    e.preventDefault();
    move(1);
  } else if (k === 'ArrowUp') {
    e.preventDefault();
    move(-1);
  } else if ((k === 'Home' || k === 'End') && !inSearch) {
    e.preventDefault();
    move(k === 'Home' ? 'first' : 'last');
  } else if (k === 'Enter' && (inSearch || onList)) {
    e.preventDefault();
    const a = props.options.find((o) => o.value === activeValue.value);
    if (a) choose(a);
  } else if (k === ' ' && onList) {
    e.preventDefault();
    const a = props.options.find((o) => o.value === activeValue.value);
    if (a) choose(a);
  } else if (k === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    close(true);
  } else if (k === 'Tab') {
    onTab(e);
  } else if (onList && k.length === 1 && /\S/.test(k)) {
    const hit = enabledVisible.value.find(({ option }) => option.label.trim().toLowerCase().startsWith(k.toLowerCase()));
    if (hit) {
      activeValue.value = hit.option.value;
      scrollActiveIntoView();
    }
  }
}

/** The panel lives in <body>, so Tab out of it returns to the trigger and continues from there, as if it were inline. */
function onTab(e: KeyboardEvent) {
  const p = panel.value;
  if (!p) return;
  const items = tabbables(p);
  const t = e.target as HTMLElement;
  const first = items[0];
  const last = items[items.length - 1];
  const leavingForward = !e.shiftKey && (!props.multiple || t === last || (!items.includes(t) && t !== list.value));
  const leavingBack = e.shiftKey && (!props.multiple || t === first || t === list.value);
  if (leavingBack) {
    e.preventDefault();
    close(true);
  } else if (leavingForward) {
    // Let the browser move on from the trigger to the next control.
    close(true);
  }
}

watch(query, () => {
  activeValue.value = enabledVisible.value[0]?.option.value ?? null;
  nextTick(place);
});
watch(() => props.options, () => open.value && nextTick(place), { deep: true });

defineExpose({ open: openPanel, close, focus: () => trigger.value?.focus() });
</script>

<template>
  <div
    ref="root"
    :class="[
      'ov-dd',
      isField ? 'ov-dd--field' : 'ov-dd--filter',
      { 'ov-dd--block': block || isField, 'ov-dd--invalid': isInvalid, 'ov-dd--active': multiple && summary.partial, 'ov-dd--disabled': disabled },
    ]"
  >
    <button
      :id="triggerId"
      ref="trigger"
      type="button"
      class="ov-dd__trigger"
      aria-haspopup="listbox"
      :aria-expanded="open ? 'true' : 'false'"
      :aria-controls="open ? listId : undefined"
      :aria-labelledby="isField && field ? `${field.labelId} ${valueId}` : undefined"
      :aria-label="isField && !field ? `${label}, ${summary.text}` : undefined"
      :aria-describedby="describedBy"
      :aria-invalid="isField && isInvalid ? 'true' : undefined"
      :disabled="disabled"
      @click="toggle"
      @keydown="onTriggerKeydown"
    >
      <span v-if="!isField" class="ov-dd__name">{{ label }}</span>
      <span :id="valueId" :class="['ov-dd__value', { 'ov-dd__value--placeholder': summary.empty }]">{{ summary.text }}</span>
      <span v-if="multiple && summary.partial" class="ov-dd__count" :aria-label="`${summary.count} selected`">{{ summary.count }}</span>
      <OvIcon name="chevron" :size="16" class="ov-dd__chev" />
    </button>
    <template v-if="name">
      <input v-for="v in selected" :key="v" type="hidden" :name="name" :value="v" />
    </template>
    <Teleport :to="teleportTo">
      <FocusScope v-if="open" as-child @mount-auto-focus="onMountFocus" @unmount-auto-focus="onUnmountFocus">
        <div
          :id="panelId"
          ref="panel"
          :class="['ov-dd__panel', isField ? 'ov-dd__panel--field' : 'ov-dd__panel--filter']"
          v-bind="LAYER_ATTRS"
          style="pointer-events: auto"
          @keydown="onPanelKeydown"
        >
          <div v-if="isSearchable" class="ov-dd__search">
            <OvIcon name="search" :size="16" />
            <input
              ref="searchInput"
              v-model="query"
              type="text"
              class="ov-dd__q"
              placeholder="Search"
              :aria-label="`Search ${label.toLowerCase()}`"
              :aria-controls="listId"
              :aria-activedescendant="activeId"
              autocomplete="off"
              spellcheck="false"
            />
          </div>
          <ul
            :id="listId"
            ref="list"
            class="ov-dd__list"
            role="listbox"
            tabindex="-1"
            :aria-label="label"
            :aria-multiselectable="multiple ? 'true' : undefined"
            :aria-activedescendant="isSearchable ? undefined : activeId"
          >
            <li
              v-for="{ option, index } in visibleOptions"
              :id="optId(index)"
              :key="option.value"
              role="option"
              :class="['ov-dd__opt', { 'is-active': option.value === activeValue }]"
              :aria-selected="isSelected(option.value) ? 'true' : 'false'"
              :aria-disabled="option.disabled ? 'true' : undefined"
              v-bind="{ 'data-value': option.value }"
              @mousedown.prevent
              @pointermove="!option.disabled && activeValue !== option.value && (activeValue = option.value)"
              @click="choose(option)"
            >
              <span v-if="multiple" class="ov-dd__box"><OvIcon name="check" :size="14" /></span>
              <span v-if="option.icon" class="ov-dd__icon">
                <OvIcon v-if="typeof option.icon === 'string'" :name="option.icon" :size="16" />
                <component :is="option.icon" v-else />
              </span>
              <span class="ov-dd__text">
                <span class="ov-dd__olabel">{{ option.label }}</span>
                <span v-if="option.hint" class="ov-dd__hint">{{ option.hint }}</span>
              </span>
              <span v-if="option.count != null" class="ov-dd__ocount">{{ option.count }}</span>
              <OvIcon v-if="!multiple" name="tick" :size="16" class="ov-dd__tick" />
            </li>
          </ul>
          <p v-if="!visibleOptions.length" class="ov-dd__none" role="status">No matches</p>
          <div v-if="multiple" class="ov-dd__foot">
            <button type="button" class="ov-dd__link" @click="setAll(true)">Select all</button>
            <button type="button" class="ov-dd__link" :disabled="selected.length === 0" @click="setAll(false)">Clear</button>
            <button type="button" class="ov-dd__done" @click="close(true)">Done</button>
          </div>
        </div>
      </FocusScope>
    </Teleport>
  </div>
</template>
