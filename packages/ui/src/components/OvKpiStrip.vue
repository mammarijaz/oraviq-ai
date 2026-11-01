<script setup lang="ts">
/** Key numbers in boxes ruled with 1px graphite lines, like a spec sheet. Holds 2 to 4 OvKpi. */
withDefaults(defineProps<{ columns?: number; label?: string }>(), { columns: 4, label: undefined });
</script>

<template>
  <div class="ov-kpis" :style="{ '--ov-kpi-cols': columns }" :role="label ? 'group' : undefined" :aria-label="label">
    <slot />
  </div>
</template>
