<script setup lang="ts">
/**
 * A lavender block with a marker, a bold lead and a sentence. `needs` (violet diamond) is for what the owner must do;
 * `info`, `warning` and `danger` follow the status colours. Set `live` to announce it when it appears.
 */
withDefaults(defineProps<{ tone?: 'needs' | 'info' | 'warning' | 'danger'; title?: string; live?: boolean }>(), { tone: 'needs', title: undefined });
</script>

<template>
  <div :class="['ov-alert', `ov-alert--${tone}`]" :role="live ? (tone === 'danger' ? 'alert' : 'status') : undefined">
    <span class="ov-alert__marker" aria-hidden="true" />
    <div class="ov-alert__body">
      <p v-if="title" class="ov-alert__title">{{ title }}</p>
      <div class="ov-alert__text"><slot /></div>
    </div>
    <div v-if="$slots.actions" class="ov-alert__actions"><slot name="actions" /></div>
  </div>
</template>
