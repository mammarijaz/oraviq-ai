<script setup lang="ts">
/** The column that holds OvMessageBubble items. New messages are announced politely. */
withDefaults(defineProps<{ label?: string; live?: boolean }>(), { label: 'Conversation', live: true });
</script>

<template>
  <div class="ov-thread" role="log" :aria-label="label" :aria-live="live ? 'polite' : 'off'">
    <slot />
  </div>
</template>
