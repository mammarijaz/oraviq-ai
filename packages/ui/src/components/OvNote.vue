<script setup lang="ts">
/** A one-line tinted note under a card or field: "Street placement may need a city permit." */
withDefaults(defineProps<{ tone?: 'info' | 'warning' | 'danger' }>(), { tone: 'info' });
</script>

<template>
  <p :class="['ov-note', `ov-note--${tone}`]"><slot /></p>
</template>
