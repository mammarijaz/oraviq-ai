<script setup lang="ts">
withDefaults(defineProps<{ label: string; value: string | number; note?: string }>(), { note: undefined });
</script>

<template>
  <div class="ov-kpi">
    <p class="ov-kpi__label">{{ label }}</p>
    <p class="ov-kpi__n"><slot name="value">{{ value }}</slot></p>
    <p v-if="note || $slots.default" class="ov-kpi__note"><slot>{{ note }}</slot></p>
  </div>
</template>
