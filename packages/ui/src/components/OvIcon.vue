<script setup lang="ts">
import { computed } from 'vue';
import { getIcon, type IconName } from '../icons';

const props = withDefaults(
  defineProps<{
    name: IconName;
    /** Rendered size in px (or any CSS length). */
    size?: number | string;
    /** Accessible name. Without it the icon is decorative (aria-hidden). */
    label?: string;
    strokeWidth?: number;
  }>(),
  { size: 20, label: undefined, strokeWidth: undefined },
);

const icon = computed(() => getIcon(props.name));
const px = computed(() => (typeof props.size === 'number' ? `${props.size}px` : props.size));
const sw = computed(() => props.strokeWidth ?? icon.value.sw ?? 1.75);
</script>

<template>
  <svg
    class="ov-icon"
    :viewBox="`0 0 ${icon.vb} ${icon.vb}`"
    :width="px"
    :height="px"
    fill="none"
    stroke="currentColor"
    :stroke-width="sw"
    stroke-linecap="round"
    stroke-linejoin="round"
    focusable="false"
    :role="label ? 'img' : undefined"
    :aria-label="label"
    :aria-hidden="label ? undefined : 'true'"
    v-html="icon.body"
  />
</template>
