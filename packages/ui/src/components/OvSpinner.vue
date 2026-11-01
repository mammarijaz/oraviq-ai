<script setup lang="ts">
withDefaults(
  defineProps<{
    size?: number;
    /** Announced to screen readers. Pass an empty string inside a button that already says it is busy. */
    label?: string;
  }>(),
  { size: 20, label: 'Loading' },
);
</script>

<template>
  <span class="ov-spinner" :role="label ? 'status' : undefined" :style="{ width: `${size}px`, height: `${size}px` }">
    <svg viewBox="0 0 24 24" :width="size" :height="size" aria-hidden="true" focusable="false">
      <circle class="ov-spinner__track" cx="12" cy="12" r="9" fill="none" stroke-width="2.5" />
      <circle class="ov-spinner__arc" cx="12" cy="12" r="9" fill="none" stroke-width="2.5" stroke-linecap="round" pathLength="100" stroke-dasharray="28 100" />
    </svg>
    <span v-if="label" class="ov-sr">{{ label }}</span>
  </span>
</template>
