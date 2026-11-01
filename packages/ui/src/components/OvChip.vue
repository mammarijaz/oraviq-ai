<script setup lang="ts">
/** A toggle pill for quick filters ("Needs you", "Confirmed"). v-model is the pressed state. */
withDefaults(defineProps<{ disabled?: boolean; count?: number | string; size?: 'md' | 'sm' }>(), { count: undefined, size: 'md' });
const pressed = defineModel<boolean>({ default: false });
</script>

<template>
  <button
    type="button"
    :class="['ov-chip', { 'ov-chip--small': size === 'sm' }]"
    :aria-pressed="pressed ? 'true' : 'false'"
    :disabled="disabled"
    @click="pressed = !pressed"
  >
    <slot />
    <span v-if="count != null" class="ov-chip__count">{{ count }}</span>
  </button>
</template>
