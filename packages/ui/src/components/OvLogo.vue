<script setup lang="ts">
import { computed } from 'vue';
import { LOGO_PATHS, LOGO_VIEWBOX, MARK_PATHS, MARK_VIEWBOX } from '../assets/logo';

const props = withDefaults(
  defineProps<{
    /** full: graphite + violet on light grounds; reversed: white + light violet on night; mark: the linked rings alone; mono: one colour. */
    variant?: 'full' | 'mark' | 'reversed' | 'mark-reversed' | 'mono';
    /** Height in px (min 20 for the full logo, 16 for the mark). Width follows. */
    height?: number;
    /** Accessible name. Pass an empty string when the logo sits next to the same words. */
    label?: string;
  }>(),
  { variant: 'full', height: 32, label: undefined },
);

const isMark = computed(() => props.variant === 'mark' || props.variant === 'mark-reversed');
const viewBox = computed(() => (isMark.value ? MARK_VIEWBOX : LOGO_VIEWBOX));
const paths = computed(() => (isMark.value ? MARK_PATHS : LOGO_PATHS));
const ratio = computed(() => {
  const [, , w, h] = viewBox.value.split(' ').map(Number);
  return (w ?? 1) / (h ?? 1);
});
const name = computed(() => (props.label !== undefined ? props.label : isMark.value ? 'Oraviq' : 'Oraviq AI'));
const tone = computed(() => (props.variant === 'reversed' || props.variant === 'mark-reversed' ? 'reversed' : props.variant === 'mono' ? 'mono' : 'default'));
</script>

<template>
  <svg
    :class="['ov-logo', `ov-logo--${tone}`]"
    xmlns="http://www.w3.org/2000/svg"
    :viewBox="viewBox"
    :height="height"
    :width="Math.round(height * ratio)"
    focusable="false"
    :role="name ? 'img' : undefined"
    :aria-label="name || undefined"
    :aria-hidden="name ? undefined : 'true'"
  >
    <path v-for="(p, i) in paths" :key="i" :d="p.d" :class="p.tone === 'accent' ? 'ov-logo__accent' : 'ov-logo__ink'" />
  </svg>
</template>
