<script setup lang="ts">
import { computed, nextTick, ref, useId } from 'vue';
import type { TabItem } from '../utils/types';
import { useModel } from '../composables/useModel';

/**
 * Underline tabs for places on one page. Arrow keys move and select, Home and End jump.
 * Put the panel content in the default slot (it receives { value }) and it is wired as the tabpanel;
 * or give items a `controls` id for panels you render yourself.
 */
const props = withDefaults(defineProps<{ modelValue?: string; items: TabItem[]; label: string; id?: string }>(), { modelValue: undefined, id: undefined });
const emit = defineEmits<{ 'update:modelValue': [value: string]; change: [value: string] }>();
const model = useModel<string>(() => props.modelValue, (v) => emit('update:modelValue', v), '');

const uid = useId();
const base = computed(() => props.id ?? `ov-tabs-${uid}`);
const tabId = (v: string) => `${base.value}-tab-${v}`;
const panelId = computed(() => `${base.value}-panel`);
const list = ref<HTMLElement | null>(null);

const current = computed(() => model.value || (props.items.find((t) => !t.disabled)?.value ?? ''));

function select(item: TabItem, focus = false) {
  if (item.disabled) return;
  if (item.value !== current.value) {
    model.value = item.value;
    emit('change', item.value);
  }
  if (focus) nextTick(() => list.value?.querySelector<HTMLElement>(`[data-tab="${item.value}"]`)?.focus());
}

function onKeydown(e: KeyboardEvent, i: number) {
  const enabled = props.items.map((t, idx) => ({ t, idx })).filter(({ t }) => !t.disabled);
  const pos = enabled.findIndex(({ idx }) => idx === i);
  let n: number | null = null;
  if (e.key === 'ArrowRight') n = pos + 1;
  else if (e.key === 'ArrowLeft') n = pos - 1;
  else if (e.key === 'Home') n = 0;
  else if (e.key === 'End') n = enabled.length - 1;
  if (n == null || !enabled.length) return;
  e.preventDefault();
  n = (n + enabled.length) % enabled.length;
  const next = enabled[n];
  if (next) select(next.t, true);
}
</script>

<template>
  <div class="ov-tabs-wrap">
    <div ref="list" class="ov-tabs" role="tablist" :aria-label="label">
      <button
        v-for="(t, i) in items"
        :id="tabId(t.value)"
        :key="t.value"
        type="button"
        role="tab"
        v-bind="{ 'data-tab': t.value }"
        :aria-selected="t.value === current ? 'true' : 'false'"
        :aria-controls="t.controls ?? ($slots.default ? panelId : undefined)"
        :tabindex="t.value === current ? 0 : -1"
        :disabled="t.disabled"
        @click="select(t)"
        @keydown="onKeydown($event, i)"
      >
        {{ t.label }}<span v-if="t.count != null" class="ov-tabs__count">{{ t.count }}</span>
      </button>
    </div>
    <div v-if="$slots.default" :id="panelId" class="ov-tabs__panel" role="tabpanel" :aria-labelledby="tabId(current)" tabindex="0">
      <slot :value="current" />
    </div>
  </div>
</template>
