<script setup lang="ts">
/** The page title with the violet diamond after it, a one-line subtitle, and a right-hand slot for a note or actions. */
withDefaults(defineProps<{ title: string; subtitle?: string; diamond?: boolean }>(), { subtitle: undefined, diamond: true });
</script>

<template>
  <header class="ov-page-head">
    <div class="ov-page-head__main">
      <h1 :class="['ov-page-head__title', { 'ov-page-head__title--plain': !diamond }]">{{ title }}</h1>
      <p v-if="subtitle || $slots.default" class="ov-page-head__sub"><slot>{{ subtitle }}</slot></p>
    </div>
    <div v-if="$slots.actions || $slots.right" class="ov-page-head__aside">
      <slot name="actions"><slot name="right" /></slot>
    </div>
  </header>
</template>
